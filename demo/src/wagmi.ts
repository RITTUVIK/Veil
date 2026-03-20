import { createConfig, http } from "wagmi";
import { sepolia, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";

// WalletConnect project ID — get one free at https://cloud.walletconnect.com
// Injected wallets (MetaMask, Phantom, Coinbase) work without it.
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as
  | string
  | undefined;

export const config = createConfig({
  chains: [sepolia, baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "Veil" }),
    ...(projectId ? [walletConnect({ projectId })] : []),
  ],
  transports: {
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
  },
});
