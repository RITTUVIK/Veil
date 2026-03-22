const solc = require("solc");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "contracts", "AgentRegistry.sol"),
  "utf8"
);

const input = {
  language: "Solidity",
  sources: { "AgentRegistry.sol": { content: source } },
  settings: {
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      console.error(err.formattedMessage);
      process.exit(1);
    }
  }
}

const contract = output.contracts["AgentRegistry.sol"]["AgentRegistry"];
const artifact = {
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
};

const outDir = path.join(__dirname, "..", "artifacts");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "AgentRegistry.json"),
  JSON.stringify(artifact, null, 2)
);

console.log("Compiled AgentRegistry.sol");
console.log("ABI:", JSON.stringify(artifact.abi));
console.log("Bytecode length:", artifact.bytecode.length, "chars");
