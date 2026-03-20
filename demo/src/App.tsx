import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  registerAgentIdentity,
  type RegisterAgentIdentityStep,
} from "../../src";
import { LampContainer } from "./components/ui/lamp";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";

type AppState = "disconnected" | "ready" | "registering" | "success";
type StepStatus = "idle" | "running" | "ok" | "error";

interface StepInfo {
  key: RegisterAgentIdentityStep;
  label: string;
  status: StepStatus;
  txHash?: string;
}

const ALL_STEPS: { key: RegisterAgentIdentityStep; label: string }[] = [
  { key: "ens_subnodeOwner", label: "ENS subdomain creation" },
  { key: "ens_setResolver", label: "ENS resolver setup" },
  { key: "ens_setAddr", label: "ENS address record" },
  { key: "ens_reverseClaim", label: "ENS reverse claim" },
  { key: "ens_reverseSetName", label: "ENS reverse name" },
  { key: "erc8004_register", label: "ERC-8004 passport" },
  { key: "erc8004_setAgentWallet", label: "ERC-8004 agent wallet link" },
];

const TX_DISPLAY: Record<string, string> = {
  ensSetSubnodeOwner: "ENS Subdomain",
  ensSetResolver: "ENS Resolver",
  ensSetAddr: "ENS Address",
  reverseClaimForAddr: "Reverse Claim",
  reverseSetName: "Reverse Name",
  erc8004Register: "ERC-8004 Register",
  erc8004SetAgentWallet: "Agent Wallet Link",
};

