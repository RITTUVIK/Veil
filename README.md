# Veil — Identity Infrastructure for AI Agents

AI agents are anonymous. When an agent takes an action, makes a payment, or talks to another agent — nobody knows who it is, who built it, or whether it can be trusted.

Veil fixes the identity side with **one SDK call**: your agent gets a `.eth` name, an ERC-8004 passport, and an on-chain link between the agent wallet and the human who owns the parent ENS name.

The **demo app** goes one step further and wires **Locus** (Base) so you can show **USDC spend controls** next to that identity — budget tiers, approvals, and a send flow (simulated or against a real API if you configure it).

---

## How it works (SDK)

```ts
import { ethers } from "ethers";
import { registerAgentIdentity } from "veil";

const result = await registerAgentIdentity({
  provider,
  humanSigner, // must own `veilsdk.eth` (or your `rootName`) on this network
  agentSigner, // must match `agentWalletAddress`; signs reverse claim + EIP-712 for ERC-8004
  agentWalletAddress: "0xYourAgentAddress",
  label: "myagent",
});

console.log(result.agentEnsName); // e.g. myagent.veilsdk.eth
console.log(result.txHashes); // proof: 7 Ethereum txs (ENS + ERC-8004)
```

**`registerAgentIdentity()`** performs **7 on-chain steps** (Sepolia by default):

1. Create `myagent.veilsdk.eth` as a subdomain under `veilsdk.eth`
2. Attach the public resolver to the name
3. Set the name’s `addr` to the agent wallet
4. Reverse claim for the agent address (`claimForAddr` — **must be sent as the agent**)
5. Set reverse name (wallet → ENS)
6. Register the agent in the **ERC-8004 Identity Registry**
7. Link the agent wallet with **`setAgentWallet`** using an **EIP-712** signature from the agent key

> **Note:** The agent wallet needs enough Sepolia ETH to pay for its txs (especially the reverse claim). The demo often uses the **same** connected wallet for human + agent so you don’t fund a second key; the SDK still supports a **separate** agent key if you fund it.

---

## Locus (demo only — step 8)

The **npm package `veil`** does not call Locus. After identity registration succeeds, the **React demo** calls `registerLocusAgent()` so judges can see:

- A **Locus-facing** agent record and spend UI (see `demo/src/services/locus.ts`)
- **Wallet status + policy** in the UI — today those are still **simulated** unless you wire real endpoints; **register** and **pay/send** can hit your API when `VITE_LOCUS_API_URL` is set

So: **7 txs = SDK**; **“step 8” = demo integration** (Locus on Base, USDC story).

---

## The full agent story (demo)

| Layer | What it gives your agent | Where |
| --- | --- | --- |
| ENS | Human-readable username | Ethereum (Sepolia in the demo) |
| ERC-8004 | On-chain passport + agent wallet link | Ethereum (Sepolia) |
| Locus | USDC spend rules + send flow in the UI | Base (product); demo uses adapter + sim or API |

ENS + ERC-8004 answer **who the agent is**. Locus (in the demo) illustrates **how it could spend under policy**.

---

## Spend controls via Locus (demo behavior)

With the demo’s policy model you get tiers such as:

- **Auto** — under the approval threshold (sim / client preflight)
- **Pending approval** — over threshold → approval URL (sim) or API `202` shape
- **Blocked** — over max per-tx or remaining budget

Exact numbers come from **simulation defaults** or your **live API** responses once wired; policy is not edited from this repo’s SDK.

---

## Demo

1. Connect a wallet on **Sepolia** (demo uses **RainbowKit + wagmi**; MetaMask works)
2. Enter an agent label (e.g. `myagent`)
3. Watch **7** identity steps + **1** Locus setup step, with Sepolia tx hashes where applicable
4. Open the **dashboard**: identity summary + **Locus** spend card + **Send USDC** panel

### Run locally

```bash
cd demo
npm install
npm run dev
```

Open `http://localhost:5173`.

**Optional — real Locus API (register + send):**

```bash
# demo/.env
VITE_LOCUS_API_URL=https://beta-api.paywithlocus.com
```

Without it, Locus runs in **simulation** (delays + fixed policy). Wallet/policy snapshots in the adapter are still mostly **sim** until real endpoints exist — see TODOs in `demo/src/services/locus.ts`.

### SDK install (library consumers)

From the repo root (after `npm run build`):

```bash
npm install
npm run build
```

Publish or `npm link` as package name **`veil`** (see root `package.json`).

---

## Repo structure

```
src/                          TypeScript SDK (`veil`)
  veil/                       registerAgentIdentity(), agent URI helpers
  ens/                        ENS helpers (namehash, labelhash)
demo/                         React demo (RainbowKit / wagmi)
  src/
    wagmi.ts                  chain + wallet config
    lib/ethersAdapter.ts      wagmi wallet client → ethers signer
    services/locus.ts         Locus adapter (sim + partial live API)
    components/LocusCard.tsx  Spend controls UI
    components/ExecutionCard.tsx  USDC send form
    App.tsx                   Identity + Locus flow
```

---

## Prerequisites

- **Sepolia ETH** in the wallet(s) that will sign txs
- Human wallet must **own `veilsdk.eth`** on Sepolia (or pass another `rootName` you control)
- If the **agent wallet is a different address**, fund it with Sepolia ETH for the reverse-claim tx

---

## Built for

- ENS Identity — Synthesis Hackathon 2026
- ENS Communication — Synthesis Hackathon 2026
- ENS Open Integration — Synthesis Hackathon 2026
- Best Use of Locus — Synthesis Hackathon 2026

---

## Why Veil

Agents need identity for the same reasons humans do — so others know who they are, someone stays accountable, and trust doesn’t require a central gatekeeper.

**ENS** is the username. **ERC-8004** is the passport. **Veil** connects them in one place. **Locus** (in the demo) shows how that identity can sit next to **controlled spending** on Base.
