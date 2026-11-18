// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Vouch} from "../src/Vouch.sol";
import {MockAgentID} from "../src/mocks/MockAgentID.sol";
import {MockUSD} from "../src/mocks/MockUSD.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";

/// Throws random but plausible actions at the contract. Most calls revert, which is fine, the
/// point is that whatever does go through leaves the books balanced.
contract Handler is Test {
    Vouch public vouch;
    MockUSD public usdt;
    address[] public sellers;
    address[] public buyers;
    address public arbiter;
    uint256[] public ids;

    uint256 public ghostFundedIn;
    mapping(uint256 => Vouch.Status) public lastSeen;

    constructor(Vouch v, MockUSD t, MockAgentID agent) {
        vouch = v;
        usdt = t;
        arbiter = makeAddr("arbiter");
        for (uint256 i; i < 3; ++i) {
            address s = makeAddr(string.concat("seller", vm.toString(i)));
            address b = makeAddr(string.concat("buyer", vm.toString(i)));
            agent.register(s, string.concat("seller", vm.toString(i)));
            agent.register(b, string.concat("buyer", vm.toString(i)));
            sellers.push(s);
            buyers.push(b);
            t.mint(b, 1_000_000 ether);
            vm.prank(b);
            t.approve(address(v), type(uint256).max);
        }
    }

    function idsLength() external view returns (uint256) {
        return ids.length;
    }

    function create(uint256 sellerSeed, uint256 amountSeed, bool withArbiter, bool named) external {
        address s = sellers[sellerSeed % sellers.length];
        Vouch.CreateParams memory p = Vouch.CreateParams({
            buyer: named ? buyers[amountSeed % buyers.length] : address(0),
            token: address(usdt),
            amount: bound(amountSeed, 1 ether, 1_000 ether),
            deliverBy: uint64(block.timestamp + 1 + (amountSeed % 10 days)),
            reviewSecs: uint32(1 hours + (amountSeed % 5 days)),
            buyerNeedsAgentId: true,
            arbiter: withArbiter ? arbiter : address(0),
            termsHash: bytes32(amountSeed)
        });
        vm.prank(s);
        try vouch.createDeal(p) returns (uint256 id) {
            ids.push(id);
        } catch {}
    }

    function fund(uint256 idSeed, uint256 buyerSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        uint256 amount = vouch.getDeal(id).amount;
        vm.prank(buyers[buyerSeed % buyers.length]);
        try vouch.fund(id) {
            ghostFundedIn += amount;
        } catch {}
    }

    function deliver(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        vm.prank(vouch.getDeal(id).seller);
        try vouch.markDelivered(id, bytes32(idSeed)) {} catch {}
    }

    function approve(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        vm.prank(vouch.getDeal(id).buyer);
        try vouch.approve(id) {} catch {}
    }

    function release(uint256 idSeed) external {
        if (ids.length == 0) return;
        try vouch.releaseAfterWindow(ids[idSeed % ids.length]) {} catch {}
    }

    function refund(uint256 idSeed) external {
        if (ids.length == 0) return;
        try vouch.refundExpired(ids[idSeed % ids.length]) {} catch {}
    }

    function dispute(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        vm.prank(vouch.getDeal(id).buyer);
        try vouch.dispute(id, bytes32(idSeed)) {} catch {}
    }

    function propose(uint256 idSeed, uint16 bps, bool bySeller) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        Vouch.Deal memory d = vouch.getDeal(id);
        vm.prank(bySeller ? d.seller : d.buyer);
        try vouch.proposeSplit(id, uint16(bound(bps, 0, 10_000))) {} catch {}
    }

    function accept(uint256 idSeed, bool bySeller) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        Vouch.Deal memory d = vouch.getDeal(id);
        vm.prank(bySeller ? d.seller : d.buyer);
        try vouch.acceptSplit(id) {} catch {}
    }

    function arbitrate(uint256 idSeed, uint16 bps) external {
        if (ids.length == 0) return;
        vm.prank(arbiter);
        try vouch.arbiterResolve(ids[idSeed % ids.length], uint16(bound(bps, 0, 10_000))) {}
            catch {}
    }

    function timeout(uint256 idSeed) external {
        if (ids.length == 0) return;
        try vouch.settleAfterTimeout(ids[idSeed % ids.length]) {} catch {}
    }

    function cancel(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length];
        vm.prank(vouch.getDeal(id).seller);
        try vouch.cancel(id) {} catch {}
    }

    function passTime(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 10 days));
    }

    function remember() external {
        for (uint256 i; i < ids.length; ++i) {
            lastSeen[ids[i]] = vouch.getDeal(ids[i]).status;
        }
    }
}

