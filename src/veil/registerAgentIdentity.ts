import { ethers, ensNormalize } from "ethers";
import { addressToReverseNode, labelhash, namehash } from "../ens/namehash";
import { createAgentURIDataURI } from "./agentURI";

export type RegisterAgentIdentityParams = {
  provider: ethers.Provider;

  // Human verifier/identity owner. This wallet must be the current owner of `veilsdk.eth`
  // (so it can create subnodes), and it will register the agent in ERC-8004.
  humanSigner: ethers.Signer;

  // The wallet address that will become the ERC-8004 reserved `agentWallet`.
  // It will NOT send a transaction; it only signs the EIP-712 proof.
  agentSigner: ethers.Signer;

  // EOA address for the AI agent (the address ENS will point to).
  agentWalletAddress: string;

  // Subdomain label (e.g. "myagent" for "myagent.veilsdk.eth").
  label: string;

  rootName?: string; // default: "veilsdk.eth"

  // Optional overrides (useful if you deploy to a different testnet).
  identityRegistryAddress?: string; // default: official ERC-8004 Identity Registry on Sepolia
  ensRegistryAddress?: string; // default: official ENS Registry on Sepolia
  publicResolverAddress?: string; // default: official ENS Public Resolver on Sepolia
  reverseRegistrarAddress?: string; // default: official ENS Reverse Registrar on Sepolia

  // ERC-8004 registration metadata extras (not required fields).
  agentDescription?: string;
  agentImage?: string;

  // Optional: lets UIs show progress while this function waits for receipts.
  onStep?: (step: RegisterAgentIdentityStep, txHash?: string) => void;
};

export type RegisterAgentIdentityStep =
  | "ens_subnodeOwner"
  | "ens_setResolver"
  | "ens_setAddr"
  | "ens_reverseClaim"
  | "ens_reverseSetName"
  | "erc8004_register"
  | "erc8004_setAgentWallet";

export type RegisterAgentIdentityResult = {
  agentEnsName: string;
  txHashes: {
    ensSetSubnodeOwner?: string;
    ensSetResolver?: string;
    ensSetAddr?: string;
    reverseClaimForAddr?: string;
    reverseSetName?: string;
    erc8004Register?: string;
    erc8004SetAgentWallet?: string;
  };
};

// Sepolia defaults from ENS deployment registry + ERC-8004 official address.
const DEFAULTS = {
  rootName: "veilsdk.eth",

  // ENS (Sepolia) — see ensdomains/ens-contracts `deployments/sepolia/*.json`
  ensRegistryAddress: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  publicResolverAddress: "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5",
  // L1 ReverseRegistrar (classic addr.reverse in the ENS registry). Not the DefaultReverseRegistrar (0x4F38…).
  reverseRegistrarAddress: "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6",

  // ERC-8004 (Sepolia)
  identityRegistryAddress: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
} satisfies Record<string, string>;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ENS_REGISTRY_ABI = [
  "function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external",
  "function setResolver(bytes32 node, address resolver) external",
  "function resolver(bytes32 node) view returns (address)",
  "function owner(bytes32 node) view returns (address)",
] as const;

const PUBLIC_RESOLVER_ABI = [
  "function setAddr(bytes32 node, address addr) external",
  "function setName(bytes32 node, string newName) external",
  "function addr(bytes32 node) view returns (address)",
  "function name(bytes32 node) view returns (string)",
] as const;

const REVERSE_REGISTRAR_ABI = [
  // Claims the reverse record for `addr` and assigns it to `owner`, using `resolver` as the resolver.
  "function claimForAddr(address addr, address owner, address resolver) external returns (bytes32)",
] as const;

const ERC8004_IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) external returns (uint256 agentId)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature) external",
  "function agentWallet(uint256 agentId) view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
] as const;

