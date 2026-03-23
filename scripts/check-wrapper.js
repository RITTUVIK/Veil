#!/usr/bin/env node
// Checks if veilsdk.eth is wrapped and what fuses are set.

const { ethers } = require("ethers");

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const NAME_WRAPPER = "0x4F382928805ba0e23B30cFB75fC9E848e82DFD47";

function namehash(name) {
  let node = "0x" + "00".repeat(32);
  if (!name) return node;
  const labels = name.split(".").reverse();
  for (const label of labels) {
    const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
    node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [node, labelHash]));
  }
  return node;
}

const PARENT_NODE = namehash("veilsdk.eth");

// Fuse bit flags (from ENS Name Wrapper)
const FUSES = {
  CANNOT_UNWRAP:            1,
  CANNOT_BURN_FUSES:        2,
  CANNOT_TRANSFER:          4,
  CANNOT_SET_RESOLVER:      8,
  CANNOT_SET_TTL:           16,
  CANNOT_CREATE_SUBDOMAIN:  32,
  CANNOT_APPROVE:           64,
  PARENT_CANNOT_CONTROL:    1 << 16,
  IS_DOT_ETH:              1 << 17,
  CAN_EXTEND_EXPIRY:       1 << 18,
};

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);

  // Check ENS Registry owner
  const registry = new ethers.Contract(ENS_REGISTRY, [
    "function owner(bytes32 node) view returns (address)",
  ], provider);
  const registryOwner = await registry.owner(PARENT_NODE);
  console.log(`ENS Registry owner of veilsdk.eth: ${registryOwner}`);
  console.log(`Name Wrapper address:              ${NAME_WRAPPER}`);
  console.log(`Is wrapped: ${registryOwner.toLowerCase() === NAME_WRAPPER.toLowerCase()}`);

  if (registryOwner.toLowerCase() !== NAME_WRAPPER.toLowerCase()) {
    console.log("\nName is NOT wrapped. You can transfer ENS Registry ownership directly.");
    return;
  }

  // Check Name Wrapper state
  const wrapper = new ethers.Contract(NAME_WRAPPER, [
    "function getData(uint256 id) view returns (address owner, uint32 fuses, uint64 expiry)",
    "function ownerOf(uint256 id) view returns (address)",
  ], provider);

  const tokenId = PARENT_NODE; // Name Wrapper uses namehash as token ID
  const [wrapperOwner, fuses, expiry] = await wrapper.getData(tokenId);

  console.log(`\nName Wrapper state:`);
  console.log(`  Owner (ERC-1155): ${wrapperOwner}`);
  console.log(`  Fuses (raw):      ${fuses} (0x${fuses.toString(16)})`);
  console.log(`  Expiry:           ${expiry} (${new Date(Number(expiry) * 1000).toISOString()})`);

  console.log(`\n  Fuse flags:`);
  for (const [name, bit] of Object.entries(FUSES)) {
    const set = (fuses & bit) !== 0;
    console.log(`    ${set ? "🔥" : "  "} ${name}: ${set}`);
  }

  const canUnwrap = (fuses & FUSES.CANNOT_UNWRAP) === 0;
  console.log(`\n  Can unwrap: ${canUnwrap}`);

  if (canUnwrap) {
    console.log(`\n✓ You CAN unwrap veilsdk.eth.`);
    console.log(`  Call NameWrapper.unwrapETH2LD(labelhash("veilsdk"), newRegistrant, newController)`);
    console.log(`  labelhash("veilsdk") = ${ethers.keccak256(ethers.toUtf8Bytes("veilsdk"))}`);
  } else {
    console.log(`\n✗ CANNOT_UNWRAP fuse is burned. You must deploy a new registrar that uses the Name Wrapper.`);
  }
}

main().catch(console.error);
