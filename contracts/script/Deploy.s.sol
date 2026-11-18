// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Vouch} from "../src/Vouch.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";
import {MockAgentID} from "../src/mocks/MockAgentID.sol";
import {MockUSD} from "../src/mocks/MockUSD.sol";

/// Testnet (97): deploys the mock registry and two mock stablecoins next to Vouch.
/// Mainnet (56): points Vouch at the real registry and the real USDT and USDC. It refuses to
/// run unless CONFIRM_MAINNET=yes is set, so nobody does it by accident.
///
///   forge script script/Deploy.s.sol --rpc-url bsc_testnet --private-key $KEY --broadcast
contract Deploy is Script {
    address constant REAL_REGISTRY = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address constant BSC_USDT = 0x55d398326f99059fF775485246999027B3197955;
    address constant BSC_USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;

    uint256 constant MIN_DEAL = 1 ether;
    uint256 constant MAX_DEAL = 1_000 ether;

    function run() external {
        address registry;
        address[] memory tokens = new address[](2);
        bool mocks;

        if (block.chainid == 97) {
            mocks = true;
        } else if (block.chainid == 56) {
            require(
                keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) == keccak256("yes"),
                "set CONFIRM_MAINNET=yes to deploy on mainnet"
            );
            registry = REAL_REGISTRY;
            tokens[0] = BSC_USDT;
            tokens[1] = BSC_USDC;
        } else {
            revert("unsupported chain, use 97 or 56");
        }

        vm.startBroadcast();
        if (mocks) {
            registry = address(new MockAgentID());
            tokens[0] = address(new MockUSD("Test USDT", "tUSDT"));
            tokens[1] = address(new MockUSD("Test USDC", "tUSDC"));
        }
        Vouch vouch = new Vouch(IAgentID(registry), tokens, MIN_DEAL, MAX_DEAL);
        vm.stopBroadcast();

        console2.log("chain", block.chainid);
        console2.log("registry", registry);
        console2.log("vouch", address(vouch));
        console2.log("token0", tokens[0]);
        console2.log("token1", tokens[1]);

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "agentId", registry);
        vm.serializeAddress(k, "token0", tokens[0]);
        vm.serializeAddress(k, "token1", tokens[1]);
        vm.serializeBool(k, "mockRegistry", mocks);
        vm.serializeUint(k, "deployBlock", block.number);
        string memory json = vm.serializeAddress(k, "vouch", address(vouch));
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
