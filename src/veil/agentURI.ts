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

// Minimal shield + person icon in dark blue/white, stored as a base64 SVG data URI
// so every agent has a real working image on-chain without depending on external URLs.
const DEFAULT_AGENT_IMAGE =
  "data:image/svg+xml;base64," +
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTYiIGhlaWdo" +
  "dD0iMjU2IiB2aWV3Qm94PSIwIDAgMjU2IDI1NiI+PHJlY3Qgd2lkdGg9IjI1NiIgaGVpZ2h0PS" +
  "IyNTYiIHJ4PSIzMiIgZmlsbD0iIzFhMWY0MCIvPjxwYXRoIGQ9Ik0xMjggMzJjLTE4IDAtMzMg" +
  "MTUtMzMgMzNzMTUgMzMgMzMgMzMgMzMtMTUgMzMtMzMtMTUtMzMtMzMtMzN6bS01MCA4MmMt" +
  "MTUgMC0yNyAxMi0yNyAyN3Y0NWMwIDI1IDIxIDQ1IDQ3IDU1IDE0IDYgMjAgNiAzMCA2czE2IDAg" +
  "MzAtNmMyNi0xMCA0Ny0zMCA0Ny01NXYtNDVjMC0xNS0xMi0yNy0yNy0yN3oiIGZpbGw9IiM0Mz" +
  "YzZjkiLz48cGF0aCBkPSJNMTI4IDQ0Yy0xMiAwLTIxIDktMjEgMjFzOSAyMSAyMSAyMSAyMS05" +
  "IDIxLTIxLTktMjEtMjEtMjF6bS0zOCA4MmMtOCAwLTE1IDctMTUgMTV2NDBjMCAxOCAxNiAzNSAz" +
  "NiA0MyAxMSA1IDE3IDUgMTcgNXM2IDAgMTctNWMyMC04IDM2LTI1IDM2LTQzdi00MGMwLTgtNy0x" +
  "NS0xNS0xNXoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=";

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
    image: input.image ?? DEFAULT_AGENT_IMAGE,

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

