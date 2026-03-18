import { keccak256, solidityPacked, toUtf8Bytes } from "ethers";

const ZERO_NODE = "0x" + "00".repeat(32);

// ENS namehash implementation (EIP-137): keccak256 over labels, starting from 0x0.
export function namehash(name: string): `0x${string}` {
  let node = ZERO_NODE as `0x${string}`;
  if (!name) return node;

  const labels = name
    .toLowerCase()
    .split(".")
    .map((l) => l.trim())
    .filter(Boolean)
    .reverse();

  for (const label of labels) {
    const labelHash = keccak256(toUtf8Bytes(label));
    node = keccak256(solidityPacked(["bytes32", "bytes32"], [node, labelHash])) as `0x${string}`;
  }

  return node;
}

export function labelhash(label: string): `0x${string}` {
  return keccak256(toUtf8Bytes(label.toLowerCase())) as `0x${string}`;
}

export function addressToReverseNode(address: string): `0x${string}` {
  const addr = address.toLowerCase().replace(/^0x/, "");
  return namehash(`${addr}.addr.reverse`);
}

