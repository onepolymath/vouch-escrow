// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vouch} from "../src/Vouch.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Runs against a BNB Chain mainnet fork so the holder gate is checked against the real
/// registry, not the mock. Skipped unless BSC_RPC_URL is set:
///   BSC_RPC_URL=https://bsc-dataseed.binance.org forge test --match-contract ForkTest
/// Read-only, nothing is sent anywhere. The holders are two public Agent IDs ("cfo" and
/// "jackfred") that I looked up through the SPACE ID API on 18 Nov 2026.
contract ForkTest is Test {
    IAgentID constant REGISTRY = IAgentID(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);
    address constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address constant USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address constant CFO = 0x7751bE7B2BA4141D5E32Ef14e9E5cc73e9D7bf0C;
    address constant JACKFRED = 0xe5Ed7cefEb1D3dcb8094B90F2906Fb1bE349BADF;

    Vouch internal vouch;
    bool internal forked;

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;

        address[] memory tokens = new address[](2);
        tokens[0] = USDT;
        tokens[1] = USDC;
        vouch = new Vouch(REGISTRY, tokens, 1 ether, 1_000 ether);
    }

    modifier onFork() {
        if (!forked) {
            vm.skip(true);
        }
        _;
    }

    function _params() internal view returns (Vouch.CreateParams memory) {
        return Vouch.CreateParams({
            buyer: address(0),
            token: USDT,
            amount: 25 ether,
            deliverBy: uint64(block.timestamp + 3 days),
            reviewSecs: 1 days,
            buyerNeedsAgentId: true,
            arbiter: address(0),
            termsHash: keccak256("fork test")
        });
    }

    function test_registryAnswersTheWayWeExpect() public onFork {
        assertEq(REGISTRY.balanceOf(CFO), 1);
        assertEq(REGISTRY.handleOf(CFO), "cfo");
        assertEq(REGISTRY.balanceOf(JACKFRED), 1);
        assertEq(REGISTRY.balanceOf(makeAddr("nobody")), 0);
        assertEq(REGISTRY.handleOf(makeAddr("nobody")), "");
        vm.expectRevert();
        REGISTRY.balanceOf(address(0));
    }

    function test_stablecoinsUseEighteenDecimals() public onFork {
        assertEq(vouch.tokenScale(USDT), 1);
        assertEq(vouch.tokenScale(USDC), 1);
    }

    function test_agentIdOfReadsTheRealRegistry() public onFork {
        (bool holds, string memory handle) = vouch.agentIdOf(CFO);
        assertTrue(holds);
        assertEq(handle, "cfo");
        (holds,) = vouch.agentIdOf(makeAddr("nobody"));
        assertFalse(holds);
    }

    function test_nonHolderIsTurnedAway() public onFork {
        address nobody = makeAddr("nobody");
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(Vouch.NotAgentIdHolder.selector, nobody));
        vouch.createDeal(_params());
    }

    function test_realHoldersCanDoAFullDeal() public onFork {
        uint256 cfoBefore = IERC20(USDT).balanceOf(CFO);
        vm.prank(CFO);
        uint256 id = vouch.createDeal(_params());

        deal(USDT, JACKFRED, 25 ether);
        vm.startPrank(JACKFRED);
        IERC20(USDT).approve(address(vouch), 25 ether);
        vouch.fund(id);
        vm.stopPrank();
        assertEq(IERC20(USDT).balanceOf(address(vouch)), 25 ether);

        vm.prank(CFO);
        vouch.markDelivered(id, keccak256("done"));
        vm.prank(JACKFRED);
        vouch.approve(id);

        assertEq(IERC20(USDT).balanceOf(CFO), cfoBefore + 25 ether);
        assertEq(vouch.trackRecord(CFO).completedAsSeller, 1);
        assertEq(vouch.trackRecord(JACKFRED).completedAsBuyer, 1);
    }

    function test_openProfileWithRealHolder() public onFork {
        vm.prank(CFO);
        vouch.openProfile(keccak256("profile"));
        assertEq(vouch.profileOf(CFO), keccak256("profile"));
    }
}
