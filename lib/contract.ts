import type { Provider } from "ethers";
import falconAbiJson from "./falcon-abi.json";

/**
 * Falcon Capital — BSC Mainnet defaults (hardcoded, no .env required).
 * Chain 56 · USDT · live FalconCapital.
 */

export const BSC_CHAIN_ID = 56;
export const BSC_CHAIN_ID_HEX = "0x38";

/** @deprecated Use BSC_CHAIN_ID */
export const BSC_TESTNET_CHAIN_ID = BSC_CHAIN_ID;

export const BSC_RPC = "https://bsc-dataseed.binance.org";
/** @deprecated Use BSC_RPC */
export const BSC_TESTNET_RPC = BSC_RPC;

export const EXPLORER_BASE = "https://bscscan.com";

/** Live FalconCapital (BSC Mainnet). */
export const DEFAULT_CONTRACT_ADDRESS = "0xde6b15a2b9e388d1361fe9689e69bbb8b9fa9f05";

/** Official BSC USDT (BEP20, 18 decimals). */
export const DEFAULT_PAYMENT_TOKEN = "0x55d398326f99059fF775485246999027B3197955";

export const PAYMENT_TOKEN_SYMBOL = "USDT";
export const PAYMENT_TOKEN_DECIMALS = 18;

/**
 * Lowest practical gas for BSC writes.
 * Caps at 3 gwei — enough for BSC mainnet without overpaying.
 */
export async function lowGasOverrides(
  provider: Provider,
  estimateGas?: () => Promise<bigint>,
): Promise<{ gasPrice: bigint; gasLimit?: bigint }> {
  const fee = await provider.getFeeData();
  let gasPrice = fee.gasPrice ?? fee.maxFeePerGas ?? 1_000_000_000n;
  if (gasPrice <= 0n) gasPrice = 1_000_000_000n;

  const CAP = 3_000_000_000n; // 3 gwei
  if (gasPrice > CAP) gasPrice = CAP;

  const overrides: { gasPrice: bigint; gasLimit?: bigint } = { gasPrice };
  if (estimateGas) {
    try {
      const estimated = await estimateGas();
      overrides.gasLimit = (estimated * 110n) / 100n;
    } catch {
      // Wallet will estimate if our estimate fails
    }
  }
  return overrides;
}

/** MetaMask / wallet_addEthereumChain params for BSC Mainnet. */
export const BSC_MAINNET_CHAIN_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: [BSC_RPC, "https://bsc-dataseed1.binance.org", "https://rpc.ankr.com/bsc"],
  blockExplorerUrls: [EXPLORER_BASE],
} as const;

type EthRequest = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/** Switch wallet to BSC Mainnet (56). If missing, add the chain then switch. */
export async function ensureBscMainnet(eth: EthRequest): Promise<void> {
  const chainHex = String(await eth.request({ method: "eth_chainId" }));
  const chainId = Number.parseInt(chainHex, 16);
  if (chainId === BSC_CHAIN_ID) return;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [BSC_MAINNET_CHAIN_PARAMS],
      });
      return;
    }
    throw new Error("Please switch MetaMask to BNB Smart Chain (chainId 56)");
  }
}

export const CTO_RANK_COUNT = 4;

export const PACKAGE_NAMES = [
  "",
  "Starter",
  "Silver",
  "Gold",
  "Diamond",
  "Crown",
] as const;

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

export const FALCON_ABI = falconAbiJson;
