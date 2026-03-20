import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  CheckCircle,
  Clock,
  ShieldOff,
  ExternalLink,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { formatUsd } from "../lib/utils";
import type {
  LocusAgent,
  LocusPolicySnapshot,
  LocusSendResult,
  SpendEvaluation,
} from "../services/locus";
import { evaluateSpendAttempt, executeLocusPayment } from "../services/locus";

interface ExecutionCardProps {
  agent: LocusAgent;
  policy: LocusPolicySnapshot;
  onPolicyRefresh: () => void;
}

export function ExecutionCard({ agent, policy, onPolicyRefresh }: ExecutionCardProps) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<LocusSendResult[]>([]);

  const parsedAmount = parseFloat(amount) || 0;
  const evaluation: SpendEvaluation | null =
    to && parsedAmount > 0 ? evaluateSpendAttempt(parsedAmount, policy) : null;

  async function onSend() {
    if (!to || !parsedAmount || sending) return;
    setSending(true);
    try {
      const result = await executeLocusPayment(agent, to, parsedAmount, memo || "Agent payment");
      setResults((prev) => [result, ...prev]);
      if (result.status === "QUEUED") onPolicyRefresh();
    } catch (e: any) {
      setResults((prev) => [
        {
          status: "REJECTED" as const,
          reason: e?.message ?? String(e),
          amount: parsedAmount,
          to,
          memo: memo || "Agent payment",
        },
        ...prev,
      ]);
    } finally {
      setSending(false);
      setAmount("");
      setMemo("");
    }
  }

  return (
    <div className="relative bg-white/[0.03] backdrop-blur-2xl border border-violet-500/[0.15] rounded-2xl shadow-2xl shadow-violet-500/[0.06] overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Send className="w-4 h-4 text-violet-400" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Send USDC
          </h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Recipient</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x..."
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none placeholder:text-slate-700 focus:border-violet-500/40 transition-colors"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-slate-500 mb-1 block">Amount (USDC)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white font-mono outline-none placeholder:text-slate-700 focus:border-violet-500/40 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-slate-500 mb-1 block">Memo</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Optional"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-700 focus:border-violet-500/40 transition-colors"
              />
            </div>
          </div>

          {/* Pre-flight policy check */}
          <AnimatePresence mode="wait">
            {evaluation && (
              <motion.div
                key={evaluation.predictedStatus}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium ${
                  evaluation.predictedStatus === "QUEUED"
                    ? "bg-green-500/[0.06] border border-green-500/[0.12] text-green-400"
                    : evaluation.predictedStatus === "PENDING_APPROVAL"
                      ? "bg-amber-500/[0.06] border border-amber-500/[0.12] text-amber-400"
                      : "bg-red-500/[0.06] border border-red-500/[0.12] text-red-400"
                }`}
              >
                {evaluation.predictedStatus === "QUEUED" && (
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                )}
                {evaluation.predictedStatus === "PENDING_APPROVAL" && (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                {evaluation.predictedStatus === "REJECTED" && (
                  <ShieldOff className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{evaluation.reason}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            onClick={onSend}
            disabled={!to || !parsedAmount || sending}
            whileHover={to && parsedAmount ? { scale: 1.02 } : {}}
            whileTap={to && parsedAmount ? { scale: 0.98 } : {}}
            className="w-full bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Payment
              </>
            )}
          </motion.button>
        </div>

        {/* Results */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 space-y-2"
            >
              <p className="text-[11px] text-slate-600 font-medium uppercase tracking-wider">
                Results
              </p>
              {results.map((r, i) => (
                <ResultCard key={`${r.transactionId ?? "err"}-${i}`} result={r} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: LocusSendResult }) {
  if (result.status === "PENDING_APPROVAL") return <PendingApprovalCard result={result} />;
  if (result.status === "REJECTED") return <RejectedCard result={result} />;
  return <QueuedCard result={result} />;
}

function QueuedCard({ result }: { result: LocusSendResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border p-3 bg-green-500/[0.04] border-green-500/[0.1]"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold text-green-400">Approved</span>
        </div>
        <span className="text-sm font-mono text-white">{formatUsd(result.amount)}</span>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">Payment queued for execution</p>
      <div className="space-y-0.5 text-[11px]">
        {result.transactionId && (
          <div className="flex justify-between">
            <span className="text-slate-600">Ref</span>
            <span className="text-slate-400 font-mono">{result.transactionId}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PendingApprovalCard({ result }: { result: LocusSendResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="rounded-xl border-2 p-4 bg-amber-500/[0.06] border-amber-500/[0.2]"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-400">Awaiting Human Approval</span>
        </div>
        <span className="text-sm font-mono text-white">{formatUsd(result.amount)}</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        This transaction exceeds the approval threshold. A human must review and approve it before execution.
      </p>
      {result.approvalUrl && (
        <a
          href={result.approvalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 font-medium text-xs px-4 py-2 rounded-lg transition-colors"
        >
          Review & Approve
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {result.transactionId && (
        <div className="flex justify-between mt-2 text-[11px]">
          <span className="text-slate-600">Ref</span>
          <span className="text-slate-400 font-mono">{result.transactionId}</span>
        </div>
      )}
    </motion.div>
  );
}

function RejectedCard({ result }: { result: LocusSendResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border p-3 bg-red-500/[0.04] border-red-500/[0.1]"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-red-400" />
          <span className="text-xs font-semibold text-red-400">Blocked by Policy</span>
        </div>
        <span className="text-sm font-mono text-white">{formatUsd(result.amount)}</span>
      </div>
      {result.reason && (
        <p className="text-[11px] text-slate-500 mt-1">{result.reason}</p>
      )}
    </motion.div>
  );
}
