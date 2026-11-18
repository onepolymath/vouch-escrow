// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Base} from "./Base.t.sol";
import {Vouch} from "../src/Vouch.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {TestToken} from "./mocks/TestToken.sol";

contract ConstructorTest is Base {
    function test_immutablesAreSet() public view {
        assertEq(address(vouch.AGENT_ID()), address(agent));
        assertEq(vouch.MIN_DEAL(), MIN);
        assertEq(vouch.MAX_DEAL(), MAX);
        assertEq(vouch.tokenScale(address(usdt)), 1);
        assertEq(vouch.tokenScale(address(usdc)), 1);
        assertEq(vouch.tokenScale(address(0xBEEF)), 0);
    }

    function test_scaleForSixDecimalToken() public {
        TestToken six = new TestToken(6);
        address[] memory t = new address[](1);
        t[0] = address(six);
        Vouch v = new Vouch(IAgentID(address(agent)), t, MIN, MAX);
        assertEq(v.tokenScale(address(six)), 1e12);
    }

    function test_revertsOnZeroRegistry() public {
        address[] memory t = new address[](1);
        t[0] = address(usdt);
        vm.expectRevert(Vouch.BadConstructorArgs.selector);
        new Vouch(IAgentID(address(0)), t, MIN, MAX);
    }

    function test_revertsOnNoTokens() public {
        vm.expectRevert(Vouch.BadConstructorArgs.selector);
        new Vouch(IAgentID(address(agent)), new address[](0), MIN, MAX);
    }

    function test_revertsOnZeroToken() public {
        address[] memory t = new address[](1);
        vm.expectRevert(Vouch.BadConstructorArgs.selector);
        new Vouch(IAgentID(address(agent)), t, MIN, MAX);
    }

    function test_revertsOnBadLimits() public {
        address[] memory t = new address[](1);
        t[0] = address(usdt);
        vm.expectRevert(Vouch.BadConstructorArgs.selector);
        new Vouch(IAgentID(address(agent)), t, 0, MAX);
        vm.expectRevert(Vouch.BadConstructorArgs.selector);
        new Vouch(IAgentID(address(agent)), t, MAX, MIN);
    }

    function test_revertsOnDuplicateToken() public {
        address[] memory t = new address[](2);
        t[0] = address(usdt);
        t[1] = address(usdt);
        vm.expectRevert(Vouch.BadConstructorArgs.selector);
        new Vouch(IAgentID(address(agent)), t, MIN, MAX);
    }

    function test_revertsOnTooManyDecimals() public {
        TestToken weird = new TestToken(24);
        address[] memory t = new address[](1);
        t[0] = address(weird);
        vm.expectRevert(Vouch.BadConstructorArgs.selector);
        new Vouch(IAgentID(address(agent)), t, MIN, MAX);
    }
}

