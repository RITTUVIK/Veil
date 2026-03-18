# Veil Demo App

This is a small React demo for the Veil SDK.

It lets you:

1. Connect MetaMask (Sepolia)
2. Enter an ENS label (example: `myagent`)
3. Click one button to register `myagent.veil.eth`
4. See progress as each step completes:
   - ENS forward + reverse resolution
   - ERC-8004 register
   - ERC-8004 `setAgentWallet` (EIP-712 proof)
5. Show the final `.eth` name and all transaction hashes

SDK code lives in `../src/`.

## Run

From the `demo/` folder:

```bash
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173`).

Make sure MetaMask is connected to Sepolia before registering.

