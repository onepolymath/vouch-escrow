// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Base} from "./Base.t.sol";
import {Vouch} from "../src/Vouch.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {TestToken} from "./mocks/TestToken.sol";

contract FundTest is Base {
    function test_openBuyerFunds() public {
        uint256 id = _create(_params());
        uint256 before = usdt.balanceOf(buyer);

        vm.startPrank(buyer);
        usdt.approve(address(vouch), AMOUNT);
        vm.expectEmit(true, true, false, false);
        emit Vouch.DealFunded(id, buyer);
        vouch.fund(id);
        vm.stopPrank();

        Vouch.Deal memory d = vouch.getDeal(id);
        assertEq(d.buyer, buyer);
        assertEq(uint8(d.status), uint8(Vouch.Status.Funded));
        assertEq(usdt.balanceOf(address(vouch)), AMOUNT);
        assertEq(usdt.balanceOf(buyer), before - AMOUNT);
        assertEq(vouch.trackRecord(buyer).since, block.timestamp);
    }

    function test_namedBuyerFunds() public {
        Vouch.CreateParams memory p = _params();
        p.buyer = buyer;
        uint256 id = _create(p);
        _fundAs(buyer, id);
        assertEq(uint8(_status(id)), uint8(Vouch.Status.Funded));
        // already in the list from createDeal, must not be added twice
        assertEq(vouch.dealCountOf(buyer), 1);
    }

    function test_someoneElseCannotFundANamedDeal() public {
        Vouch.CreateParams memory p = _params();
        p.buyer = buyer;
        uint256 id = _create(p);
        agent.register(outsider, "walkin");
        usdt.mint(outsider, AMOUNT);
        vm.startPrank(outsider);
        usdt.approve(address(vouch), AMOUNT);
        vm.expectRevert(Vouch.NotNamedBuyer.selector);
        vouch.fund(id);
        vm.stopPrank();
    }

    function test_buyerWithoutAgentIdBlockedByDefault() public {
        uint256 id = _create(_params());
        vm.startPrank(outsider);
        usdt.approve(address(vouch), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(Vouch.NotAgentIdHolder.selector, outsider));
        vouch.fund(id);
        vm.stopPrank();
    }

    function test_buyerWithoutAgentIdAllowedWhenSellerOpensItUp() public {
        Vouch.CreateParams memory p = _params();
        p.buyerNeedsAgentId = false;
        uint256 id = _create(p);
        _fundAs(outsider, id);
        assertEq(vouch.getDeal(id).buyer, outsider);
    }

    function test_sellerCannotFundOwnDeal() public {
        uint256 id = _create(_params());
        usdt.mint(seller, AMOUNT);
        vm.startPrank(seller);
        usdt.approve(address(vouch), AMOUNT);
        vm.expectRevert(Vouch.BadParties.selector);
        vouch.fund(id);
        vm.stopPrank();
    }

    function test_arbiterCannotFundTheDealTheyJudge() public {
        Vouch.CreateParams memory p = _params();
        p.arbiter = arbiter;
        uint256 id = _create(p);
        usdt.mint(arbiter, AMOUNT);
        vm.startPrank(arbiter);
        usdt.approve(address(vouch), AMOUNT);
        vm.expectRevert(Vouch.BadParties.selector);
        vouch.fund(id);
        vm.stopPrank();
    }

    function test_cannotFundAfterDeadline() public {
        uint256 id = _create(_params());
        vm.warp(vouch.getDeal(id).deliverBy);
        vm.startPrank(buyer);
        usdt.approve(address(vouch), AMOUNT);
        vm.expectRevert(Vouch.DeadlinePassed.selector);
        vouch.fund(id);
        vm.stopPrank();
    }

    function test_cannotFundTwice() public {
        uint256 id = _openAndFunded();
        vm.startPrank(buyer);
        usdt.approve(address(vouch), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Funded));
        vouch.fund(id);
        vm.stopPrank();
    }

    function test_needsAllowance() public {
        uint256 id = _create(_params());
        vm.prank(buyer);
        vm.expectRevert();
        vouch.fund(id);
    }

    function test_needsBalance() public {
        uint256 id = _create(_params());
        agent.register(address(0xA11CE), "broke");
        vm.startPrank(address(0xA11CE));
        usdt.approve(address(vouch), AMOUNT);
        vm.expectRevert();
        vouch.fund(id);
        vm.stopPrank();
    }

    function test_rejectsFeeOnTransferToken() public {
        TestToken fee = new TestToken(18);
        address[] memory t = new address[](1);
        t[0] = address(fee);
        Vouch v = new Vouch(IAgentID(address(agent)), t, MIN, MAX);

        Vouch.CreateParams memory p = _params();
        p.token = address(fee);
        vm.prank(seller);
        uint256 id = v.createDeal(p);

        fee.mint(buyer, AMOUNT);
        fee.setFee(100); // 1%
        vm.startPrank(buyer);
        fee.approve(address(v), AMOUNT);
        vm.expectRevert(Vouch.UnexpectedTransferAmount.selector);
        v.fund(id);
        vm.stopPrank();
    }
}

