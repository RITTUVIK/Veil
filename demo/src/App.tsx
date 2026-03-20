import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { config } from "./wagmi";
import { walletClientToEthers } from "./lib/ethersAdapter";
import {
  registerAgentIdentity,
  type RegisterAgentIdentityStep,
} from "../../src";
import { LampContainer } from "./components/ui/lamp";
import { IdentityCard } from "./components/IdentityCard";
import { LocusCard } from "./components/LocusCard";
import { ExecutionCard } from "./components/ExecutionCard";
import {
  registerLocusAgent,
  getLocusWalletStatus,
  getLocusPolicySnapshot,
  resetLocusState,
  type LocusAgent,
  type LocusWalletStatus,
  type LocusPolicySnapshot,
} from "./services/locus";
import { truncAddr } from "./lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, CheckCircle, XCircle, Loader2 } from "lucide-react";

// ────────────────────────────────────────────────────────────
// Step / state types
// ────────────────────────────────────────────────────────────

type Phase = "idle" | "registering" | "dashboard";
type DemoStepKey = RegisterAgentIdentityStep | "locus_register";
type StepStatus = "idle" | "running" | "ok" | "error";

interface StepInfo {
  key: DemoStepKey;
  label: string;
  status: StepStatus;
  txHash?: string;
}

const ALL_STEPS: { key: DemoStepKey; label: string }[] = [
  { key: "ens_subnodeOwner", label: "Create agent subdomain" },
  { key: "ens_setResolver", label: "Attach name resolver" },
  { key: "ens_setAddr", label: "Link name to wallet" },
  { key: "ens_reverseClaim", label: "Claim reverse record" },
  { key: "ens_reverseSetName", label: "Set reverse name" },
  { key: "erc8004_register", label: "Register on-chain identity" },
  { key: "erc8004_setAgentWallet", label: "Link agent wallet" },
  { key: "locus_register", label: "Set up spend wallet" },
];

const IDENTITY_STEP_KEYS = ALL_STEPS
  .filter((s) => s.key !== "locus_register")
  .map((s) => s.key);

// ────────────────────────────────────────────────────────────
// App
// ────────────────────────────────────────────────────────────

