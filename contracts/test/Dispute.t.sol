// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Base} from "./Base.t.sol";
import {Vouch} from "../src/Vouch.sol";

contract DisputeTest is Base {
    function test_buyerDisputesInsideTheWindow() public {
        uint256 id = _delivered();
        vm.expectEmit(true, false, false, true);
        emit Vouch.DealDisputed(id, EVIDENCE);
        vm.prank(buyer);
        vouch.dispute(id, EVIDENCE);

        Vouch.Deal memory d = vouch.getDeal(id);
        assertEq(uint8(d.status), uint8(Vouch.Status.Disputed));
        assertEq(d.evidenceHash, EVIDENCE);
        assertEq(d.disputedAt, block.timestamp);
        assertEq(vouch.trackRecord(buyer).disputesOpened, 1);
        assertEq(vouch.trackRecord(seller).disputesAgainst, 1);
    }

    function test_canDisputeOnTheLastSecondButNotAfter() public {
        uint256 id = _delivered();
        vm.warp(vouch.reviewEndsAt(id));
        vm.prank(buyer);
        vouch.dispute(id, EVIDENCE);

        uint256 id2 = _delivered();
        vm.warp(vouch.reviewEndsAt(id2) + 1);
        vm.prank(buyer);
        vm.expectRevert(Vouch.ReviewWindowClosed.selector);
        vouch.dispute(id2, EVIDENCE);
    }

    function test_onlyBuyerDisputes() public {
        uint256 id = _delivered();
        vm.prank(seller);
        vm.expectRevert(Vouch.NotBuyer.selector);
        vouch.dispute(id, EVIDENCE);
    }

    function test_cannotDisputeBeforeDelivery() public {
        uint256 id = _openAndFunded();
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Funded));
        vouch.dispute(id, EVIDENCE);
    }

    function test_cannotDisputeTwice() public {
        uint256 id = _disputed();
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Disputed));
        vouch.dispute(id, EVIDENCE);
    }

    function test_noReleaseWhileDisputed() public {
        uint256 id = _disputed();
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Disputed));
        vouch.releaseAfterWindow(id);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Disputed));
        vouch.approve(id);
    }
}

contract SplitTest is Base {
    function test_sellerProposesAndBuyerAccepts() public {
        uint256 id = _disputed();
        vm.expectEmit(true, true, false, true);
        emit Vouch.SplitProposed(id, seller, 7_000);
        vm.prank(seller);
        vouch.proposeSplit(id, 7_000);

        vm.expectEmit(true, false, false, true);
        emit Vouch.DealSettled(id, 70 ether, 30 ether);
        vm.prank(buyer);
        vouch.acceptSplit(id);

        assertEq(uint8(_status(id)), uint8(Vouch.Status.Settled));
        assertEq(usdt.balanceOf(seller), 70 ether);
        assertEq(usdt.balanceOf(buyer), 10_000 ether - AMOUNT + 30 ether);
        assertEq(usdt.balanceOf(address(vouch)), 0);
    }

    function test_buyerProposesAndSellerAccepts() public {
        uint256 id = _disputed();
        vm.prank(buyer);
        vouch.proposeSplit(id, 2_500);
        vm.prank(seller);
        vouch.acceptSplit(id);
        assertEq(usdt.balanceOf(seller), 25 ether);
    }

    function test_proposerCannotAcceptOwnProposal() public {
        uint256 id = _disputed();
        vm.startPrank(seller);
        vouch.proposeSplit(id, 5_000);
        vm.expectRevert(Vouch.OwnProposal.selector);
        vouch.acceptSplit(id);
        vm.stopPrank();
    }

    function test_cannotAcceptWithoutProposal() public {
        uint256 id = _disputed();
        vm.prank(buyer);
        vm.expectRevert(Vouch.NoProposal.selector);
        vouch.acceptSplit(id);
    }

    function test_newestProposalReplacesTheOldOne() public {
        uint256 id = _disputed();
        vm.prank(seller);
        vouch.proposeSplit(id, 9_000);
        vm.prank(buyer);
        vouch.proposeSplit(id, 1_000);
        // seller can now accept the buyer's number, and the 9000 one is gone
        vm.prank(seller);
        vouch.acceptSplit(id);
        assertEq(usdt.balanceOf(seller), 10 ether);
    }

    function test_onlyPartiesPropose() public {
        uint256 id = _disputed();
        vm.prank(outsider);
        vm.expectRevert(Vouch.NotAParty.selector);
        vouch.proposeSplit(id, 5_000);
        vm.prank(outsider);
        vm.expectRevert(Vouch.NotAParty.selector);
        vouch.acceptSplit(id);
    }

    function test_splitMustBeAtMostOneHundredPercent() public {
        uint256 id = _disputed();
        vm.prank(seller);
        vm.expectRevert(Vouch.BadSplit.selector);
        vouch.proposeSplit(id, 10_001);
    }

    function test_cannotProposeOutsideADispute() public {
        uint256 id = _delivered();
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Delivered));
        vouch.proposeSplit(id, 5_000);
    }

    function test_extremesPayOneSideInFull() public {
        uint256 id = _disputed();
        vm.prank(buyer);
        vouch.proposeSplit(id, 0);
        vm.prank(seller);
        vouch.acceptSplit(id);
        assertEq(usdt.balanceOf(seller), 0);
        assertEq(usdt.balanceOf(address(vouch)), 0);

        uint256 id2 = _disputed();
        vm.prank(seller);
        vouch.proposeSplit(id2, 10_000);
        vm.prank(buyer);
        vouch.acceptSplit(id2);
        assertEq(usdt.balanceOf(seller), AMOUNT);
    }

    function test_roundingNeverCreatesOrLosesMoney() public {
        Vouch.CreateParams memory p = _params();
        p.amount = 1 ether + 1; // awkward number on purpose
        vm.prank(seller);
        uint256 id = vouch.createDeal(p);
        _fundAs(buyer, id);
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);
        vm.prank(buyer);
        vouch.dispute(id, EVIDENCE);
        vm.prank(seller);
        vouch.proposeSplit(id, 3_333);
        vm.prank(buyer);
        vouch.acceptSplit(id);
        assertEq(usdt.balanceOf(address(vouch)), 0);
        uint256 sellerGot = usdt.balanceOf(seller);
        uint256 buyerGot = usdt.balanceOf(buyer) - (10_000 ether - (1 ether + 1));
        assertEq(sellerGot + buyerGot, 1 ether + 1);
        uint256 total = 1 ether + 1;
        assertEq(sellerGot, (total * 3_333) / 10_000);
    }

    function test_settlementUpdatesBothRecords() public {
        uint256 id = _disputed();
        vm.prank(seller);
        vouch.proposeSplit(id, 5_000);
        vm.prank(buyer);
        vouch.acceptSplit(id);

        assertEq(vouch.trackRecord(seller).settledDisputes, 1);
        assertEq(vouch.trackRecord(buyer).settledDisputes, 1);
        assertEq(vouch.trackRecord(seller).completedAsSeller, 0);
        assertEq(vouch.trackRecord(seller).volume, AMOUNT);
    }
}

