/**
 * Locus service adapter.
 *
 * Hits the real Locus API when VITE_LOCUS_API_URL is set.
 * Falls back to deterministic simulation that mirrors real response shapes.
 *
 * Policy (allowance, max transaction, approval threshold) is configured in the
 * Locus dashboard — not via API. This layer reflects/displays policy state; it
 * does not mutate it.
 */

import { formatUsd } from "../lib/utils";

const LOCUS_API_URL = import.meta.env.VITE_LOCUS_API_URL as string | undefined;
const USE_SIMULATION = !LOCUS_API_URL;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface LocusAgent {
  agentId: string;
  walletAddress: string;
  network: "base";
}

export interface LocusWalletStatus {
  address: string;
  deployed: boolean;
  network: "base";
  balance: number;
}

export interface LocusPolicySnapshot {
  allowance: number;
  spent: number;
  remaining: number;
  maxTransactionSize: number;
  approvalThreshold: number | null; // null = no approval needed
}

export type SendResultStatus = "QUEUED" | "PENDING_APPROVAL" | "REJECTED";

export interface LocusSendResult {
  status: SendResultStatus;
  transactionId?: string;
  queueJobId?: string;
  approvalUrl?: string;
  reason?: string;
  amount: number;
  to: string;
  memo: string;
}

export interface SpendEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  predictedStatus: SendResultStatus;
}

// ────────────────────────────────────────────────────────────
// Client-side policy evaluation (pre-flight)
// ────────────────────────────────────────────────────────────

export function evaluateSpendAttempt(
  amount: number,
  policy: LocusPolicySnapshot,
): SpendEvaluation {
  if (amount <= 0) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: "Amount must be greater than zero.",
      predictedStatus: "REJECTED",
    };
  }

  if (amount > policy.maxTransactionSize) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Exceeds ${formatUsd(policy.maxTransactionSize)} per-transaction limit`,
      predictedStatus: "REJECTED",
    };
  }

  if (amount > policy.remaining) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `Exceeds remaining budget (${formatUsd(policy.remaining)})`,
      predictedStatus: "REJECTED",
    };
  }

  if (policy.approvalThreshold !== null && amount > policy.approvalThreshold) {
    return {
      allowed: true,
      requiresApproval: true,
      reason: `Above ${formatUsd(policy.approvalThreshold)} — needs human approval`,
      predictedStatus: "PENDING_APPROVAL",
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    reason: "Within spend limits — will auto-approve",
    predictedStatus: "QUEUED",
  };
}

// ────────────────────────────────────────────────────────────
// Simulation state & defaults
// ────────────────────────────────────────────────────────────

const SIM_POLICY = {
  allowance: 100,
  maxTransactionSize: 50,
  approvalThreshold: 20,
} as const;

let simSpent = 0;
let simWalletAddress = "";

function simPolicy(): LocusPolicySnapshot {
  return {
    allowance: SIM_POLICY.allowance,
    spent: simSpent,
    remaining: SIM_POLICY.allowance - simSpent,
    maxTransactionSize: SIM_POLICY.maxTransactionSize,
    approvalThreshold: SIM_POLICY.approvalThreshold,
  };
}

export function resetLocusState() {
  simSpent = 0;
  simWalletAddress = "";
}

// ────────────────────────────────────────────────────────────
// Simulated implementations
// ────────────────────────────────────────────────────────────

async function simRegisterAgent(agentName: string): Promise<LocusAgent> {
  await delay(800);
  simWalletAddress = randomAddress();
  return {
    agentId: randomId("agent"),
    walletAddress: simWalletAddress,
    network: "base",
  };
}

async function simGetWalletStatus(agent: LocusAgent): Promise<LocusWalletStatus> {
  await delay(400);
  return {
    address: agent.walletAddress,
    deployed: true,
    network: "base",
    balance: SIM_POLICY.allowance - simSpent,
  };
}

async function simGetPolicy(): Promise<LocusPolicySnapshot> {
  await delay(300);
  return simPolicy();
}

async function simSend(
  _agent: LocusAgent,
  to: string,
  amount: number,
  memo: string,
): Promise<LocusSendResult> {
  await delay(1200);

  const policy = simPolicy();
  const evaluation = evaluateSpendAttempt(amount, policy);

  if (evaluation.predictedStatus === "REJECTED") {
    return { status: "REJECTED", reason: evaluation.reason, amount, to, memo };
  }

  if (evaluation.predictedStatus === "PENDING_APPROVAL") {
    return {
      status: "PENDING_APPROVAL",
      transactionId: randomId("tx"),
      approvalUrl: `https://app.uselocus.com/approve/${randomId("req")}`,
      reason: evaluation.reason,
      amount,
      to,
      memo,
    };
  }

  simSpent += amount;
  return {
    status: "QUEUED",
    transactionId: randomId("tx"),
    queueJobId: randomId("job"),
    amount,
    to,
    memo,
  };
}

// ────────────────────────────────────────────────────────────
// Live API implementations
// ────────────────────────────────────────────────────────────

async function liveRegisterAgent(
  agentName: string,
  walletAddress: string,
): Promise<LocusAgent> {
  const res = await fetch(`${LOCUS_API_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: agentName, wallet_address: walletAddress }),
  });
  if (!res.ok) throw new Error(`Locus register failed: ${res.status}`);
  const data = await res.json();
  return {
    agentId: data.agent_id ?? data.id,
    walletAddress: data.wallet_address ?? walletAddress,
    network: "base",
  };
}

async function liveSend(
  _agent: LocusAgent,
  to: string,
  amount: number,
  memo: string,
): Promise<LocusSendResult> {
  const res = await fetch(`${LOCUS_API_URL}/api/pay/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to_address: to, amount, memo }),
  });
  const data = await res.json();

  if (res.status === 403) {
    return {
      status: "REJECTED",
      reason: data.error ?? data.message ?? "Policy violation",
      amount,
      to,
      memo,
    };
  }

  if (res.status === 202 && data.status === "PENDING_APPROVAL") {
    return {
      status: "PENDING_APPROVAL",
      transactionId: data.transaction_id,
      approvalUrl: data.approval_url,
      reason: "Requires human approval (amount exceeds threshold).",
      amount,
      to,
      memo,
    };
  }

  return {
    status: "QUEUED",
    transactionId: data.transaction_id,
    queueJobId: data.queue_job_id,
    amount,
    to,
    memo,
  };
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export async function registerLocusAgent(
  agentName: string,
  walletAddress: string,
): Promise<LocusAgent> {
  if (USE_SIMULATION) return simRegisterAgent(agentName);
  return liveRegisterAgent(agentName, walletAddress);
}

export async function getLocusWalletStatus(
  agent: LocusAgent,
): Promise<LocusWalletStatus> {
  // TODO: wire live wallet status endpoint when Locus exposes one
  return simGetWalletStatus(agent);
}

export async function getLocusPolicySnapshot(): Promise<LocusPolicySnapshot> {
  // TODO: wire live policy snapshot endpoint when Locus exposes one
  return simGetPolicy();
}

export async function executeLocusPayment(
  agent: LocusAgent,
  to: string,
  amount: number,
  memo: string,
): Promise<LocusSendResult> {
  if (USE_SIMULATION) return simSend(agent, to, amount, memo);
  return liveSend(agent, to, amount, memo);
}

// ────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHex(bytes: number): string {
  return Array.from({ length: bytes * 2 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

function randomAddress(): string {
  return `0x${randomHex(20)}`;
}

function randomId(prefix: string): string {
  return `${prefix}_${randomHex(12)}`;
}
