// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice The two read functions of the SPACE ID Agent ID registry that Vouch relies on.
/// On BNB Chain mainnet the registry lives at 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F.
/// Source: https://docs.space.id/agent-id
interface IAgentID {
    /// @dev ERC-721 balance. Greater than zero means the address holds an Agent ID.
    /// The real registry reverts for address(0), so never call this with the zero address.
    function balanceOf(address owner) external view returns (uint256);

    /// @dev The bare handle ("alice", not "alice.ai"), or an empty string if there is none.
    function handleOf(address owner) external view returns (string memory);
}
