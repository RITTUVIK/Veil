import { toUtf8Bytes } from "ethers";

export type AgentURIInput = {
  agentName: string; // fully qualified ENS name, e.g. myagent.veilsdk.eth
  description?: string;
  image?: string;

  // These are extra fields for developer convenience; ERC-8004 only requires type/name/description/image.
  ensName?: string;
  agentWallet?: string;
  humanWallet?: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  // Browser path
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Node fallback (kept for server-side SDK usage).
  return Buffer.from(bytes).toString("base64");
}

export function createAgentURIDataURI(input: AgentURIInput): string {
  const payload: Record<string, unknown> = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: input.agentName,
    description: input.description ?? `AI agent identity for ${input.agentName}`,
    image: input.image ?? "https://example.com/agent.png",

    // Optional convenience fields (not required by ERC-8004).
    ensName: input.ensName ?? input.agentName,
    agentWallet: input.agentWallet,
    humanWallet: input.humanWallet,
  };

  // ERC-8004 accepts base64-encoded JSON data URIs.
  const json = JSON.stringify(payload);
  const b64 = bytesToBase64(toUtf8Bytes(json));
  return `data:application/json;base64,${b64}`;
}

