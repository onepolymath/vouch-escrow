// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITokenReceiver {
    function onTokenReceived() external;
}

/// @dev Misbehaving ERC-20 for tests: odd decimals, a transfer fee, a blocklist that either
/// reverts or returns false (USDT style), and a callback on transfer to a contract recipient.
contract TestToken is ERC20 {
    uint8 private immutable _dec;
    uint256 public feeBps;
    bool public softFail;
    bool public callbacks;
    mapping(address => bool) public blocked;

    constructor(uint8 dec_) ERC20("Test Token", "TT") {
        _dec = dec_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFee(uint256 bps) external {
        feeBps = bps;
    }

    function setBlocked(address who, bool b) external {
        blocked[who] = b;
    }

    function setSoftFail(bool b) external {
        softFail = b;
    }

    function setCallbacks(bool b) external {
        callbacks = b;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (blocked[to]) {
            if (softFail) return false;
            revert("blocked");
        }
        bool ok = super.transfer(to, amount);
        if (callbacks && to.code.length > 0) ITokenReceiver(to).onTokenReceived();
        return ok;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (feeBps != 0 && from != address(0) && to != address(0)) {
            uint256 fee = (value * feeBps) / 10_000;
            super._update(from, address(0xdead), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}
