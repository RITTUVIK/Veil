import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, ChevronDown, ExternalLink, Fingerprint } from "lucide-react";
import { truncAddr, truncHash } from "../lib/utils";

interface IdentityCardProps {
  agentEnsName: string;
  agentWalletAddress: string;
  ownerAddress: string;
  txHashes: Record<string, string | undefined>;
}

const TX_DISPLAY: Record<string, string> = {
  ensSetSubnodeOwner: "Subdomain",
  ensSetResolver: "Resolver",
  ensSetAddr: "Address record",
  reverseClaimForAddr: "Reverse claim",
  reverseSetName: "Reverse name",
  erc8004Register: "Identity mint",
  erc8004SetAgentWallet: "Wallet link",
};

export function IdentityCard({
  agentEnsName,
  agentWalletAddress,
  ownerAddress,
  txHashes,
}: IdentityCardProps) {
  const [txExpanded, setTxExpanded] = useState(false);

  return (
    <div className="relative bg-white/[0.03] backdrop-blur-2xl border border-blue-500/[0.15] rounded-2xl shadow-2xl shadow-blue-500/[0.06] overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Fingerprint className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Agent Identity
          </h3>
          <span className="ml-auto flex items-center gap-1.5 bg-green-500/[0.08] border border-green-500/[0.12] rounded-full px-2 py-0.5">
            <CheckCircle className="w-3 h-3 text-green-400" />
            <span className="text-[10px] text-green-400 font-semibold">Verified</span>
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Name</span>
            <span className="text-blue-400 font-mono font-medium">{agentEnsName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Agent wallet</span>
            <span className="text-slate-300 font-mono">{truncAddr(agentWalletAddress)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Human owner</span>
            <span className="text-slate-300 font-mono">{truncAddr(ownerAddress)}</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <button
            onClick={() => setTxExpanded(!txExpanded)}
            className="flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            {Object.values(txHashes).filter(Boolean).length} on-chain transactions
            <motion.div
              animate={{ rotate: txExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-3 h-3" />
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
                <div className="space-y-0.5 mt-2 bg-white/[0.02] rounded-lg border border-white/[0.06] p-1.5">
                  {Object.entries(txHashes).map(([key, hash]) =>
                    hash ? (
                      <div
                        key={key}
                        className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/[0.03] transition-colors"
                      >
                        <span className="text-[11px] text-slate-600">{TX_DISPLAY[key] ?? key}</span>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-blue-400/70 hover:text-blue-300 font-mono transition-colors"
                        >
                          {truncHash(hash)}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    ) : null,
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