export default function App() {
  // ── Wallet (wagmi + RainbowKit) ────────────────────────
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  const onWrongNetwork = isConnected && chainId !== sepolia.id;

  // ── App phase ──────────────────────────────────────────
  const requestIdRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [agentWalletAddress, setAgentWalletAddress] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    agentEnsName: string;
    txHashes: Record<string, string | undefined>;
  }>(null);
  const [steps, setSteps] = useState<StepInfo[]>(
    ALL_STEPS.map((s) => ({ ...s, status: "idle" as StepStatus })),
  );

  // Locus state
  const [locusAgent, setLocusAgent] = useState<LocusAgent | null>(null);
  const [locusWallet, setLocusWallet] = useState<LocusWalletStatus | null>(null);
  const [locusPolicy, setLocusPolicy] = useState<LocusPolicySnapshot | null>(null);

  const labelSanitized = useMemo(() => label.trim().toLowerCase(), [label]);

  // Derive display state from connection + phase
  const appState = !isConnected
    ? "disconnected"
    : phase === "registering"
      ? "registering"
      : phase === "dashboard"
        ? "dashboard"
        : "ready";

  // ── Sync: reset when wallet disconnects or account changes ──

  const prevAddressRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prev = prevAddressRef.current;
    prevAddressRef.current = address;

    if (!isConnected || (prev && address && prev !== address)) {
      requestIdRef.current += 1;
      setPhase("idle");
      setError(null);
      setResult(null);
      setAgentWalletAddress(null);
      setSteps(ALL_STEPS.map((s) => ({ ...s, status: "idle" })));
      setLocusAgent(null);
      setLocusWallet(null);
      setLocusPolicy(null);
      resetLocusState();
    }
  }, [isConnected, address]);

  // ── Registration (identity + Locus) ────────────────────

  async function onRegister() {
    const requestId = ++requestIdRef.current;
    setError(null);
    setResult(null);
    setAgentWalletAddress(null);
    setLocusAgent(null);
    setLocusWallet(null);
    setLocusPolicy(null);
    resetLocusState();
    setSteps(ALL_STEPS.map((s) => ({ ...s, status: "idle" })));
    setPhase("registering");

    setSteps((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, status: "running" } : s)),
    );

    try {
      if (!labelSanitized) throw new Error("Enter an agent name.");

      const walletClient = await getWalletClient(config);
      if (!walletClient) throw new Error("Wallet not connected.");

      if (walletClient.chain.id !== sepolia.id) {
        throw new Error(
          `Switch to Sepolia first (currently on ${walletClient.chain.name}).`,
        );
      }

      const { provider, signer: humanSigner } =
        await walletClientToEthers(walletClient);
      const humanAddress = await humanSigner.getAddress();

      const agentSigner = humanSigner;
      const agentWallet = humanAddress;
      setAgentWalletAddress(agentWallet);

      // ── Steps 1-7: Veil identity registration ──

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
          const idx = IDENTITY_STEP_KEYS.indexOf(step);
          if (idx >= 0 && idx < IDENTITY_STEP_KEYS.length - 1) {
            const nextKey = IDENTITY_STEP_KEYS[idx + 1];
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

      // ── Step 8: Locus wallet setup ──

      setSteps((prev) =>
        prev.map((s) =>
          s.key === "locus_register" ? { ...s, status: "running" } : s,
        ),
      );

      const agent = await registerLocusAgent(res.agentEnsName, agentWallet);
      if (requestIdRef.current !== requestId) return;

      setSteps((prev) =>
        prev.map((s) =>
          s.key === "locus_register" ? { ...s, status: "ok" } : s,
        ),
      );
      setLocusAgent(agent);

      const [wallet, policy] = await Promise.all([
        getLocusWalletStatus(agent),
        getLocusPolicySnapshot(),
      ]);
      if (requestIdRef.current !== requestId) return;

      setLocusWallet(wallet);
      setLocusPolicy(policy);
      setPhase("dashboard");
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

  // ── Locus refresh (called after successful payment) ────

  const refreshLocusState = useCallback(async () => {
    if (!locusAgent) return;
    const [wallet, policy] = await Promise.all([
      getLocusWalletStatus(locusAgent),
      getLocusPolicySnapshot(),
    ]);
    setLocusWallet(wallet);
    setLocusPolicy(policy);
  }, [locusAgent]);

  // ── Reset ──────────────────────────────────────────────

  function resetToReady() {
    setPhase("idle");
    setError(null);
    setResult(null);
    setLabel("");
    setSteps(ALL_STEPS.map((s) => ({ ...s, status: "idle" })));
    setLocusAgent(null);
    setLocusWallet(null);
    setLocusPolicy(null);
    resetLocusState();
  }

  // ── Animations ─────────────────────────────────────────

  const fadeSlide = {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -16 },
    transition: { duration: 0.35, ease: "easeOut" as const },
  };

  // ══════════════════════════════════════════════════════════
  // RENDER: Dashboard
  // ══════════════════════════════════════════════════════════

  if (appState === "dashboard") {
    return (
      <div className="min-h-screen bg-black">
        <div className="h-1 bg-gradient-to-r from-blue-600 via-violet-500 to-emerald-500" />

        <div className="max-w-2xl mx-auto px-4 pt-8 pb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white tracking-tight">
              Veil
            </h1>
            <div className="flex items-center gap-3">
              <button
                onClick={resetToReady}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                New Agent
              </button>
              {address && (
                <button
                  onClick={openAccountModal}
                  className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5 hover:bg-white/[0.06] transition-colors"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-xs text-slate-400 font-mono">
                    {truncAddr(address)}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Agent hero */}
        {result && (
          <div className="max-w-2xl mx-auto px-4 pb-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
                className="w-11 h-11 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0"
              >
                <CheckCircle className="w-6 h-6 text-green-400" />
              </motion.div>
              <div>
                <p className="text-2xl font-mono text-blue-400 font-semibold leading-tight">
                  {result.agentEnsName}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">
                  Named, verified, and ready to operate
                </p>
              </div>
            </motion.div>
          </div>
        )}

        <div className="max-w-2xl mx-auto px-4 pb-12 space-y-4">
          {result && agentWalletAddress && address && (
            <motion.div {...fadeSlide}>
              <IdentityCard
                agentEnsName={result.agentEnsName}
                agentWalletAddress={agentWalletAddress}
                ownerAddress={address}
                txHashes={result.txHashes}
              />
            </motion.div>
          )}

          <motion.div {...fadeSlide} transition={{ delay: 0.1 }}>
            <LocusCard walletStatus={locusWallet} policy={locusPolicy} />
          </motion.div>

          {locusAgent && locusPolicy && (
            <motion.div {...fadeSlide} transition={{ delay: 0.2 }}>
              <ExecutionCard
                agent={locusAgent}
                policy={locusPolicy}
                onPolicyRefresh={refreshLocusState}
              />
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER: Lamp states (disconnected / ready / registering)
  // ══════════════════════════════════════════════════════════

  return (
    <LampContainer className="bg-black">
      <div className="w-full max-w-lg px-4">
        {/* Top bar: wallet badge + network warning */}
        <AnimatePresence>
          {address && appState !== "disconnected" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-end gap-2 mb-4"
            >
              {onWrongNetwork && (
                <button
                  onClick={() => switchChain({ chainId: sepolia.id })}
                  className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium rounded-full px-3 py-1.5 hover:bg-amber-500/20 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Switch to Sepolia
                </button>
              )}
              <button
                onClick={openAccountModal}
                className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5 hover:bg-white/[0.06] transition-colors"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    onWrongNetwork ? "bg-amber-400" : "bg-green-400"
                  }`}
                />
                <span className="text-xs text-slate-400 font-mono">
                  {truncAddr(address)}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main glass card */}
        <div className="relative bg-white/[0.03] backdrop-blur-2xl border border-blue-500/[0.15] rounded-2xl shadow-2xl shadow-blue-500/[0.06] overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

          <div className="p-8 sm:p-10">
            <AnimatePresence mode="wait">
              {/* ─── Disconnected ─── */}
              {appState === "disconnected" && (
                <motion.div
                  key="disconnected"
                  {...fadeSlide}
                  className="flex flex-col items-center text-center"
                >
                  <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight mb-3">
                    Veil
                  </h1>
                  <p className="text-slate-400 text-base sm:text-lg mb-10 max-w-xs leading-relaxed">
                    Identity and spend control for autonomous agents
                  </p>
                  <motion.button
                    onClick={openConnectModal}
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

              {/* ─── Ready ─── */}
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
                          if (e.key === "Enter" && labelSanitized) onRegister();
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

              {/* ─── Registering ─── */}
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
                            ? step.key === "locus_register"
                              ? "bg-emerald-500/[0.06] border border-emerald-500/[0.12]"
                              : "bg-blue-500/[0.06] border border-blue-500/[0.12]"
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
            </AnimatePresence>
          </div>
        </div>
      </div>
    </LampContainer>
  );
}

// ────────────────────────────────────────────────────────────
// Shared sub-components
// ────────────────────────────────────────────────────────────

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
