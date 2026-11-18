// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Base} from "./Base.t.sol";
import {Vouch} from "../src/Vouch.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {TestToken, ITokenReceiver} from "./mocks/TestToken.sol";

/// A seller that is a contract and tries to call back into Vouch when it gets paid.
contract GreedySeller is ITokenReceiver {
    Vouch public vouch;
    uint256 public dealId;
    address public token;
    bool public attempted;
    bool public reentered;

    constructor(Vouch v) {
        vouch = v;
    }

    function create(Vouch.CreateParams calldata p) external returns (uint256) {
        token = p.token;
        dealId = vouch.createDeal(p);
        return dealId;
    }

    function deliver() external {
        vouch.markDelivered(dealId, bytes32("done"));
    }

    function onTokenReceived() external {
        attempted = true;
        try vouch.releaseAfterWindow(dealId) {
            reentered = true;
        } catch {}
        try vouch.withdraw(token) {
            reentered = true;
        } catch {}
    }
}

contract PayoutTest is Base {
    TestToken internal tt;
    Vouch internal v;

    function _setupWith(TestToken t) internal {
        tt = t;
        address[] memory toks = new address[](1);
        toks[0] = address(t);
        v = new Vouch(IAgentID(address(agent)), toks, MIN, MAX);
    }

    function _flowToDelivered(address sellerAddr) internal returns (uint256 id) {
        Vouch.CreateParams memory p = _params();
        p.token = address(tt);
        vm.prank(sellerAddr);
        id = v.createDeal(p);
        tt.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        tt.approve(address(v), AMOUNT);
        v.fund(id);
        vm.stopPrank();
        vm.prank(sellerAddr);
        v.markDelivered(id, PROOF);
    }

    function test_blockedSellerGetsCreditInsteadOfTrappingTheDeal_revertingToken() public {
        _setupWith(new TestToken(18));
        uint256 id = _flowToDelivered(seller);
        tt.setBlocked(seller, true);

        vm.expectEmit(true, true, false, true);
        emit Vouch.Credited(address(tt), seller, AMOUNT);
        vm.prank(buyer);
        v.approve(id);

        assertEq(uint8(v.getDeal(id).status), uint8(Vouch.Status.Released));
        assertEq(tt.balanceOf(seller), 0);
        assertEq(v.credit(address(tt), seller), AMOUNT);

        // still blocked: the withdrawal fails and the credit stays put
        vm.prank(seller);
        vm.expectRevert();
        v.withdraw(address(tt));
        assertEq(v.credit(address(tt), seller), AMOUNT);

        tt.setBlocked(seller, false);
        vm.expectEmit(true, true, false, true);
        emit Vouch.Withdrawn(address(tt), seller, AMOUNT);
        vm.prank(seller);
        v.withdraw(address(tt));
        assertEq(tt.balanceOf(seller), AMOUNT);
        assertEq(v.credit(address(tt), seller), 0);
    }

    function test_blockedSellerGetsCredit_tokenReturningFalse() public {
        _setupWith(new TestToken(18));
        tt.setSoftFail(true);
        uint256 id = _flowToDelivered(seller);
        tt.setBlocked(seller, true);
        vm.prank(buyer);
        v.approve(id);
        assertEq(v.credit(address(tt), seller), AMOUNT);
    }

    function test_oneBlockedPartyDoesNotTrapTheOther() public {
        _setupWith(new TestToken(18));
        uint256 id = _flowToDelivered(seller);
        vm.prank(buyer);
        v.dispute(id, EVIDENCE);
        vm.prank(seller);
        v.proposeSplit(id, 6_000);
        tt.setBlocked(seller, true);
        vm.prank(buyer);
        v.acceptSplit(id);

        assertEq(tt.balanceOf(buyer), 40 ether); // paid straight away
        assertEq(v.credit(address(tt), seller), 60 ether); // parked for the seller
        assertEq(tt.balanceOf(address(v)), 60 ether);
    }

    function test_blockedBuyerRefundBecomesCredit() public {
        _setupWith(new TestToken(18));
        Vouch.CreateParams memory p = _params();
        p.token = address(tt);
        vm.prank(seller);
        uint256 id = v.createDeal(p);
        tt.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        tt.approve(address(v), AMOUNT);
        v.fund(id);
        vm.stopPrank();

        tt.setBlocked(buyer, true);
        vm.warp(block.timestamp + 8 days);
        v.refundExpired(id);
        assertEq(v.credit(address(tt), buyer), AMOUNT);
    }

    function test_withdrawWithNothingReverts() public {
        vm.prank(seller);
        vm.expectRevert(Vouch.NothingToWithdraw.selector);
        vouch.withdraw(address(usdt));
    }

    function test_cannotReenterWhileBeingPaid() public {
        _setupWith(new TestToken(18));
        tt.setCallbacks(true);

        GreedySeller greedy = new GreedySeller(v);
        agent.register(address(greedy), "greedy");

        Vouch.CreateParams memory p = _params();
        p.token = address(tt);
        uint256 id = greedy.create(p);
        tt.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        tt.approve(address(v), AMOUNT);
        v.fund(id);
        vm.stopPrank();
        greedy.deliver();

        vm.prank(buyer);
        v.approve(id);

        assertTrue(greedy.attempted());
        assertFalse(greedy.reentered());
        assertEq(tt.balanceOf(address(greedy)), AMOUNT);
        assertEq(tt.balanceOf(address(v)), 0);
    }
}