function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function truncHash(hash: string) {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function getInjectedProvider(): any {
  const eth = window.ethereum;
  if (!eth) return undefined;

  // When multiple wallets are installed, prefer MetaMask explicitly.
  const providers: any[] = Array.isArray(eth.providers) ? eth.providers : [eth];
  const metaMaskProvider = providers.find((p) => p?.isMetaMask);
  return metaMaskProvider ?? eth;
}

export default function App() {
  const requestIdRef = useRef(0);
  const [appState, setAppState] = useState<AppState>("disconnected");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [onWrongNetwork, setOnWrongNetwork] = useState(false);
  const [agentWalletAddress, setAgentWalletAddress] = useState<string | null>(
    null,
  );
  const [result, setResult] = useState<null | {
    agentEnsName: string;
    txHashes: Record<string, string | undefined>;
  }>(null);
  const [txExpanded, setTxExpanded] = useState(false);
  const [steps, setSteps] = useState<StepInfo[]>(
    ALL_STEPS.map((s) => ({ ...s, status: "idle" as StepStatus })),
  );

  const labelSanitized = useMemo(() => label.trim().toLowerCase(), [label]);

  async function getCurrentChainId(): Promise<number> {
    const provider = getInjectedProvider();
    if (!provider) throw new Error("No EVM wallet found. Install MetaMask.");
    const hex = await provider.request({ method: "eth_chainId" });
    return Number.parseInt(String(hex), 16);
  }

  async function switchToSepolia(): Promise<void> {
    const provider = getInjectedProvider();
    if (!provider)
      throw new Error("MetaMask not found. Please install/enable MetaMask.");
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_HEX }],
      });
    } catch (switchError: any) {
      if (switchError?.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_CHAIN_HEX,
              chainName: "Sepolia",
              nativeCurrency: {
                name: "Sepolia ETH",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        return;
      }
      throw switchError;
    }
  }

  async function syncWalletState(preferredAddress?: string | null) {
    const provider = getInjectedProvider();
    if (!provider) return;

    const accountsRaw = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    const accounts = accountsRaw.map((a) => String(a));

    if (accounts.length === 0) {
      setWalletAddress(null);
      setAppState("disconnected");
      return;
    }

    const selected =
      (preferredAddress &&
        accounts.find(
          (a) => a.toLowerCase() === preferredAddress.toLowerCase(),
        )) ||
      (walletAddress &&
        accounts.find(
          (a) => a.toLowerCase() === walletAddress.toLowerCase(),
        )) ||
      accounts[0];

    setWalletAddress(selected);
    if (appState === "disconnected") setAppState("ready");

    const chainId = await getCurrentChainId();
    setOnWrongNetwork(chainId !== SEPOLIA_CHAIN_ID);
  }

  async function connectWallet() {
    setError(null);
    try {
      const provider = getInjectedProvider();
      if (!provider) throw new Error("Install MetaMask to continue.");

      await provider.request({ method: "eth_requestAccounts" });
      await syncWalletState();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function onManualSwitchNetwork() {
    setError(null);
    try {
      await switchToSepolia();
      setOnWrongNetwork(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function onRegister() {
    const requestId = ++requestIdRef.current;
    setError(null);
    setResult(null);
    setTxExpanded(false);
    setAgentWalletAddress(null);
    setSteps(ALL_STEPS.map((s) => ({ ...s, status: "idle" })));
    setAppState("registering");

    setSteps((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, status: "running" } : s)),
    );

    try {
      const injectedProvider = getInjectedProvider();
      if (!injectedProvider) throw new Error("No wallet found.");
      if (!labelSanitized) throw new Error("Enter an agent name.");

      const provider = new ethers.BrowserProvider(injectedProvider);
      const selectedAddress = walletAddress ?? undefined;
      const humanSigner = selectedAddress
        ? await provider.getSigner(selectedAddress)
        : await provider.getSigner();
      const humanAddress = await humanSigner.getAddress();

      const currentChainId = await getCurrentChainId();
      if (currentChainId !== SEPOLIA_CHAIN_ID) {
        throw new Error(
          `Switch to Sepolia first (current chain: ${currentChainId}).`,
        );
      }

      const agentSigner = humanSigner;
      const agentWallet = humanAddress;
      setAgentWalletAddress(agentWallet);

      const stepKeys = ALL_STEPS.map((s) => s.key);

      const res = await registerAgentIdentity({
        provider,
        humanSigner,
        agentSigner,
        agentWalletAddress: agentWallet,
        label: labelSanitized,
        onStep: (step: RegisterAgentIdentityStep, txHash?: string) => {
          if (requestIdRef.current !== requestId) return;
          setSteps((prev) =>
            prev.map((s) =>
              s.key === step ? { ...s, status: "ok", txHash } : s,
            ),
          );
          const idx = stepKeys.indexOf(step);
          if (idx < stepKeys.length - 1) {
            const nextKey = stepKeys[idx + 1];
            setSteps((prev) =>
              prev.map((s) =>
                s.key === nextKey ? { ...s, status: "running" } : s,
              ),
            );
          }
        },
      });

      if (requestIdRef.current !== requestId) return;
      setResult(res);
      setAppState("success");
    } catch (e: any) {
      if (requestIdRef.current !== requestId) return;
      setError(e?.message ?? String(e));
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running" ? { ...s, status: "error" } : s,
        ),
      );
    }
  }

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        requestIdRef.current += 1;
        setWalletAddress(null);
        setAppState("disconnected");
        setOnWrongNetwork(false);
        setResult(null);
        setAgentWalletAddress(null);
        setSteps(ALL_STEPS.map((s) => ({ ...s, status: "idle" })));
        return;
      }
      requestIdRef.current += 1;
      setWalletAddress(accounts[0]);
      setAppState("ready");
      setResult(null);
      setAgentWalletAddress(null);
      setSteps(ALL_STEPS.map((s) => ({ ...s, status: "idle" })));
    };

    const handleChainChanged = (chainHex: string) => {
      const chainId = Number.parseInt(String(chainHex), 16);
      setOnWrongNetwork(chainId !== SEPOLIA_CHAIN_ID);
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    syncWalletState().catch(() => {});

    return () => {
      provider?.removeListener?.("accountsChanged", handleAccountsChanged);
      provider?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  function resetToReady() {
    setAppState("ready");
    setError(null);
    setResult(null);
    setLabel("");
    setSteps(ALL_STEPS.map((s) => ({ ...s, status: "idle" })));
  }

  const fadeSlide = {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -16 },
    transition: { duration: 0.35, ease: "easeOut" as const },
  };

  return (
    <LampContainer className="bg-black">
      <div className="w-full max-w-lg px-4">
        {/* Top bar: wallet badge + network warning */}
        <AnimatePresence>
          {walletAddress && appState !== "disconnected" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-end gap-2 mb-4"
            >
              {onWrongNetwork && (
                <button
                  onClick={onManualSwitchNetwork}
                  className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium rounded-full px-3 py-1.5 hover:bg-amber-500/20 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Switch to Sepolia
                </button>
              )}
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    onWrongNetwork ? "bg-amber-400" : "bg-green-400"
                  }`}
                />
                <span className="text-xs text-slate-400 font-mono">
                  {truncAddr(walletAddress)}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main glass card */}
        <div className="relative bg-white/[0.03] backdrop-blur-2xl border border-blue-500/[0.15] rounded-2xl shadow-2xl shadow-blue-500/[0.06] overflow-hidden">
          {/* Subtle top glow */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

          <div className="p-8 sm:p-10">
            <AnimatePresence mode="wait">
              {/* ─── STATE 1: Disconnected ─── */}
              {appState === "disconnected" && (
                <motion.div
                  key="disconnected"
                  {...fadeSlide}
                  className="flex flex-col items-center text-center"
                >
                  <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight mb-3">
                    Veil
                  </h1>
                  <p className="text-slate-400 text-base sm:text-lg mb-10 max-w-xs">
                    Identity Infrastructure for AI Agents
                  </p>
                  <motion.button
                    onClick={() => connectWallet()}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold px-8 py-4 rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30"
                  >
                    <Wallet className="w-5 h-5" />
                    Connect Wallet
                  </motion.button>

                  {error && <ErrorBanner message={error} />}
                </motion.div>
              )}

              {/* ─── STATE 2: Ready ─── */}
              {appState === "ready" && (
                <motion.div
                  key="ready"
                  {...fadeSlide}
                  className="flex flex-col"
                >
                  <h2 className="text-2xl font-semibold text-white mb-8 text-center">
                    Register your agent
                  </h2>

                  <div className="mb-6">
                    <label className="text-sm text-slate-500 mb-2 block font-medium">
                      Agent name
                    </label>
                    <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl focus-within:border-blue-500/40 transition-colors">
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="myagent"
                        className="flex-1 bg-transparent text-white text-lg px-4 py-3.5 outline-none placeholder:text-slate-700 font-mono"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && labelSanitized)
                            onRegister();
                        }}
                      />
                      <span className="text-slate-600 pr-4 text-sm font-mono">
                        .veilsdk.eth
                      </span>
                    </div>
                  </div>

                  <motion.button
                    onClick={onRegister}
                    disabled={!labelSanitized || onWrongNetwork}
                    whileHover={labelSanitized ? { scale: 1.02 } : {}}
                    whileTap={labelSanitized ? { scale: 0.98 } : {}}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30 text-lg"
                  >
                    Register Agent
                  </motion.button>
                  {onWrongNetwork && (
                    <p className="mt-3 text-center text-xs text-amber-400">
                      Switch to Sepolia to continue.
                    </p>
                  )}

                  {error && <ErrorBanner message={error} />}
                </motion.div>
              )}

              {/* ─── STATE 3: Registering ─── */}
              {appState === "registering" && (
                <motion.div key="registering" {...fadeSlide}>
                  <h2 className="text-xl font-semibold text-white mb-1 text-center">
                    Registering
                  </h2>
                  <p className="text-blue-400 font-mono text-center mb-8 text-sm">
                    {labelSanitized}.veilsdk.eth
                  </p>

                  <div className="space-y-1.5">
                    {steps.map((step, i) => (
                      <motion.div
                        key={step.key}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: i * 0.06,
                          duration: 0.3,
                          ease: "easeOut",
                        }}
                        className={`flex items-center justify-between py-3 px-4 rounded-xl transition-colors duration-300 ${
                          step.status === "running"
                            ? "bg-blue-500/[0.06] border border-blue-500/[0.12]"
                            : step.status === "ok"
                              ? "bg-green-500/[0.04] border border-green-500/[0.08]"
                              : step.status === "error"
                                ? "bg-red-500/[0.06] border border-red-500/[0.12]"
                                : "bg-white/[0.02] border border-transparent"
                        }`}
                      >
                        <span
                          className={`text-sm font-medium transition-colors duration-300 ${
                            step.status === "idle"
                              ? "text-slate-600"
                              : step.status === "running"
                                ? "text-white"
                                : step.status === "ok"
                                  ? "text-slate-300"
                                  : "text-red-400"
                          }`}
                        >
                          {step.label}
                        </span>
                        <StepIcon status={step.status} />
                      </motion.div>
                    ))}
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6"
                    >
                      <ErrorBanner message={error} />
                      <button
                        onClick={resetToReady}
                        className="w-full mt-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 font-medium py-2.5 rounded-xl transition-colors text-sm"
                      >
                        Try Again
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* ─── STATE 4: Success ─── */}
              {appState === "success" && result && (
                <motion.div
                  key="success"
                  {...fadeSlide}
                  className="flex flex-col items-center text-center"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 12,
                    }}
                    className="mb-5"
                  >
                    <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                      <CheckCircle className="w-9 h-9 text-green-400" />
                    </div>
                  </motion.div>

                  <motion.h2
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-2xl font-semibold text-white mb-3"
                  >
                    Agent Registered
                  </motion.h2>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-2xl font-mono text-blue-400 mb-1"
                  >
                    {result.agentEnsName}
                  </motion.p>

                  {agentWalletAddress && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.35 }}
                      className="text-sm text-slate-500 font-mono mb-8"
                    >
                      {truncAddr(agentWalletAddress)}
                    </motion.p>
                  )}

                  {/* Collapsible tx hashes */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="w-full"
                  >
                    <button
                      onClick={() => setTxExpanded(!txExpanded)}
                      className="flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mx-auto mb-3"
                    >
                      View Transaction Hashes
                      <motion.div
                        animate={{ rotate: txExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {txExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-1 bg-white/[0.02] rounded-xl border border-white/[0.06] p-3">
                            {Object.entries(result.txHashes).map(
                              ([key, hash]) =>
                                hash && (
                                  <div
                                    key={key}
                                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors"
                                  >
                                    <span className="text-xs text-slate-500">
                                      {TX_DISPLAY[key] ?? key}
                                    </span>
                                    <a
                                      href={`https://sepolia.etherscan.io/tx/${hash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-mono transition-colors"
                                    >
                                      {truncHash(hash)}
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                ),
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.45 }}
                    onClick={resetToReady}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="mt-6 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 font-medium px-8 py-3 rounded-xl transition-all duration-200"
                  >
                    Register Another Agent
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </LampContainer>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "idle")
    return (
      <div className="w-5 h-5 rounded-full border border-slate-700/60" />
    );
  if (status === "running")
    return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
  if (status === "ok")
    return <CheckCircle className="w-5 h-5 text-green-400" />;
  return <XCircle className="w-5 h-5 text-red-400" />;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-5 p-4 bg-red-500/[0.06] border border-red-500/[0.15] rounded-xl text-red-400 text-sm text-left leading-relaxed break-words"
    >
      {message}
    </motion.div>
  );
}
