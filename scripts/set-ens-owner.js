#!/usr/bin/env node
// Signs and sends ENSRegistry.setOwner(node, newOwner) directly with explicit gas limit.
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=0x... node scripts/set-ens-owner.js

const { ethers } = require("ethers");

// ── Config ──────────────────────────────────────────────────
const SEPOLIA_RPC = "https://eth-sepolia.g.alchemy.com/v2/78OPgYHR73VVP8jX3sact";
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const NODE = "0x7477ba6dbd52af92a5d56132864e4e48240be81f964032c2dbc77771f2507fb2";
const NEW_OWNER = "0xD38B25b587680eFa917Ae19D53f1B66299383B51";
const GAS_LIMIT = 100_000;

const ENS_ABI = [
  "function setOwner(bytes32 node, address owner) external",
  "function owner(bytes32 node) external view returns (address)",
];

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("Set DEPLOYER_PRIVATE_KEY=0x... \nExample: DEPLOYER_PRIVATE_KEY=0x... node scripts/set-ens-owner.js");
    process.exit(1);
  }

  const fetchReq = new ethers.FetchRequest(SEPOLIA_RPC);
  fetchReq.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(fetchReq);

  const wallet = new ethers.Wallet(pk, provider);
  const network = await provider.getNetwork();

  console.log(`Network:      ${network.name} (chainId ${network.chainId})`);
  console.log(`ENS Registry: ${ENS_REGISTRY}`);
  console.log(`Node:         ${NODE}`);
  console.log(`New owner:    ${NEW_OWNER}`);
  console.log(`Gas limit:    ${GAS_LIMIT}`);
  console.log(`Caller:       ${wallet.address}`);

  const ens = new ethers.Contract(ENS_REGISTRY, ENS_ABI, provider);

  const currentOwner = await ens.owner(NODE);
  console.log(`Current owner: ${currentOwner}`);

  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`\nERROR: Wallet ${wallet.address} is NOT the current owner of this node.`);
    console.error(`Only the owner (${currentOwner}) can call setOwner.`);
    process.exit(1);
  }

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    console.error("Wallet has no Sepolia ETH for gas.");
    process.exit(1);
  }

  const connectedEns = ens.connect(wallet);
  console.log("\nSigning and sending ENSRegistry.setOwner(node, newOwner)...");
  const tx = await connectedEns.setOwner(NODE, NEW_OWNER, { gasLimit: GAS_LIMIT });
  console.log(`Tx hash: ${tx.hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log(`\nConfirmed in block ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);

  const updatedOwner = await ens.owner(NODE);
  console.log(`New owner of node: ${updatedOwner}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
