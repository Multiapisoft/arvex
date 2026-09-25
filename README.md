# ARVEX Helping Plan — UI

Next.js frontend for the live **BSC Mainnet** deploy (USDT).

## Live contracts (chainId 56)

| Role | Address |
|------|---------|
| Arvex | `0x9450fa0d2f2A547E8D1EBfF6109e26AEA9B7A43E` |
| Spam | `0x085a5eE47a4255CDb3C6F0b5B53231E5BBB63cED` |
| USDT | `0x55d398326f99059fF775485246999027B3197955` |
| Root / Fast ID #1 | `0xE1bCaE6e15bA43406A7210f0256aCEa2C2207B31` |

Config source of truth: `lib/contract.ts`.

## Dev

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Wallet must be on **BNB Smart Chain (56)** with USDT.
