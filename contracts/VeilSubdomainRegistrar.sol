// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VeilSubdomainRegistrar
/// @notice Allows anyone to register a subdomain under a parent ENS node (e.g. veilsdk.eth).
///         The contract must be the owner of the parent node in the ENS Registry.
///         On register(), the caller receives ownership of <label>.veilsdk.eth with the
///         resolver already attached — no separate setResolver call needed.

interface IENSRegistry {
    function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external returns (bytes32);
    function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external;
    function owner(bytes32 node) external view returns (address);
}

contract VeilSubdomainRegistrar {
    IENSRegistry public immutable ens;
    bytes32 public immutable parentNode;
    address public immutable resolver;
    address public owner;

    event SubdomainRegistered(string label, bytes32 indexed labelHash, address indexed registrant);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /// @param _ens         Address of the ENS Registry (same on all networks: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e)
    /// @param _parentNode  Namehash of the parent domain (e.g. namehash("veilsdk.eth"))
    /// @param _resolver    Address of the ENS Public Resolver to attach to each subdomain
    constructor(address _ens, bytes32 _parentNode, address _resolver) {
        ens = IENSRegistry(_ens);
        parentNode = _parentNode;
        resolver = _resolver;
        owner = msg.sender;
    }

    /// @notice Register a subdomain with resolver pre-attached.
    /// @param labelHash keccak256(label) — passed by the caller to avoid on-chain string hashing
    /// @param to        The address that will own the subdomain
    function register(bytes32 labelHash, address to) external {
        ens.setSubnodeRecord(parentNode, labelHash, to, resolver, 0);
    }

    /// @notice Register with label string for event logging. Slightly more gas but emits the label.
    /// @param label The subdomain label as a string (e.g. "myagent")
    /// @param to    The address that will own the subdomain
    function registerWithLabel(string calldata label, address to) external {
        bytes32 labelHash = keccak256(bytes(label));
        ens.setSubnodeRecord(parentNode, labelHash, to, resolver, 0);
        emit SubdomainRegistered(label, labelHash, to);
    }

    /// @notice Withdraw any ETH accidentally sent to this contract
    function withdraw() external onlyOwner {
        (bool ok, ) = owner.call{value: address(this).balance}("");
        require(ok, "Transfer failed");
    }

    /// @notice Transfer ownership of this registrar contract
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Reclaim the parent node back from this contract (emergency escape hatch)
    /// @param newOwner The address to transfer the parent node ownership to
    function reclaimParentNode(address newOwner) external onlyOwner {
        ens.setSubnodeOwner(parentNode, bytes32(0), newOwner);
    }

    receive() external payable {}
}
