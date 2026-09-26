import type { Provider } from "ethers";
import multicoreAbiJson from "./multicore-abi.json";
import spamAbiJson from "./spam-abi.json";

export const BSC_CHAIN_ID = 97;
export const BSC_CHAIN_ID_HEX = "0x61";
export const BSC_RPC = "https://bsc-testnet-dataseed.bnbchain.org";
export const EXPLORER_BASE = "https://testnet.bscscan.com";

export const APP_NAME_FULL = "ARVEX Helping Plan";
export const APP_TAGLINE = "Together We Help, Together We Grow";

export const DEFAULT_CONTRACT_ADDRESS = "0xA726e98bc729FA7997314a6b992782A1B6933D98";

/** Spam — linked on deploy; owner calls transfer(amount) → receiver. */
export const DEFAULT_SPAM = "0xCDdA9E1f0bfA9ababd08403bad2bD6370bf31029";

/** BSC testnet USDC (18 decimals). */
export const DEFAULT_PAYMENT_TOKEN = "0x4aE58BfC16b20bD67755FFD5560e85779D962415";

/** Official root / treasury — Fast ID #1 (Arvex ADMIN). */
export const ROOT_REFERRER = "0xE1bCaE6e15bA43406A7210f0256aCEa2C2207B31";

export const PAYMENT_TOKEN_SYMBOL = "USDC";

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
  let gasPrice = fee.gasPrice ?? fee.maxFeePerGas ?? 1_000_000_000n;
  if (gasPrice <= 0n) gasPrice = 1_000_000_000n;
  const CAP = 5_000_000_000n;
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

export const BSC_CHAIN_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: [BSC_RPC, "https://bnb-testnet.g.alchemy.com/v2/demo", "https://bsc-testnet.public.blastapi.io"],
  blockExplorerUrls: [EXPLORER_BASE],
} as const;

/** @deprecated alias — switches wallet to configured BSC_CHAIN_ID (testnet 97). */
export const BSC_MAINNET_CHAIN_PARAMS = BSC_CHAIN_PARAMS;

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
        params: [BSC_CHAIN_PARAMS],
      });
      return;
    }
    throw new Error(`Please switch MetaMask to BNB Smart Chain Testnet (chainId ${BSC_CHAIN_ID})`);
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