contract ProfileAndViewsTest is Base {
    function test_holderOpensProfile() public {
        bytes32 h = keccak256("I make logos. ping me on telegram");
        vm.expectEmit(true, false, false, true);
        emit Vouch.ProfileOpened(seller, h);
        vm.prank(seller);
        vouch.openProfile(h);
        assertEq(vouch.profileOf(seller), h);
        assertEq(vouch.trackRecord(seller).since, block.timestamp);
    }

    function test_profileCanBeUpdated() public {
        vm.startPrank(seller);
        vouch.openProfile(bytes32(uint256(1)));
        vouch.openProfile(bytes32(uint256(2)));
        vm.stopPrank();
        assertEq(vouch.profileOf(seller), bytes32(uint256(2)));
    }

    function test_nonHolderCannotOpenProfile() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Vouch.NotAgentIdHolder.selector, outsider));
        vouch.openProfile(bytes32(uint256(1)));
    }

    function test_firstSeenDoesNotMove() public {
        vm.prank(seller);
        vouch.openProfile(bytes32(uint256(1)));
        uint256 first = block.timestamp;
        vm.warp(block.timestamp + 5 days);
        _create(_params());
        assertEq(vouch.trackRecord(seller).since, first);
    }

    function test_agentIdOf() public view {
        (bool holds, string memory handle) = vouch.agentIdOf(seller);
        assertTrue(holds);
        assertEq(handle, "mira");

        (holds, handle) = vouch.agentIdOf(outsider);
        assertFalse(holds);
        assertEq(handle, "");

        (holds, handle) = vouch.agentIdOf(address(0));
        assertFalse(holds);
    }

    function test_dealIdsPagination() public {
        for (uint256 i; i < 5; ++i) {
            _create(_params());
        }
        assertEq(vouch.dealCountOf(seller), 5);

        uint256[] memory page = vouch.dealIdsOf(seller, 0, 2);
        assertEq(page.length, 2);
        assertEq(page[0], 1);
        assertEq(page[1], 2);

        page = vouch.dealIdsOf(seller, 3, 10);
        assertEq(page.length, 2);
        assertEq(page[0], 4);
        assertEq(page[1], 5);

        assertEq(vouch.dealIdsOf(seller, 5, 10).length, 0);
        assertEq(vouch.dealIdsOf(seller, 99, 10).length, 0);
        assertEq(vouch.dealIdsOf(outsider, 0, 10).length, 0);
    }

    function test_trackRecordIsEmptyForStrangers() public view {
        Vouch.Record memory r = vouch.trackRecord(outsider);
        assertEq(r.since, 0);
        assertEq(r.volume, 0);
        assertEq(r.completedAsSeller, 0);
    }

    function test_recordsBuildUpOverSeveralDeals() public {
        for (uint256 i; i < 3; ++i) {
            uint256 id = _delivered();
            vm.prank(buyer);
            vouch.approve(id);
        }
        Vouch.Record memory r = vouch.trackRecord(seller);
        assertEq(r.completedAsSeller, 3);
        assertEq(r.volume, 3 * AMOUNT);
    }

    function test_neverAcceptsNativeBnb() public {
        (bool ok,) = address(vouch).call{value: 1 ether}("");
        assertFalse(ok);
    }
}

contract MockAgentIDTest is Base {
    function test_claimAndRead() public {
        address who = makeAddr("who");
        vm.prank(who);
        agent.claim("someone");
        assertEq(agent.balanceOf(who), 1);
        assertEq(agent.handleOf(who), "someone");
        assertEq(agent.ownerOfHandle("someone"), who);
    }

    function test_oneHandlePerAddress() public {
        vm.prank(seller);
        vm.expectRevert(bytes4(keccak256("AlreadyClaimed()")));
        agent.claim("another");
    }

    function test_handlesAreUnique() public {
        vm.prank(outsider);
        vm.expectRevert(bytes4(keccak256("HandleTaken()")));
        agent.claim("mira");
    }

    function test_balanceOfZeroAddressReverts() public {
        vm.expectRevert(bytes4(keccak256("ZeroAddress()")));
        agent.balanceOf(address(0));
    }

    function test_handleRules() public {
        vm.startPrank(outsider);
        vm.expectRevert(bytes4(keccak256("BadHandle()")));
        agent.claim("ab");
        vm.expectRevert(bytes4(keccak256("BadHandle()")));
        agent.claim("Capitals");
        vm.expectRevert(bytes4(keccak256("BadHandle()")));
        agent.claim("has space");
        vm.expectRevert(bytes4(keccak256("BadHandle()")));
        agent.claim("waytoolonghandlethatgoesonandon");
        agent.claim("ok123");
        vm.stopPrank();
    }

    function test_faucetDripsTestMoney() public {
        vm.prank(outsider);
        usdc.faucet();
        assertEq(usdc.balanceOf(outsider), 1_000 ether);
    }
}
