// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentID} from "./interfaces/IAgentID.sol";

/// @title Vouch
/// @notice Escrow between two parties who are identified by their Agent ID, with a small
/// on-chain track record per address.
///
/// Permissions, all of them: there are none. No owner, no admin, no pause switch, no upgrade
/// path, no fee, no rescue function. Funds only ever go to the seller, the buyer, or (after a
/// failed transfer) a balance that the same person can withdraw. The token allowlist and the
/// deal size limits are set once in the constructor and never change.
contract Vouch is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Open, // posted by the seller, waiting for a buyer to fund
        Funded, // buyer's money is in escrow, seller has until deliverBy
        Delivered, // seller says it is done, buyer is inside the review window
        Released, // buyer approved (or the window ran out), seller was paid
        Disputed, // buyer objected inside the window, split is being sorted out
        Settled, // dispute ended with a split
        Refunded, // seller missed the deadline, buyer got everything back
        Cancelled // seller pulled an unfunded deal
    }

    struct Deal {
        address seller;
        address buyer; // address(0) while the deal is open to any buyer
        address token;
        address arbiter; // optional, address(0) for none
        uint256 amount;
        uint64 deliverBy;
        uint64 deliveredAt;
        uint64 disputedAt;
        uint32 reviewSecs;
        uint16 proposedSellerBps;
        address proposer; // who made the standing split proposal, address(0) for none
        Status status;
        bool buyerNeedsAgentId;
        bytes32 termsHash;
        bytes32 proofHash;
        bytes32 evidenceHash;
    }

    struct CreateParams {
        address buyer;
        address token;
        uint256 amount;
        uint64 deliverBy;
        uint32 reviewSecs;
        bool buyerNeedsAgentId;
        address arbiter;
        bytes32 termsHash;
    }

    /// @dev Per-address history. Volume is normalised to 18 decimals so USDT and USDC add up.
    struct Record {
        uint32 completedAsSeller;
        uint32 completedAsBuyer;
        uint32 settledDisputes;
        uint32 disputesAgainst; // as seller, the buyer disputed
        uint32 disputesOpened; // as buyer
        uint32 missedDeadlines; // as seller
        uint128 volume;
        uint64 since; // first time this address showed up here, 0 if never
    }

    uint256 public constant BPS = 10_000;
    uint32 public constant MIN_REVIEW = 1 hours;
    uint32 public constant MAX_REVIEW = 14 days;
    uint64 public constant MAX_DELIVERY_HORIZON = 180 days;
    uint64 public constant DISPUTE_TIMEOUT = 7 days;

    IAgentID public immutable AGENT_ID;
    /// @dev Smallest and largest deal, in 18 decimal units.
    uint256 public immutable MIN_DEAL;
    uint256 public immutable MAX_DEAL;

    /// @dev 10**(18 - decimals) per allowed token, 0 means the token is not allowed.
    mapping(address token => uint256) public tokenScale;

    uint256 public dealCount;
    mapping(uint256 id => Deal) private _deals;
    mapping(address who => uint256[]) private _dealIdsOf;
    mapping(address who => Record) private _records;
    mapping(address who => bytes32) public profileOf;
    mapping(address token => mapping(address who => uint256)) public credit;

    event DealCreated(
        uint256 indexed id,
        address indexed seller,
        address indexed buyer,
        address token,
        uint256 amount,
        uint64 deliverBy,
        uint32 reviewSecs,
        bytes32 termsHash
    );
    event DealFunded(uint256 indexed id, address indexed buyer);
    event DealDelivered(uint256 indexed id, bytes32 proofHash, uint64 reviewEndsAt);
    event DealReleased(uint256 indexed id, address indexed seller, uint256 amount);
    event DealRefunded(uint256 indexed id, address indexed buyer, uint256 amount);
    event DealCancelled(uint256 indexed id);
    event DealDisputed(uint256 indexed id, bytes32 evidenceHash);
    event SplitProposed(uint256 indexed id, address indexed by, uint16 sellerBps);
    event DealSettled(uint256 indexed id, uint256 sellerAmount, uint256 buyerAmount);
    event Credited(address indexed token, address indexed to, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event ProfileOpened(address indexed who, bytes32 profileHash);

    error NotAgentIdHolder(address who);
    error TokenNotAllowed(address token);
    error AmountOutOfRange(uint256 amount);
    error BadDeadline();
    error BadReviewWindow();
    error BadParties();
    error NoSuchDeal(uint256 id);
    error WrongStatus(Status actual);
    error NotSeller();
    error NotBuyer();
    error NotNamedBuyer();
    error NotArbiter();
    error NotAParty();
    error DeadlinePassed();
    error DeadlineNotReached();
    error ReviewWindowOpen();
    error ReviewWindowClosed();
    error DisputeStillRunning();
    error NoProposal();
    error OwnProposal();
    error BadSplit();
    error UnexpectedTransferAmount();
    error NothingToWithdraw();
    error BadConstructorArgs();

    constructor(IAgentID agentId, address[] memory tokens, uint256 minDeal, uint256 maxDeal) {
        if (address(agentId) == address(0) || tokens.length == 0) revert BadConstructorArgs();
        if (minDeal == 0 || maxDeal < minDeal) revert BadConstructorArgs();
        AGENT_ID = agentId;
        MIN_DEAL = minDeal;
        MAX_DEAL = maxDeal;
        for (uint256 i; i < tokens.length; ++i) {
            address t = tokens[i];
            if (t == address(0) || tokenScale[t] != 0) revert BadConstructorArgs();
            uint8 dec = IERC20Metadata(t).decimals();
            if (dec > 18) revert BadConstructorArgs();
            tokenScale[t] = 10 ** (18 - dec);
        }
    }

    // ------------------------------------------------------------------
    // seller side
    // ------------------------------------------------------------------

    /// @notice Post a deal. The caller is the seller and must hold an Agent ID.
    function createDeal(CreateParams calldata p) external returns (uint256 id) {
        _requireHolder(msg.sender);

        uint256 scale = tokenScale[p.token];
        if (scale == 0) revert TokenNotAllowed(p.token);
        uint256 norm = p.amount * scale;
        if (norm < MIN_DEAL || norm > MAX_DEAL) revert AmountOutOfRange(p.amount);
        if (p.deliverBy <= block.timestamp || p.deliverBy > block.timestamp + MAX_DELIVERY_HORIZON)
        {
            revert BadDeadline();
        }
        if (p.reviewSecs < MIN_REVIEW || p.reviewSecs > MAX_REVIEW) revert BadReviewWindow();
        if (
            p.buyer == msg.sender || p.arbiter == msg.sender
                || (p.buyer != address(0) && p.buyer == p.arbiter)
        ) {
            revert BadParties();
        }

        id = ++dealCount;
        Deal storage d = _deals[id];
        d.seller = msg.sender;
        d.buyer = p.buyer;
        d.token = p.token;
        d.arbiter = p.arbiter;
        d.amount = p.amount;
        d.deliverBy = p.deliverBy;
        d.reviewSecs = p.reviewSecs;
        d.buyerNeedsAgentId = p.buyerNeedsAgentId;
        d.termsHash = p.termsHash;

        _touch(msg.sender);
        _dealIdsOf[msg.sender].push(id);
        if (p.buyer != address(0)) _dealIdsOf[p.buyer].push(id);

        emit DealCreated(
            id, msg.sender, p.buyer, p.token, p.amount, p.deliverBy, p.reviewSecs, p.termsHash
        );
    }

    /// @notice Pull an unfunded deal.
    function cancel(uint256 id) external {
        Deal storage d = _get(id);
        if (msg.sender != d.seller) revert NotSeller();
        _expect(d, Status.Open);
        d.status = Status.Cancelled;
        emit DealCancelled(id);
    }

    /// @notice Say the work is done. `proofHash` is a hash of whatever you handed over.
    function markDelivered(uint256 id, bytes32 proofHash) external {
        Deal storage d = _get(id);
        if (msg.sender != d.seller) revert NotSeller();
        _expect(d, Status.Funded);
        if (block.timestamp > d.deliverBy) revert DeadlinePassed();
        d.status = Status.Delivered;
        d.deliveredAt = uint64(block.timestamp);
        d.proofHash = proofHash;
        emit DealDelivered(id, proofHash, uint64(block.timestamp) + d.reviewSecs);
    }

    // ------------------------------------------------------------------
    // buyer side
    // ------------------------------------------------------------------

    /// @notice Put the money in escrow. Needs an exact-amount approval on the token first.
    function fund(uint256 id) external nonReentrant {
        Deal storage d = _get(id);
        _expect(d, Status.Open);
        if (block.timestamp >= d.deliverBy) revert DeadlinePassed();
        if (msg.sender == d.seller || msg.sender == d.arbiter) revert BadParties();

        if (d.buyer == address(0)) {
            d.buyer = msg.sender;
            _dealIdsOf[msg.sender].push(id);
        } else if (d.buyer != msg.sender) {
            revert NotNamedBuyer();
        }
        if (d.buyerNeedsAgentId) _requireHolder(msg.sender);

        IERC20 token = IERC20(d.token);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), d.amount);
        if (token.balanceOf(address(this)) - before != d.amount) revert UnexpectedTransferAmount();

        d.status = Status.Funded;
        _touch(msg.sender);
        emit DealFunded(id, msg.sender);
    }

    /// @notice Happy ending: the buyer is satisfied and the seller is paid.
    function approve(uint256 id) external nonReentrant {
        Deal storage d = _get(id);
        if (msg.sender != d.buyer) revert NotBuyer();
        _expect(d, Status.Delivered);
        _release(id, d);
    }

    /// @notice The buyer went quiet. Once the review window is over anyone can pay the seller.
    function releaseAfterWindow(uint256 id) external nonReentrant {
        Deal storage d = _get(id);
        _expect(d, Status.Delivered);
        if (block.timestamp <= uint256(d.deliveredAt) + d.reviewSecs) revert ReviewWindowOpen();
        _release(id, d);
    }

    /// @notice The seller never delivered. Once the deadline is past anyone can send the money
    /// back to the buyer.
    function refundExpired(uint256 id) external nonReentrant {
        Deal storage d = _get(id);
        _expect(d, Status.Funded);
        if (block.timestamp <= d.deliverBy) revert DeadlineNotReached();
        d.status = Status.Refunded;
        _records[d.seller].missedDeadlines++;
        emit DealRefunded(id, d.buyer, d.amount);
        _pay(d.token, d.buyer, d.amount);
    }

    /// @notice Object to a delivery, inside the review window.
    function dispute(uint256 id, bytes32 evidenceHash) external {
        Deal storage d = _get(id);
        if (msg.sender != d.buyer) revert NotBuyer();
        _expect(d, Status.Delivered);
        if (block.timestamp > uint256(d.deliveredAt) + d.reviewSecs) revert ReviewWindowClosed();
        d.status = Status.Disputed;
        d.disputedAt = uint64(block.timestamp);
        d.evidenceHash = evidenceHash;
        _records[d.buyer].disputesOpened++;
        _records[d.seller].disputesAgainst++;
        emit DealDisputed(id, evidenceHash);
    }

    // ------------------------------------------------------------------
    // dispute resolution
    // ------------------------------------------------------------------

    /// @notice Either side can put a split on the table. The newest proposal replaces the old one.
    /// @param sellerBps seller's share in basis points, 0 to 10000.
    function proposeSplit(uint256 id, uint16 sellerBps) external {
        Deal storage d = _get(id);
        if (msg.sender != d.seller && msg.sender != d.buyer) revert NotAParty();
        _expect(d, Status.Disputed);
        if (sellerBps > BPS) revert BadSplit();
        d.proposer = msg.sender;
        d.proposedSellerBps = sellerBps;
        emit SplitProposed(id, msg.sender, sellerBps);
    }

    /// @notice Accept the other side's standing proposal.
    function acceptSplit(uint256 id) external nonReentrant {
        Deal storage d = _get(id);
        if (msg.sender != d.seller && msg.sender != d.buyer) revert NotAParty();
        _expect(d, Status.Disputed);
        if (d.proposer == address(0)) revert NoProposal();
        if (d.proposer == msg.sender) revert OwnProposal();
        _settle(id, d, d.proposedSellerBps);
    }

    /// @notice The arbiter named when the deal was created can decide the split.
    function arbiterResolve(uint256 id, uint16 sellerBps) external nonReentrant {
        Deal storage d = _get(id);
        if (d.arbiter == address(0) || msg.sender != d.arbiter) revert NotArbiter();
        _expect(d, Status.Disputed);
        if (sellerBps > BPS) revert BadSplit();
        _settle(id, d, sellerBps);
    }

    /// @notice Nobody agreed within DISPUTE_TIMEOUT. Anyone can trigger an even split.
    function settleAfterTimeout(uint256 id) external nonReentrant {
        Deal storage d = _get(id);
        _expect(d, Status.Disputed);
        if (block.timestamp <= uint256(d.disputedAt) + DISPUTE_TIMEOUT) {
            revert DisputeStillRunning();
        }
        _settle(id, d, uint16(BPS / 2));
    }

    // ------------------------------------------------------------------
    // misc
    // ------------------------------------------------------------------

    /// @notice Collect money that could not be sent to you when a deal ended, for example
    /// because the token blocked your address at the time.
    function withdraw(address token) external nonReentrant {
        uint256 amount = credit[token][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        credit[token][msg.sender] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(token, msg.sender, amount);
    }

    /// @notice Publish a hash of a short public profile (what you offer, how to reach you).
    /// Holders only. The text lives off-chain, this just pins what it should hash to.
    function openProfile(bytes32 profileHash) external {
        _requireHolder(msg.sender);
        profileOf[msg.sender] = profileHash;
        _touch(msg.sender);
        emit ProfileOpened(msg.sender, profileHash);
    }

    // ------------------------------------------------------------------
    // views
    // ------------------------------------------------------------------

    function getDeal(uint256 id) external view returns (Deal memory) {
        return _get(id);
    }

    function reviewEndsAt(uint256 id) external view returns (uint256) {
        Deal storage d = _get(id);
        if (d.deliveredAt == 0) return 0;
        return uint256(d.deliveredAt) + d.reviewSecs;
    }

    function trackRecord(address who) external view returns (Record memory) {
        return _records[who];
    }

    function dealCountOf(address who) external view returns (uint256) {
        return _dealIdsOf[who].length;
    }

    /// @notice Deal ids an address is part of, oldest first.
    function dealIdsOf(address who, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids)
    {
        uint256[] storage all = _dealIdsOf[who];
        if (offset >= all.length) return ids;
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        ids = new uint256[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            ids[i - offset] = all[i];
        }
    }

    /// @notice Convenience for the UI: does this address hold an Agent ID, and what is the handle.
    function agentIdOf(address who) external view returns (bool holds, string memory handle) {
        if (who == address(0)) return (false, "");
        holds = AGENT_ID.balanceOf(who) > 0;
        if (holds) handle = AGENT_ID.handleOf(who);
    }

    // ------------------------------------------------------------------
    // internals
    // ------------------------------------------------------------------

    function _get(uint256 id) private view returns (Deal storage d) {
        if (id == 0 || id > dealCount) revert NoSuchDeal(id);
        d = _deals[id];
    }

    function _expect(Deal storage d, Status want) private view {
        if (d.status != want) revert WrongStatus(d.status);
    }

    function _requireHolder(address who) private view {
        if (AGENT_ID.balanceOf(who) == 0) revert NotAgentIdHolder(who);
    }

    function _touch(address who) private {
        if (_records[who].since == 0) _records[who].since = uint64(block.timestamp);
    }

    function _addVolume(address who, address token, uint256 amount) private {
        _records[who].volume += uint128(amount * tokenScale[token]);
    }

    function _release(uint256 id, Deal storage d) private {
        d.status = Status.Released;
        _records[d.seller].completedAsSeller++;
        _records[d.buyer].completedAsBuyer++;
        _addVolume(d.seller, d.token, d.amount);
        _addVolume(d.buyer, d.token, d.amount);
        emit DealReleased(id, d.seller, d.amount);
        _pay(d.token, d.seller, d.amount);
    }

    function _settle(uint256 id, Deal storage d, uint16 sellerBps) private {
        uint256 sellerAmount = (d.amount * sellerBps) / BPS;
        uint256 buyerAmount = d.amount - sellerAmount;
        d.status = Status.Settled;
        _records[d.seller].settledDisputes++;
        _records[d.buyer].settledDisputes++;
        _addVolume(d.seller, d.token, d.amount);
        _addVolume(d.buyer, d.token, d.amount);
        emit DealSettled(id, sellerAmount, buyerAmount);
        _pay(d.token, d.seller, sellerAmount);
        _pay(d.token, d.buyer, buyerAmount);
    }

    /// @dev Try to send tokens. If the token refuses, park the amount as credit instead so one
    /// blocked address can never trap the other side's money.
    function _pay(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (ok && (ret.length == 0 || (ret.length >= 32 && abi.decode(ret, (bool))))) return;
        credit[token][to] += amount;
        emit Credited(token, to, amount);
    }
}
