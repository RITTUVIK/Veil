import { Shield, CheckCircle } from "lucide-react";
import { truncAddr, formatUsd } from "../lib/utils";
import type { LocusWalletStatus, LocusPolicySnapshot } from "../services/locus";

interface LocusCardProps {
  walletStatus: LocusWalletStatus | null;
  policy: LocusPolicySnapshot | null;
}

export function LocusCard({ walletStatus, policy }: LocusCardProps) {
  const usedPct = policy ? Math.min((policy.spent / policy.allowance) * 100, 100) : 0;

  return (
    <div className="relative bg-white/[0.03] backdrop-blur-2xl border border-emerald-500/[0.15] rounded-2xl shadow-2xl shadow-emerald-500/[0.06] overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Spend Controls
          </h3>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-slate-600 font-medium">via Locus</span>
            {walletStatus?.deployed && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
          </span>
        </div>

        {walletStatus && (
          <div className="space-y-2 text-sm mb-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Wallet</span>
              <span className="text-slate-300 font-mono">{truncAddr(walletStatus.address)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Network</span>
              <span className="text-slate-300">Base (USDC)</span>
            </div>
          </div>
        )}

        {policy && (
          <>
            {/* Allowance bar */}
            <div className="bg-white/[0.03] rounded-lg border border-white/[0.06] p-3 mb-3">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-xs text-slate-500">Budget</span>
                <span className="text-sm font-mono">
                  <span className="text-emerald-400 font-medium">{formatUsd(policy.remaining)}</span>
                  <span className="text-slate-600"> / {formatUsd(policy.allowance)}</span>
                </span>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${100 - usedPct}%` }}
                />
              </div>
            </div>

            {/* Policy tiers */}
            <div className="space-y-1">
              <PolicyTier
                color="green"
                label={`Up to ${formatUsd(policy.approvalThreshold ?? policy.maxTransactionSize)}`}
                action="Auto-approved"
              />
              {policy.approvalThreshold !== null && policy.approvalThreshold > 0 && (
                <PolicyTier
                  color="amber"
                  label={`${formatUsd(policy.approvalThreshold)} – ${formatUsd(policy.maxTransactionSize)}`}
                  action="Needs human approval"
                />
              )}
              <PolicyTier
                color="red"
                label={`Above ${formatUsd(policy.maxTransactionSize)}`}
                action="Blocked"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PolicyTier({
  color,
  label,
  action,
}: {
  color: "green" | "amber" | "red";
  label: string;
  action: string;
}) {
  const dotColor =
    color === "green" ? "bg-green-400" : color === "amber" ? "bg-amber-400" : "bg-red-400";
  const textColor =
    color === "green"
      ? "text-green-400/80"
      : color === "amber"
        ? "text-amber-400/80"
        : "text-red-400/80";

  return (
    <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-white/[0.02]">
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
      <span className="text-xs text-slate-400 flex-1">{label}</span>
      <span className={`text-[11px] font-medium ${textColor}`}>{action}</span>
    </div>
  );
}