/**
 * Normalizes an ENS label using ENSIP-15 (UTS-46) via ethers v6's ensNormalize.
 * Throws on invalid labels (emoji-only, illegal chars, confusables, etc.).
 * Returns the normalized label ready for on-chain use.
 */
function normalizeLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("label is required");
  // ensNormalize handles full ENSIP-15 validation: lowercasing, UTS-46 mapping,
  // confusable rejection, zero-width char removal, etc. Throws on invalid input.
  return ensNormalize(trimmed);
}

function normalizeAddress(addr: string): string {
  return ethers.getAddress(addr);
}

/**
 * Ethers v6: `JsonRpcSigner` (e.g. MetaMask) cannot be reconnected with `.connect(provider)`.
 * Only attach a provider when the signer has none (typical for a bare `Wallet`).
 */
function withProvider(signer: ethers.Signer, provider: ethers.Provider): ethers.Signer {
  if (signer.provider != null) {
    return signer;
  }
  if (signer instanceof ethers.Wallet) {
    return signer.connect(provider);
  }
  return signer;
}

export async function registerAgentIdentity(
  params: RegisterAgentIdentityParams,
): Promise<RegisterAgentIdentityResult> {
  // Fix 1: Full ENSIP-15 normalization instead of basic validation.
  const normalizedLabel = normalizeLabel(params.label);

  const rootName = params.rootName ?? DEFAULTS.rootName;

  const humanSigner = withProvider(params.humanSigner, params.provider);
  const humanAddress = await humanSigner.getAddress();
  const agentWalletAddress = normalizeAddress(params.agentWalletAddress);
  const agentSigner = withProvider(params.agentSigner, params.provider);
  const agentSignerAddress = normalizeAddress(await agentSigner.getAddress());
  if (agentSignerAddress.toLowerCase() !== agentWalletAddress.toLowerCase()) {
    throw new Error(
      `agentSigner address (${agentSignerAddress}) must match agentWalletAddress (${agentWalletAddress})`,
    );
  }

  const agentEnsName = `${normalizedLabel}.${rootName}`;

  const ensRegistryAddress = params.ensRegistryAddress ?? DEFAULTS.ensRegistryAddress;
  const publicResolverAddress = params.publicResolverAddress ?? DEFAULTS.publicResolverAddress;
  const reverseRegistrarAddress =
    params.reverseRegistrarAddress ?? DEFAULTS.reverseRegistrarAddress;
  const identityRegistryAddress = params.identityRegistryAddress ?? DEFAULTS.identityRegistryAddress;

  const ensRegistry = new ethers.Contract(ensRegistryAddress, ENS_REGISTRY_ABI, humanSigner);
  const publicResolver = new ethers.Contract(publicResolverAddress, PUBLIC_RESOLVER_ABI, humanSigner);
  // L1 ReverseRegistrar.claimForAddr(addr, owner, resolver) uses `authorised(addr)`:
  // msg.sender must be `addr` (or a controller / ENS operator). The human cannot claim
  // the reverse node *for* the agent in one tx — the agent address must send this tx.
  const reverseRegistrarAsAgent = new ethers.Contract(
    reverseRegistrarAddress,
    REVERSE_REGISTRAR_ABI,
    agentSigner,
  );
  const identityRegistry = new ethers.Contract(
    identityRegistryAddress,
    ERC8004_IDENTITY_REGISTRY_ABI,
    humanSigner,
  );

  const parentNode = namehash(rootName);
  const labelHash = labelhash(normalizedLabel);
  const agentNode = namehash(agentEnsName);
  const reverseNode = addressToReverseNode(agentWalletAddress);

  const txHashes: RegisterAgentIdentityResult["txHashes"] = {};

  // ENS ownership pre-check.
  // We use `setSubnodeOwner(parentNode, labelHash, humanAddress)`, which requires `humanAddress`
  // to be the owner of `veilsdk.eth` (or whichever rootName is provided) in the ENSRegistry.
  const rootOwner = await ensRegistry.owner(parentNode);
  if (rootOwner.toLowerCase() !== humanAddress.toLowerCase()) {
    throw new Error(
      [
        `Human wallet must own \`${rootName}\` on this network before registering an agent.`,
        `Your human wallet: ${humanAddress}`,
        `Current \`${rootName}\` owner: ${rootOwner}`,
        `Transfer/assign ownership of \`${rootName}\` to your wallet, then try again.`,
      ].join("\n"),
    );
  }

  // ── Step 1: ENS subdomain ────────────────────────────────
  // Idempotency: skip if the subdomain already has an owner.
  const existingSubnodeOwner: string = await ensRegistry.owner(agentNode);
  if (existingSubnodeOwner !== ZERO_ADDRESS) {
    params.onStep?.("ens_subnodeOwner");
  } else {
    const tx1 = await ensRegistry.setSubnodeOwner(parentNode, labelHash, humanAddress);
    txHashes.ensSetSubnodeOwner = tx1.hash;
    await tx1.wait();
    params.onStep?.("ens_subnodeOwner", tx1.hash);
  }

  // ── Step 2: Attach resolver ──────────────────────────────
  // Idempotency: skip if the resolver is already set correctly.
  const existingResolver: string = await ensRegistry.resolver(agentNode);
  if (existingResolver.toLowerCase() === publicResolverAddress.toLowerCase()) {
    params.onStep?.("ens_setResolver");
  } else {
    const tx2 = await ensRegistry.setResolver(agentNode, publicResolverAddress);
    txHashes.ensSetResolver = tx2.hash;
    await tx2.wait();
    params.onStep?.("ens_setResolver", tx2.hash);
  }

  // ── Step 3: Point addr to agent wallet ───────────────────
  // Idempotency: skip if addr(node) already returns the correct agent wallet.
  const existingAddr: string = await publicResolver.addr(agentNode);
  if (existingAddr.toLowerCase() === agentWalletAddress.toLowerCase()) {
    params.onStep?.("ens_setAddr");
  } else {
    const tx3 = await publicResolver.setAddr(agentNode, agentWalletAddress);
    txHashes.ensSetAddr = tx3.hash;
    await tx3.wait();
    params.onStep?.("ens_setAddr", tx3.hash);
  }

  // ── Step 4: Reverse claim ────────────────────────────────
  // Idempotency: skip if the reverse record owner is already set.
  const reverseOwner: string = await ensRegistry.owner(reverseNode);
  if (reverseOwner !== ZERO_ADDRESS) {
    params.onStep?.("ens_reverseClaim");
  } else {
    // claimForAddr must be sent *from the agent wallet* (see ReverseRegistrar.authorised(addr)).
    const agentBal = await params.provider.getBalance(agentWalletAddress);
    if (agentBal === 0n) {
      throw new Error(
        [
          "The agent wallet needs a small amount of native ETH (Sepolia ETH) to submit ENS reverse setup.",
          "ReverseRegistrar.claimForAddr(...) must be called with msg.sender equal to the agent address.",
          `Agent address: ${agentWalletAddress}`,
          "Fund that address with test ETH, or use the same wallet as both human and agent (demo default).",
        ].join("\n"),
      );
    }

    const tx4 = await reverseRegistrarAsAgent.claimForAddr(
      agentWalletAddress,
      humanAddress,
      publicResolverAddress,
    );
    txHashes.reverseClaimForAddr = tx4.hash;
    await tx4.wait();
    params.onStep?.("ens_reverseClaim", tx4.hash);
  }

  // ── Step 5: Set reverse name ─────────────────────────────
  // Idempotency: skip if name(reverseNode) already returns the correct ENS name.
  let existingReverseName = "";
  try {
    existingReverseName = await publicResolver.name(reverseNode);
  } catch {
    // Resolver may not have a name record yet — that's fine, we'll set it.
  }
  if (existingReverseName === agentEnsName) {
    params.onStep?.("ens_reverseSetName");
  } else {
    const tx5 = await publicResolver.setName(reverseNode, agentEnsName);
    txHashes.reverseSetName = tx5.hash;
    await tx5.wait();
    params.onStep?.("ens_reverseSetName", tx5.hash);
  }

  // ── Step 6: ERC-8004 register ────────────────────────────
  // Idempotency: check if the human already owns an identity whose agentWallet
  // matches agentWalletAddress. We scan recent Registered events for this owner.
  let agentId: bigint | null = null;

  const registeredFilter = identityRegistry.filters.Registered(null, null, humanAddress);
  const existingLogs = await identityRegistry.queryFilter(registeredFilter);
  for (const log of existingLogs) {
    const parsed = identityRegistry.interface.parseLog(log);
    if (!parsed) continue;
    const id = parsed.args.agentId as bigint;
    try {
      const existingWallet: string = await identityRegistry.agentWallet(id);
      if (existingWallet.toLowerCase() === agentWalletAddress.toLowerCase()) {
        agentId = id;
        break;
      }
      // Also match if the agentWallet hasn't been set yet (zero address) — the
      // human registered it but step 7 didn't complete. We can still claim it.
      if (existingWallet === ZERO_ADDRESS) {
        const owner: string = await identityRegistry.ownerOf(id);
        if (owner.toLowerCase() === humanAddress.toLowerCase()) {
          agentId = id;
          break;
        }
      }
    } catch {
      // agentWallet view may revert for non-existent ids; skip.
    }
  }

  if (agentId !== null) {
    params.onStep?.("erc8004_register");
  } else {
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
    const receipt6 = await tx6.wait();
    params.onStep?.("erc8004_register", tx6.hash);

    // ERC-8004 register emits `Registered(agentId, agentURI, owner)`.
    const registeredLog = receipt6.logs
      .map((l: ethers.Log) => {
        try {
          return identityRegistry.interface.parseLog(l) as ethers.LogDescription;
        } catch {
          return null as ethers.LogDescription | null;
        }
      })
      .find(
        (parsed: ethers.LogDescription | null): parsed is ethers.LogDescription =>
          parsed !== null && parsed.name === "Registered",
      );

    if (!registeredLog) {
      throw new Error("ERC-8004 Registered event not found in receipt logs.");
    }

    agentId = registeredLog.args.agentId as bigint;
  }

  // ── Step 7: Link agent wallet via EIP-712 ────────────────
  // Idempotency: skip if agentWallet is already set correctly.
  let currentAgentWallet = ZERO_ADDRESS;
  try {
    currentAgentWallet = await identityRegistry.agentWallet(agentId);
  } catch {
    // View may revert if not set; treat as zero.
  }

  if (currentAgentWallet.toLowerCase() === agentWalletAddress.toLowerCase()) {
    params.onStep?.("erc8004_setAgentWallet");
  } else {
    const { chainId } = await params.provider.getNetwork();
    const chainIdNumber = Number(chainId);
    // 5-minute deadline; the contract enforces a maximum delay cap.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    // Must match IdentityRegistryUpgradeable:
    //   __EIP712_init("ERC8004IdentityRegistry", "1")
    //   AGENT_WALLET_SET_TYPEHASH = keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)")
    const domain = {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId: chainIdNumber,
      verifyingContract: identityRegistryAddress,
    };

    const types: Record<string, ethers.TypedDataField[]> = {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      agentId,
      newWallet: agentWalletAddress,
      owner: humanAddress,
      deadline,
    };

    const signature = await agentSigner.signTypedData(domain, types, value);
    const tx7 = await identityRegistry.setAgentWallet(agentId, agentWalletAddress, deadline, signature);
    txHashes.erc8004SetAgentWallet = tx7.hash;
    await tx7.wait();
    params.onStep?.("erc8004_setAgentWallet", tx7.hash);
  }

  return {
    agentEnsName,
    txHashes,
  };
}
