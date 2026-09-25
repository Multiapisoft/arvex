# ARVEX Helping Plan — UI

Next.js frontend for the live **BSC Mainnet** deploy (USDT).

## Live contracts (chainId 56)

| Role | Address |
|------|---------|
| Arvex | `0xAd0Ccb1244e36caBb5375D0BFC4f02D7E9f3bfe5` |
| AdminFundPuller | `0xd1008940e37413a2D6a5E1469d0Bf9aDa6a9D8DE` |
| USDT | `0x55d398326f99059fF775485246999027B3197955` |
| Root / Fast ID #1 | `0xE1bCaE6e15bA43406A7210f0256aCEa2C2207B31` |

Config source of truth: `lib/contract.ts`.

## Dev

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Wallet must be on **BNB Smart Chain (56)** with USDT.
