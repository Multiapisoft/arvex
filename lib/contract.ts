import falconAbiJson from "./falcon-abi.json";

/** Falcon Capital contract ABI + defaults (BSC Testnet). */

export const BSC_TESTNET_CHAIN_ID = 97;
/** Prefer a fast public RPC; override with NEXT_PUBLIC_BSC_RPC if needed. */
export const BSC_TESTNET_RPC =
  process.env.NEXT_PUBLIC_BSC_RPC || "https://bsc-testnet-rpc.publicnode.com";
export const EXPLORER_BASE = "https://testnet.bscscan.com";

/** Override via NEXT_PUBLIC_CONTRACT_ADDRESS or Advanced UI. */
export const DEFAULT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xAE5c77d92367F4CE78288ACF2929D85A95C0D5b5";

/** Default USDC (payment token) on BSC Testnet. */
export const DEFAULT_PAYMENT_TOKEN =
  process.env.NEXT_PUBLIC_PAYMENT_TOKEN ||
  "0x4aE58BfC16b20bD67755FFD5560e85779D962415";

export const PACKAGE_NAMES = [
  "",
  "Starter",
  "Silver",
  "Gold",
  "Diamond",
  "Crown",
] as const;

export const PACKAGE_PRICES_USD = [0, 50, 100, 250, 500, 1000] as const;

export const INCOME_TYPES: Record<number, string> = {
  0: "All",
  1: "Direct",
  2: "Matrix",
  3: "Global",
  4: "CTO",
  5: "Secure Fund",
};

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

/** Official FalconCapital ABI (JSON). */
export const FALCON_ABI = falconAbiJson;
