#!/usr/bin/env node
// Signs and sends reclaimParentNode(newOwner) on the OLD VeilSubdomainRegistrar
// to transfer ENS parent-node ownership to the NEW registrar.
//
// Usage:
//   DEPLOYER_PRIVATE_KEY=0x... node scripts/reclaim-parent-node.js

const { ethers } = require("ethers");

// ── Config ──────────────────────────────────────────────────
const SEPOLIA_RPC = "https://eth-sepolia.g.alchemy.com/v2/78OPgYHR73VVP8jX3sact";
const OLD_REGISTRAR = "0xef98a68D3B1eDf705d31CCF8732152A15550145D";
const NEW_OWNER = "0x648a55268bCF42C1B4a3618589Bf1865B37EF3a8";
const GAS_LIMIT = 100_000;

const OLD_REGISTRAR_ABI = [
  "function reclaimParentNode(address newOwner) external",
  "function owner() external view returns (address)",
];

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("Set DEPLOYER_PRIVATE_KEY=0x...\nExample: DEPLOYER_PRIVATE_KEY=0x... node scripts/reclaim-parent-node.js");
    process.exit(1);
  }

  const fetchReq = new ethers.FetchRequest(SEPOLIA_RPC);
  fetchReq.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(fetchReq);

  const wallet = new ethers.Wallet(pk, provider);
  const network = await provider.getNetwork();

  console.log(`Network:        ${network.name} (chainId ${network.chainId})`);
  console.log(`Old registrar:  ${OLD_REGISTRAR}`);
  console.log(`New owner:      ${NEW_OWNER}`);
  console.log(`Gas limit:      ${GAS_LIMIT}`);
  console.log(`Caller:         ${wallet.address}`);

  const oldContract = new ethers.Contract(OLD_REGISTRAR, OLD_REGISTRAR_ABI, provider);

  const contractOwner = await oldContract.owner();
  console.log(`Contract owner: ${contractOwner}`);

  if (contractOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`\nERROR: Wallet ${wallet.address} is NOT the owner of the old registrar.`);
    console.error(`Only the owner (${contractOwner}) can call reclaimParentNode.`);
    process.exit(1);
  }

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    console.error("Wallet has no Sepolia ETH for gas.");
    process.exit(1);
  }

  const connectedContract = oldContract.connect(wallet);
  console.log("\nSigning and sending reclaimParentNode(newOwner)...");
  const tx = await connectedContract.reclaimParentNode(NEW_OWNER, { gasLimit: GAS_LIMIT });
  console.log(`Tx hash: ${tx.hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log(`\nConfirmed in block ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);
  console.log(`\nDone. reclaimParentNode called successfully.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
