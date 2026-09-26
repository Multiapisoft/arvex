# ARVEX Helping Plan — UI (dev / testnet)

Next.js frontend for **BSC Testnet** (USDC).

## Live contracts (chainId 97)

| Role | Address |
|------|---------|
| Arvex | `0xA726e98bc729FA7997314a6b992782A1B6933D98` |
| Spam | `0xCDdA9E1f0bfA9ababd08403bad2bD6370bf31029` |
| USDC | `0x4aE58BfC16b20bD67755FFD5560e85779D962415` |
| Root / Fast ID #1 | `0xE1bCaE6e15bA43406A7210f0256aCEa2C2207B31` |

Config: `lib/contract.ts`. Withdraw fee: 10% to treasury.

## Dev

```bash
npm install
npm run dev
```

Wallet must be on **BNB Smart Chain Testnet (97)** with USDC.
