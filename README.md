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

After the seven identity steps complete, the demo registers the agent with Locus (step 8) and logs the registration on Status Network (step 9), then displays a spend controls dashboard showing wallet status, policy tiers, and a USDC send form.

**Optional: connect a live Locus API**

```bash
# demo/.env
VITE_LOCUS_API_URL=https://beta-api.paywithlocus.com
```

Without this variable, Locus runs in simulation mode with fixed policy values. The registration and send steps still execute against the interface; they return simulated responses rather than hitting live endpoints.

**WalletConnect / Reown setup (for custom deployments)**

The demo uses a default WalletConnect project ID. If you deploy to your own domain you need to add it to the project's allowed origins:

1. Go to [cloud.reown.com](https://cloud.reown.com) and sign in
2. Open the project associated with the project ID in `demo/src/wagmi.ts`
3. Under **Allowed Domains**, add your deployment URL (e.g. `veil-rose.vercel.app`)
4. Alternatively, create your own project at cloud.reown.com and set `VITE_WALLETCONNECT_PROJECT_ID` in `demo/.env`

Without this, WalletConnect mobile wallets will show an "Origin not found on Allowlist" error. Injected wallets like MetaMask browser extension still work without it.

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
    services/statusNetwork.ts gasless agent logging on Status Network
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

## Status Network integration

After identity registration completes, the demo logs the agent's ENS name on the Status Network Sepolia Testnet via a gasless transaction (gas = 0, gasPrice = 0). This uses the AgentRegistry smart contract deployed on Status Network.

| Property | Value |
| --- | --- |
| Network | Status Network Sepolia Testnet |
| Chain ID | `1660990954` |
| RPC URL | `https://public.sepolia.rpc.status.network` |
| Block Explorer | `https://sepoliascan.status.network` |
| AgentRegistry contract | `0x5740a90c0193101998bC27EBFb8e3705f7A4672A` |
| Deployment tx | [`0x545be90a...`](https://sepoliascan.status.network/tx/0x545be90a6c87b07e15be0d4ae1fb3cef3574e5375bdfcb73889b4df7a1fcd3ea) |
| Test registration tx | [`0x70b0c7ce...`](https://sepoliascan.status.network/tx/0x70b0c7ce36a052434408dadd85bdd20111bcf0b7febb92848ca63ebee8a0f9f0) |

The AgentRegistry contract emits an `AgentRegistered` event with the ENS name, agent wallet address, sender address, and timestamp. Transactions are gasless because Status Network uses RLN (Rate Limiting Nullifier) to replace gas fees with cryptographic rate limits.

**To add Status Network to MetaMask:**

| Field | Value |
| --- | --- |
| Network Name | Status Network Testnet |
| RPC URL | `https://public.sepolia.rpc.status.network` |
| Chain ID | `1660990954` |
| Currency Symbol | ETH |
| Block Explorer | `https://sepoliascan.status.network` |

---

## Built for

Synthesis Hackathon 2026

- ENS Identity
- ENS Communication
- ENS Open Integration
- Best Use of Locus
- Status Network

---

## Why Veil

Agents need identity for the same reason humans do. So others know who they are, someone stays accountable, and trust does not require a central authority.

ENS is the username. ERC-8004 is the passport. Veil connects them in one call.
