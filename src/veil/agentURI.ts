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
  // Using Buffer keeps this compatible with Node-based SDK usage.
  const b64 = Buffer.from(toUtf8Bytes(json)).toString("base64");
  return `data:application/json;base64,${b64}`;
}