contract DeliveryTest is Base {
    function test_sellerMarksDelivered() public {
        uint256 id = _openAndFunded();
        uint256 t0 = block.timestamp;
        vm.expectEmit(true, false, false, true);
        emit Vouch.DealDelivered(id, PROOF, uint64(t0) + REVIEW);
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);

        Vouch.Deal memory d = vouch.getDeal(id);
        assertEq(uint8(d.status), uint8(Vouch.Status.Delivered));
        assertEq(d.proofHash, PROOF);
        assertEq(d.deliveredAt, t0);
        assertEq(vouch.reviewEndsAt(id), t0 + REVIEW);
    }

    function test_reviewEndsAtIsZeroBeforeDelivery() public {
        uint256 id = _openAndFunded();
        assertEq(vouch.reviewEndsAt(id), 0);
    }

    function test_onlySellerDelivers() public {
        uint256 id = _openAndFunded();
        vm.prank(buyer);
        vm.expectRevert(Vouch.NotSeller.selector);
        vouch.markDelivered(id, PROOF);
    }

    function test_cannotDeliverUnfundedDeal() public {
        uint256 id = _create(_params());
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Open));
        vouch.markDelivered(id, PROOF);
    }

    function test_canDeliverOnTheDeadlineButNotAfter() public {
        uint256 id = _openAndFunded();
        uint64 by = vouch.getDeal(id).deliverBy;
        vm.warp(by);
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);

        uint256 id2 = _create(_params());
        _fundAs(buyer, id2);
        vm.warp(vouch.getDeal(id2).deliverBy + 1);
        vm.prank(seller);
        vm.expectRevert(Vouch.DeadlinePassed.selector);
        vouch.markDelivered(id2, PROOF);
    }
}

