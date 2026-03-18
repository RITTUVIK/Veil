# Veil

Veil is a small SDK for registering an on-chain identity for an AI agent using `*.veil.eth` ENS names.

The goal is simple: with one call, you can:
- Register `myagent.veil.eth` on Sepolia
- Point `myagent.veil.eth` to an agent wallet (`addr` record only for now)
- Set up reverse resolution so the agent wallet maps back to `myagent.veil.eth`
- Register the agent in the ERC-8004 Identity Registry, linking the agent wallet and the human owner

## What’s in this repo
- `src/`: TypeScript SDK
- `demo/`: React demo app (placeholder for now)

## Core function

`registerAgentIdentity()` lives in:
- `src/veil/registerAgentIdentity.ts`

It takes:
- an `agentWalletAddress` (the address the ENS name points to)
- a `humanSigner` (the wallet that will create the ENS subnode + register the ERC-8004 identity)
- a `label` (e.g. `"myagent"`)

It returns the ENS name plus transaction hashes for each step.

## Sepolia addresses (defaults)
- ENS Registry + resolver/reverse contracts: set via the official ENS Sepolia deployments
- ERC-8004 Identity Registry: deployed on Sepolia (official contract address)

You can override contract addresses via function parameters if needed.

## Example usage (TypeScript)

```ts
import { ethers } from "ethers";
import { registerAgentIdentity } from "./src";

async function main() {
  // humanSigner is the wallet that controls `veil.eth` on Sepolia
  const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
  const humanWallet = new ethers.Wallet(process.env.HUMAN_PRIVATE_KEY!, provider);

  const res = await registerAgentIdentity({
    provider,
    humanSigner: humanWallet,
    agentWalletAddress: "0xYourAgentEOAAddressHere",
    label: "myagent",
  });

  console.log(res.agentEnsName);
  console.log(res.txHashes);
}
```

## Notes
- This is intentionally minimal right now: it only writes the `addr(node)` record on the ENS `PublicResolver`.
- You’ll need Sepolia ETH for the transactions.
- The human wallet must be able to manage the `veil.eth` subnode (it should own/control `veil.eth` on Sepolia).

