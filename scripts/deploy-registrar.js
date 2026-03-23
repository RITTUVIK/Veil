#!/usr/bin/env node
// Deploys VeilSubdomainRegistrar to Sepolia.
//
// Usage (two modes):
//
//   1. Private key (for funded wallets you control):
//      DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy-registrar.js
//
//   2. Print unsigned tx (sign in MetaMask or any other wallet):
//      node scripts/deploy-registrar.js --unsigned
//      → prints the raw deployment tx data you can paste into MetaMask's "Send Raw Transaction"
//
// The script NEVER asks for or stores private keys interactively.

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ── Config ──────────────────────────────────────────────────
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";

// namehash("veilsdk.eth") — precomputed
// namehash("eth")   = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")))
// namehash("veilsdk.eth") = keccak256(abi.encodePacked(namehash("eth"), keccak256("veilsdk")))
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

async function main() {
  const artifactPath = path.resolve(__dirname, "..", "artifacts", "VeilSubdomainRegistrar.json");
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found. Run `node scripts/compile-registrar.js` first.");
    process.exit(1);
  }

  const { abi, bytecode } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const network = await provider.getNetwork();
  console.log(`Network: ${network.name} (chainId ${network.chainId})`);
  console.log(`ENS Registry:    ${ENS_REGISTRY}`);
  console.log(`Public Resolver: ${PUBLIC_RESOLVER}`);
  console.log(`Parent node:     ${PARENT_NODE}`);

  const unsignedMode = process.argv.includes("--unsigned");

  if (unsignedMode) {
    // ── Unsigned mode: print the deployment tx data ──
    const factory = new ethers.ContractFactory(abi, bytecode);
    const deployTx = await factory.getDeployTransaction(ENS_REGISTRY, PARENT_NODE, PUBLIC_RESOLVER);
    console.log("\n── Unsigned deployment transaction ──");
    console.log("To: null (contract creation)");
    console.log(`Data (paste into wallet):\n${deployTx.data}`);
    console.log(`\nData length: ${(deployTx.data.length - 2) / 2} bytes`);
    console.log("\nPaste this data into MetaMask → Send → Hex Data field with no 'To' address.");
    return;
  }

  // ── Signed mode: deploy with private key ──
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error(
      "Set DEPLOYER_PRIVATE_KEY=0x... or use --unsigned mode.\n" +
      "Example: DEPLOYER_PRIVATE_KEY=0xabc123 node scripts/deploy-registrar.js"
    );
    process.exit(1);
  }

  const wallet = new ethers.Wallet(pk, provider);
  console.log(`Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    console.error("Deployer has no Sepolia ETH. Fund it first.");
    process.exit(1);
  }

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log("\nDeploying VeilSubdomainRegistrar...");
  const contract = await factory.deploy(ENS_REGISTRY, PARENT_NODE, PUBLIC_RESOLVER);
  console.log(`Tx hash: ${contract.deploymentTransaction().hash}`);
  console.log("Waiting for confirmation...");

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`\n✓ Deployed at: ${address}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Go to https://sepolia.app.ens.domains/veilsdk.eth`);
  console.log(`  2. Transfer ownership of veilsdk.eth to ${address}`);
  console.log(`  3. Update DEFAULTS.subdomainRegistrarAddress in the SDK to "${address}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
