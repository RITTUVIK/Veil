import React, { useMemo, useState } from "react";
import { ethers } from "ethers";
import { registerAgentIdentity, type RegisterAgentIdentityStep } from "../../src";

declare global {
  interface Window {
    ethereum?: any;
  }
}

type StepGroupStatus = "idle" | "running" | "ok" | "error";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [label, setLabel] = useState("myagent");
  const [agentWalletAddress, setAgentWalletAddress] = useState<string | null>(null);
  const [ensDoneTx, setEnsDoneTx] = useState<string | null>(null);
  const [passportDoneTx, setPassportDoneTx] = useState<string | null>(null);
  const [linkDoneTx, setLinkDoneTx] = useState<string | null>(null);

  const [ensStatus, setEnsStatus] = useState<StepGroupStatus>("idle");
  const [passportStatus, setPassportStatus] = useState<StepGroupStatus>("idle");
  const [linkStatus, setLinkStatus] = useState<StepGroupStatus>("idle");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | { agentEnsName: string; txHashes: any }>(null);

  const labelSanitized = useMemo(() => label.trim().toLowerCase(), [label]);

  async function connectMetaMask() {
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No MetaMask provider found in this browser.");

      await window.ethereum.request({ method: "eth_requestAccounts" });
      setConnected(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setConnected(false);
    }
  }

  // Correct register handler capturing return value (kept separate to keep JSX simple).
  async function onRegisterWithResult() {
    setError(null);
    setRunning(true);
    setResult(null);
    setEnsDoneTx(null);
    setPassportDoneTx(null);
    setLinkDoneTx(null);
    setAgentWalletAddress(null);
    setEnsStatus("running");
    setPassportStatus("idle");
    setLinkStatus("idle");

    try {
      if (!window.ethereum) throw new Error("No MetaMask provider found in this browser.");
      if (!labelSanitized) throw new Error("Please enter an ENS label (example: myagent).");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const humanSigner = await provider.getSigner();

      const { chainId } = await provider.getNetwork();
      if (chainId !== 11155111n) {
        throw new Error(`Please switch MetaMask to Sepolia (chainId=11155111). Current: ${chainId}`);
      }

      const agentSigner = ethers.Wallet.createRandom().connect(provider);
      const agentWallet = await agentSigner.getAddress();
      setAgentWalletAddress(agentWallet);

      const res = await registerAgentIdentity({
        provider,
        humanSigner,
        agentSigner,
        agentWalletAddress: agentWallet,
        label: labelSanitized,
        onStep: (step: RegisterAgentIdentityStep, txHash?: string) => {
          if (step.startsWith("ens_")) {
            if (step === "ens_reverseSetName" && txHash) {
              setEnsStatus("ok");
              setEnsDoneTx(txHash);
              setPassportStatus("running");
            }
            return;
          }

          if (step === "erc8004_register" && txHash) {
            setPassportStatus("ok");
            setPassportDoneTx(txHash);
            setLinkStatus("running");
            return;
          }

          if (step === "erc8004_setAgentWallet" && txHash) {
            setLinkStatus("ok");
            setLinkDoneTx(txHash);
            return;
          }
        },
      });

      setResult(res);
      setRunning(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setEnsStatus("error");
      setPassportStatus("error");
      setLinkStatus("error");
      setRunning(false);
    }
  }

  function badgeFor(status: StepGroupStatus) {
    if (status === "ok") return "badge ok";
    if (status === "running") return "badge run";
    if (status === "error") return "badge err";
    return "badge";
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Veil demo</h2>

      <div className="row">
        <button onClick={connectMetaMask} disabled={running || connected}>
          {connected ? "Wallet connected" : "Connect MetaMask"}
        </button>

        <div>
          <label htmlFor="label">Agent label (ENS name: &lt;label&gt;.veilsdk.eth)</label>
          <input
            id="label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={running}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={onRegisterWithResult}
          disabled={!connected || running}
          title={!connected ? "Connect MetaMask first" : "Register your agent on Sepolia"}
        >
          {running ? "Registering..." : "Register agent"}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="status">
        <div className="step">
          <div className="name">ENS registration</div>
          <div className={badgeFor(ensStatus)}> {ensStatus.toUpperCase()} </div>
        </div>
        <div className="step" style={{ opacity: ensDoneTx ? 1 : 0.7 }}>
          <div className="name">ERC-8004 passport</div>
          <div className={badgeFor(passportStatus)}> {passportStatus.toUpperCase()} </div>
        </div>
        <div className="step" style={{ opacity: linkDoneTx ? 1 : 0.7 }}>
          <div className="name">Agent wallet link</div>
          <div className={badgeFor(linkStatus)}> {linkStatus.toUpperCase()} </div>
        </div>
      </div>

      {result ? (
        <div className="success">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Registered: {result.agentEnsName}</div>

          <div style={{ marginBottom: 8 }}>
            Agent wallet: <span className="mono">{agentWalletAddress ?? "-"}</span>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Transaction hashes</div>
            <div className="mono">
              <div>ENS setSubnodeOwner: {result.txHashes.ensSetSubnodeOwner}</div>
              <div>ENS setResolver: {result.txHashes.ensSetResolver}</div>
              <div>ENS setAddr: {result.txHashes.ensSetAddr}</div>
              <div>ENS reverse claim: {result.txHashes.reverseClaimForAddr}</div>
              <div>ENS reverse setName: {result.txHashes.reverseSetName}</div>
              <div>ERC-8004 register: {result.txHashes.erc8004Register}</div>
              <div>ERC-8004 setAgentWallet: {result.txHashes.erc8004SetAgentWallet}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

