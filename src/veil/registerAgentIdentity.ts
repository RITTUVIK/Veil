import { ethers } from "ethers";
import { addressToReverseNode, labelhash, namehash } from "../ens/namehash";
import { createAgentURIDataURI } from "./agentURI";

export type RegisterAgentIdentityParams = {
  provider: ethers.Provider;

  // Human verifier/identity owner. This wallet must be the current owner of `veil.eth`
  // (so it can create subnodes), and it will register the agent in ERC-8004.
  humanSigner: ethers.Signer;

  // EOA address for the AI agent (the address ENS will point to).
  agentWalletAddress: string;

  // Subdomain label (e.g. "myagent" for "myagent.veil.eth").
  label: string;

  rootName?: string; // default: "veil.eth"

  // Optional overrides (useful if you deploy to a different testnet).
  identityRegistryAddress?: string; // default: official ERC-8004 Identity Registry on Sepolia
  ensRegistryAddress?: string; // default: official ENS Registry on Sepolia
  publicResolverAddress?: string; // default: official ENS Public Resolver on Sepolia
  reverseRegistrarAddress?: string; // default: official ENS Reverse Registrar on Sepolia

  // ERC-8004 registration metadata extras (not required fields).
  agentDescription?: string;
  agentImage?: string;
};

export type RegisterAgentIdentityResult = {
  agentEnsName: string;
  txHashes: {
    ensSetSubnodeOwner?: string;
    ensSetResolver?: string;
    ensSetAddr?: string;
    reverseClaimForAddr?: string;
    reverseSetName?: string;
    erc8004Register?: string;
  };
};

// Sepolia defaults from ENS deployment registry + ERC-8004 official address.
const DEFAULTS = {
  rootName: "veil.eth",

  // ENS (Sepolia)
  ensRegistryAddress: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  publicResolverAddress: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5",
  reverseRegistrarAddress: "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6",

  // ERC-8004 (Sepolia)
  identityRegistryAddress: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
} satisfies Record<string, string>;

const ENS_REGISTRY_ABI = [
  "function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external",
  "function setResolver(bytes32 node, address resolver) external",
  "function owner(bytes32 node) view returns (address)",
] as const;

const PUBLIC_RESOLVER_ABI = [
  "function setAddr(bytes32 node, address addr) external",
  "function setName(bytes32 node, string newName) external",
] as const;

const REVERSE_REGISTRAR_ABI = [
  // Claims the reverse record for `addr` and assigns it to `owner`, using `resolver` as the resolver.
  "function claimForAddr(address addr, address owner, address resolver) external returns (bytes32)",
] as const;

const ERC8004_IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) external returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
] as const;

function assertLabel(label: string) {
  const cleaned = label.trim();
  if (!cleaned) throw new Error("label is required");
  // Keep it simple: ENS labels are limited; for a demo, reject whitespace and dots.
  if (cleaned.includes(".") || /\s/.test(cleaned)) throw new Error(`Invalid label: "${label}"`);
}

function normalizeAddress(addr: string): string {
  return ethers.getAddress(addr);
}

export async function registerAgentIdentity(
  params: RegisterAgentIdentityParams,
): Promise<RegisterAgentIdentityResult> {
  assertLabel(params.label);

  const rootName = params.rootName ?? DEFAULTS.rootName;

  const humanSigner = params.humanSigner.connect(params.provider);
  const humanAddress = await humanSigner.getAddress();
  const agentWalletAddress = normalizeAddress(params.agentWalletAddress);

  const agentEnsName = `${params.label.toLowerCase()}.${rootName}`;

  const ensRegistryAddress = params.ensRegistryAddress ?? DEFAULTS.ensRegistryAddress;
  const publicResolverAddress = params.publicResolverAddress ?? DEFAULTS.publicResolverAddress;
  const reverseRegistrarAddress =
    params.reverseRegistrarAddress ?? DEFAULTS.reverseRegistrarAddress;
  const identityRegistryAddress = params.identityRegistryAddress ?? DEFAULTS.identityRegistryAddress;

  const ensRegistry = new ethers.Contract(ensRegistryAddress, ENS_REGISTRY_ABI, humanSigner);
  const publicResolver = new ethers.Contract(publicResolverAddress, PUBLIC_RESOLVER_ABI, humanSigner);
  const reverseRegistrar = new ethers.Contract(
    reverseRegistrarAddress,
    REVERSE_REGISTRAR_ABI,
    humanSigner,
  );
  const identityRegistry = new ethers.Contract(
    identityRegistryAddress,
    ERC8004_IDENTITY_REGISTRY_ABI,
    humanSigner,
  );

  const veilNode = namehash(rootName);
  const labelHash = labelhash(params.label);
  const agentNode = namehash(agentEnsName);
  const reverseNode = addressToReverseNode(agentWalletAddress);

  const txHashes: RegisterAgentIdentityResult["txHashes"] = {};

  // 1) ENS: veil.eth -> myagent.veil.eth
  const tx1 = await ensRegistry.setSubnodeOwner(veilNode, labelHash, humanAddress);
  txHashes.ensSetSubnodeOwner = tx1.hash;
  await tx1.wait();

  // 2) ENS: attach resolver
  const tx2 = await ensRegistry.setResolver(agentNode, publicResolverAddress);
  txHashes.ensSetResolver = tx2.hash;
  await tx2.wait();

  // 3) ENS: point addr(myagent.veil.eth) to agent wallet
  const tx3 = await publicResolver.setAddr(agentNode, agentWalletAddress);
  txHashes.ensSetAddr = tx3.hash;
  await tx3.wait();

  // 4) Reverse resolution: agentWallet -> myagent.veil.eth
  // claimForAddr sets reverse owner to the human so we can call publicResolver.setName next.
  const tx4 = await reverseRegistrar.claimForAddr(
    agentWalletAddress,
    humanAddress,
    publicResolverAddress,
  );
  txHashes.reverseClaimForAddr = tx4.hash;
  await tx4.wait();

  const tx5 = await publicResolver.setName(reverseNode, agentEnsName);
  txHashes.reverseSetName = tx5.hash;
  await tx5.wait();

  // 5) ERC-8004: mint identity to the human owner, linking via agentURI.
  const agentURI = createAgentURIDataURI({
    agentName: agentEnsName,
    ensName: agentEnsName,
    agentWallet: agentWalletAddress,
    humanWallet: humanAddress,
    description: params.agentDescription,
    image: params.agentImage,
  });

  const tx6 = await identityRegistry.register(agentURI);
  txHashes.erc8004Register = tx6.hash;
  await tx6.wait();

  return {
    agentEnsName,
    txHashes,
  };
}