contract CreateDealTest is Base {
    function test_createStoresTheDeal() public {
        Vouch.CreateParams memory p = _params();
        vm.expectEmit(true, true, true, true);
        emit Vouch.DealCreated(
            1, seller, address(0), address(usdt), AMOUNT, p.deliverBy, REVIEW, TERMS
        );
        uint256 id = _create(p);

        assertEq(id, 1);
        assertEq(vouch.dealCount(), 1);
        Vouch.Deal memory d = vouch.getDeal(id);
        assertEq(d.seller, seller);
        assertEq(d.buyer, address(0));
        assertEq(d.token, address(usdt));
        assertEq(d.amount, AMOUNT);
        assertEq(d.deliverBy, p.deliverBy);
        assertEq(d.reviewSecs, REVIEW);
        assertEq(d.termsHash, TERMS);
        assertTrue(d.buyerNeedsAgentId);
        assertEq(uint8(d.status), uint8(Vouch.Status.Open));
    }

    function test_idsIncrease() public {
        assertEq(_create(_params()), 1);
        assertEq(_create(_params()), 2);
        assertEq(_create(_params()), 3);
    }

    function test_onlyHoldersCanCreate() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Vouch.NotAgentIdHolder.selector, outsider));
        vouch.createDeal(_params());
    }

    function test_rejectsTokenOutsideAllowlist() public {
        Vouch.CreateParams memory p = _params();
        p.token = address(0xBEEF);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.TokenNotAllowed.selector, address(0xBEEF)));
        vouch.createDeal(p);
    }

    function test_amountBoundaries() public {
        Vouch.CreateParams memory p = _params();
        p.amount = MIN;
        _create(p);
        p.amount = MAX;
        _create(p);

        p.amount = MIN - 1;
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.AmountOutOfRange.selector, MIN - 1));
        vouch.createDeal(p);

        p.amount = MAX + 1;
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.AmountOutOfRange.selector, MAX + 1));
        vouch.createDeal(p);
    }

    function test_limitsUseNormalisedAmounts() public {
        TestToken six = new TestToken(6);
        address[] memory t = new address[](1);
        t[0] = address(six);
        Vouch v = new Vouch(IAgentID(address(agent)), t, MIN, MAX);

        Vouch.CreateParams memory p = _params();
        p.token = address(six);
        p.amount = 1e6; // one dollar
        vm.prank(seller);
        v.createDeal(p);

        p.amount = 1e6 - 1;
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.AmountOutOfRange.selector, 1e6 - 1));
        v.createDeal(p);

        p.amount = 1_000e6 + 1;
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.AmountOutOfRange.selector, 1_000e6 + 1));
        v.createDeal(p);
    }

    function test_deadlineMustBeInTheFutureButNotAbsurd() public {
        Vouch.CreateParams memory p = _params();
        p.deliverBy = uint64(block.timestamp);
        vm.prank(seller);
        vm.expectRevert(Vouch.BadDeadline.selector);
        vouch.createDeal(p);

        p.deliverBy = uint64(block.timestamp + 180 days);
        _create(p);

        p.deliverBy = uint64(block.timestamp + 180 days + 1);
        vm.prank(seller);
        vm.expectRevert(Vouch.BadDeadline.selector);
        vouch.createDeal(p);
    }

    function test_reviewWindowBoundaries() public {
        Vouch.CreateParams memory p = _params();
        p.reviewSecs = 1 hours;
        _create(p);
        p.reviewSecs = 14 days;
        _create(p);

        p.reviewSecs = 1 hours - 1;
        vm.prank(seller);
        vm.expectRevert(Vouch.BadReviewWindow.selector);
        vouch.createDeal(p);

        p.reviewSecs = 14 days + 1;
        vm.prank(seller);
        vm.expectRevert(Vouch.BadReviewWindow.selector);
        vouch.createDeal(p);
    }

    function test_partiesMustBeDistinct() public {
        Vouch.CreateParams memory p = _params();

        p.buyer = seller;
        vm.prank(seller);
        vm.expectRevert(Vouch.BadParties.selector);
        vouch.createDeal(p);

        p = _params();
        p.arbiter = seller;
        vm.prank(seller);
        vm.expectRevert(Vouch.BadParties.selector);
        vouch.createDeal(p);

        p = _params();
        p.buyer = buyer;
        p.arbiter = buyer;
        vm.prank(seller);
        vm.expectRevert(Vouch.BadParties.selector);
        vouch.createDeal(p);
    }

    function test_namedBuyerSeesTheDealInTheirList() public {
        Vouch.CreateParams memory p = _params();
        p.buyer = buyer;
        uint256 id = _create(p);
        assertEq(vouch.dealCountOf(buyer), 1);
        assertEq(vouch.dealIdsOf(buyer, 0, 10)[0], id);
        assertEq(vouch.dealIdsOf(seller, 0, 10)[0], id);
    }

    function test_openBuyerOnlyAppearsAfterFunding() public {
        uint256 id = _create(_params());
        assertEq(vouch.dealCountOf(buyer), 0);
        _fundAs(buyer, id);
        assertEq(vouch.dealCountOf(buyer), 1);
    }

    function test_creatingMarksFirstSeen() public {
        assertEq(vouch.trackRecord(seller).since, 0);
        _create(_params());
        assertEq(vouch.trackRecord(seller).since, block.timestamp);
    }

    function test_cancelOpenDeal() public {
        uint256 id = _create(_params());
        vm.expectEmit(true, false, false, false);
        emit Vouch.DealCancelled(id);
        vm.prank(seller);
        vouch.cancel(id);
        assertEq(uint8(_status(id)), uint8(Vouch.Status.Cancelled));
    }

    function test_onlySellerCancels() public {
        uint256 id = _create(_params());
        vm.prank(buyer);
        vm.expectRevert(Vouch.NotSeller.selector);
        vouch.cancel(id);
    }

    function test_cannotCancelAfterFunding() public {
        uint256 id = _openAndFunded();
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Funded));
        vouch.cancel(id);
    }

    function test_cancelledDealCannotBeFunded() public {
        uint256 id = _create(_params());
        vm.prank(seller);
        vouch.cancel(id);
        vm.startPrank(buyer);
        usdt.approve(address(vouch), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(Vouch.WrongStatus.selector, Vouch.Status.Cancelled));
        vouch.fund(id);
        vm.stopPrank();
    }

    function test_unknownDealReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Vouch.NoSuchDeal.selector, 0));
        vouch.getDeal(0);
        vm.expectRevert(abi.encodeWithSelector(Vouch.NoSuchDeal.selector, 1));
        vouch.getDeal(1);
    }
}