contract ReleaseTest is Base {
    function test_buyerApprovesAndSellerIsPaid() public {
        uint256 id = _delivered();
        vm.expectEmit(true, true, false, true);
        emit Vouch.DealReleased(id, seller, AMOUNT);
        vm.prank(buyer);
        vouch.approve(id);

        assertEq(uint8(_status(id)), uint8(Vouch.Status.Released));
        assertEq(usdt.balanceOf(seller), AMOUNT);
        assertEq(usdt.balanceOf(address(vouch)), 0);
    }

    function test_onlyBuyerApproves() public {
        uint256 id = _delivered();
        vm.prank(seller);
        vm.expectRevert(Vouch.NotBuyer.selector);
        vouch.approve(id);
        vm.prank(outsider);
        vm.expectRevert(Vouch.NotBuyer.selector);
        vouch.approve(id);
    }

    function test_cannotApproveBeforeDelivery() public {
        uint256 id = _openAndFunded();
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Funded));
        vouch.approve(id);
    }

    function test_cannotApproveTwice() public {
        uint256 id = _delivered();
        vm.startPrank(buyer);
        vouch.approve(id);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Released));
        vouch.approve(id);
        vm.stopPrank();
    }

    function test_recordsUpdateOnRelease() public {
        uint256 id = _delivered();
        vm.prank(buyer);
        vouch.approve(id);

        Vouch.Record memory s = vouch.trackRecord(seller);
        Vouch.Record memory b = vouch.trackRecord(buyer);
        assertEq(s.completedAsSeller, 1);
        assertEq(s.completedAsBuyer, 0);
        assertEq(b.completedAsBuyer, 1);
        assertEq(b.completedAsSeller, 0);
        assertEq(s.volume, AMOUNT);
        assertEq(b.volume, AMOUNT);
    }

    function test_volumeIsNormalisedAcrossDecimals() public {
        TestToken six = new TestToken(6);
        address[] memory t = new address[](1);
        t[0] = address(six);
        Vouch v = new Vouch(IAgentID(address(agent)), t, MIN, MAX);

        Vouch.CreateParams memory p = _params();
        p.token = address(six);
        p.amount = 250e6;
        vm.prank(seller);
        uint256 id = v.createDeal(p);

        six.mint(buyer, 250e6);
        vm.startPrank(buyer);
        six.approve(address(v), 250e6);
        v.fund(id);
        vm.stopPrank();
        vm.prank(seller);
        v.markDelivered(id, PROOF);
        vm.prank(buyer);
        v.approve(id);

        assertEq(v.trackRecord(seller).volume, 250 ether);
        assertEq(six.balanceOf(seller), 250e6);
    }

    function test_releaseAfterWindowIsOpenToAnyone() public {
        uint256 id = _delivered();
        uint256 ends = vouch.reviewEndsAt(id);

        vm.warp(ends);
        vm.expectRevert(Vouch.ReviewWindowOpen.selector);
        vouch.releaseAfterWindow(id);

        vm.warp(ends + 1);
        vm.prank(outsider);
        vouch.releaseAfterWindow(id);
        assertEq(uint8(_status(id)), uint8(Vouch.Status.Released));
        assertEq(usdt.balanceOf(seller), AMOUNT);
    }

    function test_releaseAfterWindowNeedsDelivery() public {
        uint256 id = _openAndFunded();
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Funded));
        vouch.releaseAfterWindow(id);
    }
}

contract RefundTest is Base {
    function test_refundAfterMissedDeadline() public {
        uint256 id = _openAndFunded();
        uint256 buyerBefore = usdt.balanceOf(buyer);
        uint64 by = vouch.getDeal(id).deliverBy;

        vm.warp(by);
        vm.expectRevert(Vouch.DeadlineNotReached.selector);
        vouch.refundExpired(id);

        vm.warp(by + 1);
        vm.expectEmit(true, true, false, true);
        emit Vouch.DealRefunded(id, buyer, AMOUNT);
        vm.prank(outsider);
        vouch.refundExpired(id);

        assertEq(uint8(_status(id)), uint8(Vouch.Status.Refunded));
        assertEq(usdt.balanceOf(buyer), buyerBefore + AMOUNT);
        assertEq(usdt.balanceOf(address(vouch)), 0);
        assertEq(vouch.trackRecord(seller).missedDeadlines, 1);
    }

    function test_noRefundOnceDelivered() public {
        uint256 id = _delivered();
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Delivered));
        vouch.refundExpired(id);
    }

    function test_noRefundOnUnfundedDeal() public {
        uint256 id = _create(_params());
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Open));
        vouch.refundExpired(id);
    }

    function test_cannotRefundTwice() public {
        uint256 id = _openAndFunded();
        vm.warp(block.timestamp + 8 days);
        vouch.refundExpired(id);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Refunded));
        vouch.refundExpired(id);
    }
}
