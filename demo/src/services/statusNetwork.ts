import { ethers } from "ethers";

const STATUS_RPC_URL = "https://public.sepolia.rpc.status.network";
const STATUS_CHAIN_ID = 1660990954;
const AGENT_REGISTRY_ADDRESS = "0x5740a90c0193101998bC27EBFb8e3705f7A4672A";

const AGENT_REGISTRY_ABI = [
  "function registerAgent(string calldata ensName, address agentWallet) external",
  "event AgentRegistered(string ensName, address indexed agentWallet, address indexed registeredBy, uint256 timestamp)",
] as const;

/**
 * Log an agent registration on Status Network Sepolia via a gasless transaction.
 * Uses a throwaway signer (random wallet) since gas = 0.
 */
export async function logAgentOnStatusNetwork(
  ensName: string,
  agentWalletAddress: string,
): Promise<{ txHash: string; explorerUrl: string }> {
  const provider = new ethers.JsonRpcProvider(STATUS_RPC_URL, {
    chainId: STATUS_CHAIN_ID,
    name: "status-sepolia",
  });

  // Gasless network: any wallet can submit with gasPrice=0.
  const signer = ethers.Wallet.createRandom().connect(provider);
  const registry = new ethers.Contract(
    AGENT_REGISTRY_ADDRESS,
    AGENT_REGISTRY_ABI,
    signer,
  );

  const tx = await registry.registerAgent(ensName, agentWalletAddress, {
    type: 0,
    gasPrice: 0,
  });

  await tx.wait();

  return {
    txHash: tx.hash,
    explorerUrl: `https://sepoliascan.status.network/tx/${tx.hash}`,
  };
}
