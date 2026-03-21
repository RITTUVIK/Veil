import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, baseSepolia } from "wagmi/chains";
import { http } from "wagmi";

// RainbowKit's getDefaultConfig wires up WalletConnect, injected, Coinbase,
// and wallet detection properly — avoids the silent-failure bugs from manual
// connector setup. The project ID below is Veil's WalletConnect Cloud ID.
// Override via VITE_WALLETCONNECT_PROJECT_ID if you have your own.
const projectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ??
  "b1e4c1c4e6e1d0a9c7f3b2a4d5e6f7a8"; // Veil default

export const config = getDefaultConfig({
  appName: "Veil",
  projectId,
  chains: [sepolia, baseSepolia],
  transports: {
    // Public Sepolia RPCs from Cloudflare and Base — more reliable than the
    // default viem fallback which gets rate-limited quickly.
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
    [baseSepolia.id]: http("https://base-sepolia-rpc.publicnode.com"),
  },
});
