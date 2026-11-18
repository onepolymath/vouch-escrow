// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vouch} from "../src/Vouch.sol";
import {MockAgentID} from "../src/mocks/MockAgentID.sol";
import {MockUSD} from "../src/mocks/MockUSD.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";

abstract contract Base is Test {
    Vouch internal vouch;
    MockAgentID internal agent;
    MockUSD internal usdt;
    MockUSD internal usdc;

    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal arbiter = makeAddr("arbiter");
    address internal outsider = makeAddr("outsider"); // never gets an Agent ID

    uint256 internal constant MIN = 1 ether;
    uint256 internal constant MAX = 1_000 ether;
    uint256 internal constant AMOUNT = 100 ether;
    uint32 internal constant REVIEW = 2 days;

    bytes32 internal constant TERMS = keccak256("three logo options, two rounds of edits");
    bytes32 internal constant PROOF = keccak256("https://example.com/delivery");
    bytes32 internal constant EVIDENCE = keccak256("it was not what we agreed");

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        agent = new MockAgentID();
        usdt = new MockUSD("Tether USD", "USDT");
        usdc = new MockUSD("USD Coin", "USDC");
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdt);
        tokens[1] = address(usdc);
        vouch = new Vouch(IAgentID(address(agent)), tokens, MIN, MAX);

        agent.register(seller, "mira");
        agent.register(buyer, "tobi");
        agent.register(arbiter, "judge");

        usdt.mint(buyer, 10_000 ether);
        usdt.mint(outsider, 10_000 ether);
    }

    function _params() internal view returns (Vouch.CreateParams memory p) {
        p = Vouch.CreateParams({
            buyer: address(0),
            token: address(usdt),
            amount: AMOUNT,
            deliverBy: uint64(block.timestamp + 7 days),
            reviewSecs: REVIEW,
            buyerNeedsAgentId: true,
            arbiter: address(0),
            termsHash: TERMS
        });
    }

    function _create(Vouch.CreateParams memory p) internal returns (uint256 id) {
        vm.prank(seller);
        id = vouch.createDeal(p);
    }

    function _fundAs(address who, uint256 id) internal {
        Vouch.Deal memory d = vouch.getDeal(id);
        vm.startPrank(who);
        MockUSD(d.token).approve(address(vouch), d.amount);
        vouch.fund(id);
        vm.stopPrank();
    }

    function _openAndFunded() internal returns (uint256 id) {
        id = _create(_params());
        _fundAs(buyer, id);
    }

    function _delivered() internal returns (uint256 id) {
        id = _openAndFunded();
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);
    }

    function _disputed() internal returns (uint256 id) {
        id = _delivered();
        vm.prank(buyer);
        vouch.dispute(id, EVIDENCE);
    }

    function _status(uint256 id) internal view returns (Vouch.Status) {
        return vouch.getDeal(id).status;
    }
}
