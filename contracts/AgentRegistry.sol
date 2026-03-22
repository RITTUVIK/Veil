// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentRegistry {
    event AgentRegistered(
        string ensName,
        address indexed agentWallet,
        address indexed registeredBy,
        uint256 timestamp
    );

    function registerAgent(string calldata ensName, address agentWallet) external {
        emit AgentRegistered(ensName, agentWallet, msg.sender, block.timestamp);
    }
}
