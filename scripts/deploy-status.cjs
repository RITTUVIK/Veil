const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const artifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "artifacts", "AgentRegistry.json"), "utf8")
);

const RPC_URL = "https://public.sepolia.rpc.status.network";
const CHAIN_ID = 1660990954;

async function main() {
  const keyFile = path.join(__dirname, "..", ".deployer-key");
  let privateKey;
  if (fs.existsSync(keyFile)) {
    privateKey = fs.readFileSync(keyFile, "utf8").trim();
  } else {
    const wallet = ethers.Wallet.createRandom();
    privateKey = wallet.privateKey;
    fs.writeFileSync(keyFile, privateKey);
    console.log("Generated deployer wallet:", wallet.address);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL, {
    chainId: CHAIN_ID,
    name: "status-sepolia",
  });

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Deployer address:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // Check network fee data
  const feeData = await provider.getFeeData();
  console.log("Fee data:", JSON.stringify({
    gasPrice: feeData.gasPrice?.toString(),
    maxFeePerGas: feeData.maxFeePerGas?.toString(),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
  }));

  // Try estimating gas for the deployment
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployTx = await factory.getDeployTransaction();
  console.log("Deploy data length:", deployTx.data.length, "chars");

  try {
    const estimate = await provider.estimateGas({
      from: wallet.address,
      data: deployTx.data,
    });
    console.log("Estimated gas:", estimate.toString());
  } catch (e) {
    console.log("estimateGas error:", e.message);
  }

  // Try with type 0 legacy tx, letting gas be estimated naturally
  console.log("\nDeploying AgentRegistry to Status Network Sepolia...");
  const contract = await factory.deploy({
    type: 0,
    gasPrice: 0,
  });

  const tx = contract.deploymentTransaction();
  console.log("Deploy tx hash:", tx.hash);
  console.log("Gas limit in tx:", tx.gasLimit?.toString());
  console.log("Waiting for confirmation...");

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\n=== DEPLOYMENT SUCCESSFUL ===");
  console.log("Contract address:", address);
  console.log("Deploy tx hash:", tx.hash);
  console.log("Explorer:", `https://sepoliascan.status.network/tx/${tx.hash}`);

  // Save deployment info
  const deployInfo = {
    network: "Status Network Sepolia Testnet",
    chainId: CHAIN_ID,
    contractAddress: address,
    deployTxHash: tx.hash,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, "..", "artifacts", "deployment-status.json"),
    JSON.stringify(deployInfo, null, 2)
  );
  console.log("Deployment info saved to artifacts/deployment-status.json");

  // Test: register a sample agent
  console.log("\nTesting registerAgent...");
  const registryContract = new ethers.Contract(address, artifact.abi, wallet);
  const regTx = await registryContract.registerAgent("test.veilsdk.eth", wallet.address, {
    type: 0,
    gasPrice: 0,
  });
  console.log("Register tx hash:", regTx.hash);
  await regTx.wait();
  console.log("Register tx confirmed!");
  console.log("Explorer:", `https://sepoliascan.status.network/tx/${regTx.hash}`);

  deployInfo.testRegisterTxHash = regTx.hash;
  fs.writeFileSync(
    path.join(__dirname, "..", "artifacts", "deployment-status.json"),
    JSON.stringify(deployInfo, null, 2)
  );
}

main().catch((err) => {
  console.error("Deploy failed:", err.message || err);
  process.exit(1);
});
