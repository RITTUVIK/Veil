# Veil — Identity Infrastructure for AI Agents

AI agents are anonymous. When an agent takes an action, makes a payment, or talks to another agent, nobody knows who it is, who built it, or whether it can be trusted.

Veil fixes this. One function call gives your agent a verified identity on Ethereum:
- A `.eth` username (`myagent.veilsdk.eth`)
- An on-chain passport (ERC-8004 Identity Registry)
- Cryptographic proof linking the agent to its human owner

What used to take days of navigating ENS and ERC-8004 documentation separately now takes one function call.

---

## How it works

```ts
import { registerAgentIdentity } from "@veil/sdk";

const result = await registerAgentIdentity({
  provider,
  humanSigner, // wallet that owns veilsdk.eth
  agentSigner, // the agent wallet (sends reverse claim + signs EIP-712)
  agentWalletAddress: "0xYourAgentAddress",
  label: "myagent",
});

console.log(result.agentEnsName); // myagent.veilsdk.eth
console.log(result.txHashes); // all tx hashes as proof
```

Under the hood, one call does 7 things:
1. Creates `myagent.veilsdk.eth` as a subdomain
2. Connects a resolver to the name
3. Points the name to the agent wallet address
4. Claims reverse ownership for the agent wallet (`claimForAddr`)
5. Sets reverse name (wallet -> ENS name)
6. Registers the agent in the ERC-8004 Identity Registry
7. Links the agent wallet with EIP-712 signature proof (`setAgentWallet`)

---

## Why this matters

Agents need identity for the same reasons humans do:
- So other agents and services know who they are talking to
- So there is always a human accountable for an agent's actions
- So trust can be established without a central authority

ENS provides the username. ERC-8004 provides the passport. Veil wires them together.

---

## Getting started

### Prerequisites
- Sepolia ETH in your human wallet
- Your human wallet must own `veilsdk.eth` on Sepolia (or your own parent `.eth` name via `rootName`)
- If using a separate agent wallet, it also needs a small amount of Sepolia ETH for reverse claim

### Install
```bash
npm install
```

### Run the demo
```bash
cd demo
npm install
npm run dev
```

Open `http://localhost:5173`, connect MetaMask on Sepolia, enter a label, and click Register agent.

---

## Repo structure

```txt
src/          TypeScript SDK
  veil/       core registerAgentIdentity() function
  ens/        ENS helpers (namehash, labelhash)
demo/         React demo app
```

---

## Sepolia contract addresses

Defaults point to official ENS Sepolia deployments and the ERC-8004 Identity Registry on Sepolia. You can override addresses through function parameters.

---

## Built for

- ENS Identity track — Synthesis Hackathon 2026
- ENS Communication track
- ENS Open Integration track

---

## Notes

- Reverse resolution uses L1 `ReverseRegistrar.claimForAddr(agent, owner, resolver)`, which must be sent by the **agent address** (or controller)
- Using the same wallet for human and agent (demo default) avoids funding a second key
- All contract addresses are overridable via parameters