contract ArbiterTest is Base {
    function _disputedWithArbiter() internal returns (uint256 id) {
        Vouch.CreateParams memory p = _params();
        p.arbiter = arbiter;
        id = _create(p);
        _fundAs(buyer, id);
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);
        vm.prank(buyer);
        vouch.dispute(id, EVIDENCE);
    }

    function test_arbiterDecides() public {
        uint256 id = _disputedWithArbiter();
        vm.prank(arbiter);
        vouch.arbiterResolve(id, 4_000);
        assertEq(uint8(_status(id)), uint8(Vouch.Status.Settled));
        assertEq(usdt.balanceOf(seller), 40 ether);
    }

    function test_arbiterBoundsCheck() public {
        uint256 id = _disputedWithArbiter();
        vm.prank(arbiter);
        vm.expectRevert(Vouch.BadSplit.selector);
        vouch.arbiterResolve(id, 10_001);
    }

    function test_nobodyElseIsTheArbiter() public {
        uint256 id = _disputedWithArbiter();
        vm.prank(seller);
        vm.expectRevert(Vouch.NotArbiter.selector);
        vouch.arbiterResolve(id, 10_000);
        vm.prank(buyer);
        vm.expectRevert(Vouch.NotArbiter.selector);
        vouch.arbiterResolve(id, 0);
    }

    function test_dealWithoutArbiterHasNoArbiter() public {
        uint256 id = _disputed();
        vm.prank(address(0));
        vm.expectRevert(Vouch.NotArbiter.selector);
        vouch.arbiterResolve(id, 5_000);
        vm.prank(arbiter);
        vm.expectRevert(Vouch.NotArbiter.selector);
        vouch.arbiterResolve(id, 5_000);
    }

    function test_arbiterNeedsAnOpenDispute() public {
        Vouch.CreateParams memory p = _params();
        p.arbiter = arbiter;
        uint256 id = _create(p);
        _fundAs(buyer, id);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Funded));
        vouch.arbiterResolve(id, 5_000);
    }
}

contract TimeoutTest is Base {
    function test_evenSplitAfterTheTimeout() public {
        uint256 id = _disputed();
        uint256 at = vouch.getDeal(id).disputedAt;

        vm.warp(at + 7 days);
        vm.expectRevert(Vouch.DisputeStillRunning.selector);
        vouch.settleAfterTimeout(id);

        vm.warp(at + 7 days + 1);
        vm.prank(outsider);
        vouch.settleAfterTimeout(id);

        assertEq(uint8(_status(id)), uint8(Vouch.Status.Settled));
        assertEq(usdt.balanceOf(seller), 50 ether);
        assertEq(usdt.balanceOf(address(vouch)), 0);
    }

    function test_timeoutIgnoresAStandingProposal() public {
        uint256 id = _disputed();
        vm.prank(seller);
        vouch.proposeSplit(id, 10_000);
        vm.warp(block.timestamp + 8 days);
        vouch.settleAfterTimeout(id);
        assertEq(usdt.balanceOf(seller), 50 ether);
    }

    function test_timeoutNeedsADispute() public {
        uint256 id = _delivered();
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Delivered));
        vouch.settleAfterTimeout(id);
    }

    function test_cannotSettleTwice() public {
        uint256 id = _disputed();
        vm.warp(block.timestamp + 8 days);
        vouch.settleAfterTimeout(id);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Settled));
        vouch.settleAfterTimeout(id);
    }
}
