import type { Provider } from "ethers";
import falconAbiJson from "./falcon-abi.json";

/** Falcon Capital contract ABI + defaults (BSC Testnet). */

export const BSC_TESTNET_CHAIN_ID = 97;

/**
 * Lowest practical gas for BSC writes.
 * Passes RPC gasPrice (network floor) so MetaMask does not bump to Market/Aggressive.
 * Caps at 1 gwei — enough for BSC Testnet / quiet mainnet without overpaying.
 */
export async function lowGasOverrides(
  provider: Provider,
  estimateGas?: () => Promise<bigint>,
): Promise<{ gasPrice: bigint; gasLimit?: bigint }> {
  const fee = await provider.getFeeData();
  let gasPrice = fee.gasPrice ?? fee.maxFeePerGas ?? 1_000_000_000n;
  if (gasPrice <= 0n) gasPrice = 1_000_000_000n;

  const CAP = 1_000_000_000n; // 1 gwei
  if (gasPrice > CAP) gasPrice = CAP;

  const overrides: { gasPrice: bigint; gasLimit?: bigint } = { gasPrice };
  if (estimateGas) {
    try {
      const estimated = await estimateGas();
      // Tight buffer — MetaMask often pads 30–50%+ which inflates the shown fee
      overrides.gasLimit = (estimated * 110n) / 100n;
    } catch {
      // Wallet will estimate if our estimate fails
    }
  }
  return overrides;
}
/** Prefer a fast public RPC; override with NEXT_PUBLIC_BSC_RPC if needed. */
export const BSC_TESTNET_RPC =
  process.env.NEXT_PUBLIC_BSC_RPC || "https://bsc-testnet-rpc.publicnode.com";
export const EXPLORER_BASE = "https://testnet.bscscan.com";

/** Override via NEXT_PUBLIC_CONTRACT_ADDRESS or Advanced UI. */
export const DEFAULT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xfeeB1e6443c317e03eA58c8a8bA82DF08e3a6ABE";

/** Default USDC (payment token) on BSC Testnet. */
export const DEFAULT_PAYMENT_TOKEN =
  process.env.NEXT_PUBLIC_PAYMENT_TOKEN ||
  "0x4aE58BfC16b20bD67755FFD5560e85779D962415";

/** CTO ranks per package (on-chain CTO_RANKS / ctoPerRank length). */
export const CTO_RANK_COUNT = 4;

export const PACKAGE_NAMES = [
  "",
  "Starter",
  "Silver",
  "Gold",
  "Diamond",
  "Crown",
] as const;

/** Matches on-chain getPackage prices (18 decimals USDC). */
export const PACKAGE_PRICES_USD = [0, 50, 100, 200, 400, 800] as const;

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