contract InvariantTest is StdInvariant, Test {
    Vouch internal vouch;
    MockUSD internal usdt;
    Handler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        MockAgentID agent = new MockAgentID();
        usdt = new MockUSD("Tether USD", "USDT");
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdt);
        vouch = new Vouch(IAgentID(address(agent)), tokens, 1 ether, 1_000 ether);
        handler = new Handler(vouch, usdt, agent);
        targetContract(address(handler));
    }

    function _held() internal view returns (uint256 total) {
        uint256 n = handler.idsLength();
        for (uint256 i; i < n; ++i) {
            Vouch.Deal memory d = vouch.getDeal(handler.ids(i));
            if (
                d.status == Vouch.Status.Funded || d.status == Vouch.Status.Delivered
                    || d.status == Vouch.Status.Disputed
            ) total += d.amount;
        }
    }

    /// The contract holds exactly the money of deals that are still running.
    function invariant_balanceMatchesLiveDeals() public view {
        assertEq(usdt.balanceOf(address(vouch)), _held());
    }

    /// With a well-behaved token nothing ever lands in the credit ledger.
    function invariant_noCreditWithNormalToken() public view {
        for (uint256 i; i < 3; ++i) {
            assertEq(vouch.credit(address(usdt), handler.sellers(i)), 0);
            assertEq(vouch.credit(address(usdt), handler.buyers(i)), 0);
        }
    }

    /// Once a deal reaches an end state it never moves again.
    function invariant_endStatesAreFinal() public {
        uint256 n = handler.idsLength();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.ids(i);
            Vouch.Status was = handler.lastSeen(id);
            Vouch.Status now_ = vouch.getDeal(id).status;
            if (
                was == Vouch.Status.Released || was == Vouch.Status.Settled
                    || was == Vouch.Status.Refunded || was == Vouch.Status.Cancelled
            ) {
                assertEq(uint8(now_), uint8(was));
            }
        }
        handler.remember();
    }

    /// Every funded token is either still inside or was paid out to a party.
    function invariant_nothingCreatedOrLost() public view {
        uint256 paidOut;
        for (uint256 i; i < 3; ++i) {
            paidOut += usdt.balanceOf(handler.sellers(i));
        }
        uint256 buyersNow;
        for (uint256 i; i < 3; ++i) {
            buyersNow += usdt.balanceOf(handler.buyers(i));
        }
        uint256 buyersStart = 3 * 1_000_000 ether;
        // buyers + sellers + contract hold all the money that ever existed
        assertEq(paidOut + buyersNow + usdt.balanceOf(address(vouch)), buyersStart);
        // and what left the buyers is accounted for by the live deals plus what sellers got
        assertGe(handler.ghostFundedIn(), usdt.balanceOf(address(vouch)));
    }

    /// Completed counts on seller records match the deals that really ended in Released.
    function invariant_recordsMatchDeals() public view {
        uint256 released;
        uint256 n = handler.idsLength();
        for (uint256 i; i < n; ++i) {
            if (vouch.getDeal(handler.ids(i)).status == Vouch.Status.Released) released++;
        }
        uint256 sold;
        uint256 bought;
        for (uint256 i; i < 3; ++i) {
            sold += vouch.trackRecord(handler.sellers(i)).completedAsSeller;
            bought += vouch.trackRecord(handler.buyers(i)).completedAsBuyer;
        }
        assertEq(sold, released);
        assertEq(bought, released);
    }
}
