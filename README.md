# Veil

Identity infrastructure for AI agents.

AI agents are anonymous. When an agent takes an action, makes a payment, or communicates with another agent, there is no way to know who built it, who is accountable for it, or whether it can be trusted.

Veil solves the identity side with a single SDK call. Your agent gets a `.eth` name, an ERC-8004 on-chain passport, and a cryptographic link between the agent wallet and the human who controls the parent ENS domain.

---

## What it does

`registerAgentIdentity()` executes seven on-chain steps against Sepolia by default:

1. Create `myagent.veilsdk.eth` as a subdomain under the root ENS name
2. Attach the public resolver to the name
3. Set the name's `addr` record to the agent wallet address
4. Claim the reverse record for the agent address (sent from the agent wallet)
5. Set the reverse name so the agent wallet resolves back to the ENS name
6. Register the agent in the ERC-8004 Identity Registry
7. Link the agent wallet via `setAgentWallet` using an EIP-712 signature from the agent key



The result is an agent with a human-readable name, a verifiable on-chain passport, and a provable connection to its owner. All in one call.

---

## SDK usage

### Default: register under veilsdk.eth

The simplest way to get started. Your agent is registered as a subdomain under `veilsdk.eth`.

```ts
import { registerAgentIdentity } from "veil";

const result = await registerAgentIdentity({
  provider,
  humanSigner,                          // your wallet, must own veilsdk.eth on Sepolia
  agentSigner,                          // the agent's wallet, signs the EIP-712 proof
  agentWalletAddress: "0xAgentWallet",
  label: "myagent",
});

console.log(result.agentEnsName); // myagent.veilsdk.eth
console.log(result.txHashes);     // seven Ethereum transaction hashes
```

### Custom domain: register under your own .eth name

If you own a `.eth` name on Sepolia, pass it as `rootName` and your agents will live under your domain instead.

```ts
import { registerAgentIdentity } from "veil";

const result = await registerAgentIdentity({
  provider,
  humanSigner,                          // your wallet, must own john.eth on Sepolia
  agentSigner,                          // the agent's wallet, signs the EIP-712 proof
  agentWalletAddress: "0xAgentWallet",
  label: "myagent",
  rootName: "john.eth",
});

console.log(result.agentEnsName); // myagent.john.eth
console.log(result.txHashes);     // seven Ethereum transaction hashes
```

All steps are idempotent. If a step was already completed on a previous run it is skipped and the function continues from where it left off.

The demo UI exposes the custom domain option as an optional input in the Advanced section of the registration form.

---

## Demo app

The demo is a React app built with RainbowKit and wagmi. It walks through the full registration flow and then shows an agent dashboard with identity details, an ENS name, and a Locus spend wallet.

**To run locally:**

```bash
cd demo
npm install
npm run dev
```

Open `http://localhost:5173` and connect a wallet on Sepolia.

After the seven identity steps complete, the demo registers the agent with Locus and displays a spend controls dashboard showing wallet status, policy tiers, and a USDC send form.

**Optional: connect a live Locus API**

```bash
# demo/.env
VITE_LOCUS_API_URL=https://beta-api.paywithlocus.com
```

Without this variable, Locus runs in simulation mode with fixed policy values. The registration and send steps still execute against the interface; they return simulated responses rather than hitting live endpoints.

---

## Architecture

```
src/                          TypeScript SDK (package name: veil)
  veil/                       registerAgentIdentity, agent URI helpers
  ens/                        namehash, labelhash utilities
demo/                         React demo app
  src/
    wagmi.ts                  chain and wallet configuration
    lib/ethersAdapter.ts      converts wagmi WalletClient to ethers signer
    services/locus.ts         Locus adapter with simulation and live API support
    components/               IdentityCard, LocusCard, ExecutionCard
    App.tsx                   registration flow and dashboard
```

---

## Prerequisites

- Sepolia ETH in the wallet that will sign transactions
- The human wallet must own the root ENS name on Sepolia (`veilsdk.eth` by default, or your own domain if using a custom root)
- If the agent wallet is a separate address from the human wallet, it must be funded with enough Sepolia ETH to cover the reverse-claim transaction

---

## Network

Everything runs on **Sepolia testnet**. No mainnet transactions are made.

Contract addresses used by default:

| Contract | Address |
| --- | --- |
| ENS Registry | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| ENS Public Resolver | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5` |
| ENS Reverse Registrar | `0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6` |
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |

All addresses can be overridden via SDK parameters if you need to point at a different deployment.

---

## Built for

Synthesis Hackathon 2026

- ENS Identity
- ENS Communication
- ENS Open Integration
- Best Use of Locus

---

## Why Veil

Agents need identity for the same reason humans do. So others know who they are, someone stays accountable, and trust does not require a central authority.

ENS is the username. ERC-8004 is the passport. Veil connects them in one call.
