// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Base} from "./Base.t.sol";
import {Vouch} from "../src/Vouch.sol";

contract FuzzTest is Base {
    function testFuzz_fullHappyPathPaysExactly(uint256 amount, uint32 review, uint64 delay) public {
        amount = bound(amount, MIN, MAX);
        review = uint32(bound(review, 1 hours, 14 days));
        delay = uint64(bound(delay, 0, 7 days));

        Vouch.CreateParams memory p = _params();
        p.amount = amount;
        p.reviewSecs = review;
        uint256 id = _create(p);
        _fundAs(buyer, id);

        vm.warp(block.timestamp + delay);
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);
        vm.prank(buyer);
        vouch.approve(id);

        assertEq(usdt.balanceOf(seller), amount);
        assertEq(usdt.balanceOf(address(vouch)), 0);
        assertEq(vouch.trackRecord(seller).volume, amount);
    }

    function testFuzz_splitAlwaysAddsUp(uint256 amount, uint16 bps) public {
        amount = bound(amount, MIN, MAX);
        bps = uint16(bound(bps, 0, 10_000));

        Vouch.CreateParams memory p = _params();
        p.amount = amount;
        uint256 id = _create(p);
        _fundAs(buyer, id);
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);
        vm.prank(buyer);
        vouch.dispute(id, EVIDENCE);
        vm.prank(buyer);
        vouch.proposeSplit(id, bps);

        uint256 buyerBefore = usdt.balanceOf(buyer);
        vm.prank(seller);
        vouch.acceptSplit(id);

        uint256 toSeller = usdt.balanceOf(seller);
        uint256 toBuyer = usdt.balanceOf(buyer) - buyerBefore;
        assertEq(toSeller + toBuyer, amount);
        assertEq(toSeller, (amount * bps) / 10_000);
        assertEq(usdt.balanceOf(address(vouch)), 0);
    }

    function testFuzz_arbiterSplitAddsUp(uint256 amount, uint16 bps) public {
        amount = bound(amount, MIN, MAX);
        bps = uint16(bound(bps, 0, 10_000));

        Vouch.CreateParams memory p = _params();
        p.amount = amount;
        p.arbiter = arbiter;
        uint256 id = _create(p);
        _fundAs(buyer, id);
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);
        vm.prank(buyer);
        vouch.dispute(id, EVIDENCE);

        uint256 buyerBefore = usdt.balanceOf(buyer);
        vm.prank(arbiter);
        vouch.arbiterResolve(id, bps);
        assertEq(usdt.balanceOf(seller) + (usdt.balanceOf(buyer) - buyerBefore), amount);
    }

    function testFuzz_amountsOutsideTheRangeAreRejected(uint256 amount) public {
        vm.assume(amount < MIN || amount > MAX);
        // keep the multiplication by the token scale from overflowing, that is a different failure
        amount = amount > MAX ? bound(amount, MAX + 1, type(uint128).max) : amount;

        Vouch.CreateParams memory p = _params();
        p.amount = amount;
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.AmountOutOfRange.selector, amount));
        vouch.createDeal(p);
    }

    function testFuzz_strangersCannotCreateDeals(address who) public {
        vm.assume(who != address(0));
        vm.assume(who != seller && who != buyer && who != arbiter);
        vm.prank(who);
        vm.expectRevert(abi.encodeWithSelector(Vouch.NotAgentIdHolder.selector, who));
        vouch.createDeal(_params());
    }

    function testFuzz_refundWindow(uint64 lateBy) public {
        lateBy = uint64(bound(lateBy, 1, 365 days));
        uint256 id = _openAndFunded();
        vm.warp(vouch.getDeal(id).deliverBy + lateBy);
        vouch.refundExpired(id);
        assertEq(usdt.balanceOf(buyer), 10_000 ether);
    }

    function testFuzz_reviewWindowEdge(uint32 review, uint32 wait) public {
        review = uint32(bound(review, 1 hours, 14 days));
        wait = uint32(bound(wait, 0, 30 days));

        Vouch.CreateParams memory p = _params();
        p.reviewSecs = review;
        uint256 id = _create(p);
        _fundAs(buyer, id);
        vm.prank(seller);
        vouch.markDelivered(id, PROOF);

        vm.warp(block.timestamp + wait);
        if (wait > review) {
            vm.prank(buyer);
            vm.expectRevert(Vouch.ReviewWindowClosed.selector);
            vouch.dispute(id, EVIDENCE);
            vouch.releaseAfterWindow(id);
        } else {
            vm.expectRevert(Vouch.ReviewWindowOpen.selector);
            vouch.releaseAfterWindow(id);
            vm.prank(buyer);
            vouch.dispute(id, EVIDENCE);
        }
    }

    function testFuzz_wrongCallersNeverMoveAnything(address who, uint16 bps) public {
        vm.assume(who != seller && who != buyer && who != address(vouch));
        bps = uint16(bound(bps, 0, 10_000));
        uint256 id = _disputed();

        vm.startPrank(who);
        vm.expectRevert();
        vouch.approve(id);
        vm.expectRevert();
        vouch.markDelivered(id, PROOF);
        vm.expectRevert();
        vouch.proposeSplit(id, bps);
        vm.expectRevert();
        vouch.acceptSplit(id);
        vm.expectRevert();
        vouch.arbiterResolve(id, bps);
        vm.stopPrank();

        assertEq(usdt.balanceOf(address(vouch)), AMOUNT);
        assertEq(uint8(_status(id)), uint8(Vouch.Status.Disputed));
    }
}
