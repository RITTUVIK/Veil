import { ethers } from "ethers";
import type { WalletClient } from "viem";

/**
 * Bridge a wagmi/viem WalletClient to ethers v6 Provider + Signer.
 * Used to pass wallet context into the Veil SDK which expects ethers types.
 */
export async function walletClientToEthers(walletClient: WalletClient) {
  const { account, chain, transport } = walletClient;
  if (!chain || !account) throw new Error("Wallet client missing chain or account");
  const network = { chainId: chain.id, name: chain.name };
  const provider = new ethers.BrowserProvider(transport, network);
  const signer = await provider.getSigner(account.address);
  return { provider, signer };
}
