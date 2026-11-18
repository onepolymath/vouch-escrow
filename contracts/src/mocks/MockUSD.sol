// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 18 decimal test stablecoin with an open faucet. Testnet and tests only.
/// 18 decimals because USDT and USDC on BNB Chain both use 18.
contract MockUSD is ERC20 {
    uint256 public constant DRIP = 1_000 ether;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function faucet() external {
        _mint(msg.sender, DRIP);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
