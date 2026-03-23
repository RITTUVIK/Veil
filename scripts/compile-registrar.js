#!/usr/bin/env node
// Compiles VeilSubdomainRegistrar.sol using solc and outputs ABI + bytecode.
// Usage: node scripts/compile-registrar.js

const solc = require("solc");
const fs = require("fs");
const path = require("path");

const contractPath = path.resolve(__dirname, "..", "contracts", "VeilSubdomainRegistrar.sol");
const source = fs.readFileSync(contractPath, "utf8");

const input = {
  language: "Solidity",
  sources: { "VeilSubdomainRegistrar.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === "error");
  if (fatal.length > 0) {
    console.error("Compilation errors:");
    fatal.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  // Print warnings but continue
  output.errors
    .filter((e) => e.severity === "warning")
    .forEach((e) => console.warn(e.formattedMessage));
}

const contract = output.contracts["VeilSubdomainRegistrar.sol"]["VeilSubdomainRegistrar"];
const artifact = {
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
};

const outDir = path.resolve(__dirname, "..", "artifacts");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "VeilSubdomainRegistrar.json");
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));

console.log(`Compiled successfully → ${outPath}`);
console.log(`  ABI entries: ${artifact.abi.length}`);
console.log(`  Bytecode size: ${(artifact.bytecode.length - 2) / 2} bytes`);
