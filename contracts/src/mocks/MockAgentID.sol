// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAgentID} from "../interfaces/IAgentID.sol";

/// @notice Stand-in for the Agent ID registry, for tests and BSC testnet only.
/// The real registry is not deployed on testnet. This one mimics its reads: one handle per
/// address, no transfers, and balanceOf(0) reverts. Anyone can claim a test handle.
contract MockAgentID is IAgentID {
    error ZeroAddress();
    error AlreadyClaimed();
    error HandleTaken();
    error BadHandle();

    string public constant name = "Mock Agent ID";
    string public constant symbol = "mAI";

    mapping(address => string) private _handleOf;
    mapping(bytes32 => address) private _ownerOf;

    event Registered(bytes32 indexed labelhash, address indexed owner, string handle);

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return bytes(_handleOf[owner]).length == 0 ? 0 : 1;
    }

    function handleOf(address owner) external view returns (string memory) {
        return _handleOf[owner];
    }

    function ownerOfHandle(string calldata handle) external view returns (address) {
        return _ownerOf[keccak256(bytes(handle))];
    }

    /// @notice Claim a test handle for yourself. Lowercase a-z and 0-9, 3 to 20 characters.
    function claim(string calldata handle) external {
        _register(msg.sender, handle);
    }

    /// @dev Used by tests to hand a handle to any address.
    function register(address owner, string calldata handle) external {
        _register(owner, handle);
    }

    function _register(address owner, string calldata handle) private {
        if (owner == address(0)) revert ZeroAddress();
        if (bytes(_handleOf[owner]).length != 0) revert AlreadyClaimed();
        _checkHandle(handle);
        bytes32 label = keccak256(bytes(handle));
        if (_ownerOf[label] != address(0)) revert HandleTaken();
        _handleOf[owner] = handle;
        _ownerOf[label] = owner;
        emit Registered(label, owner, handle);
    }

    function _checkHandle(string calldata handle) private pure {
        bytes calldata b = bytes(handle);
        if (b.length < 3 || b.length > 20) revert BadHandle();
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39);
            if (!ok) revert BadHandle();
        }
    }
}
