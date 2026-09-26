# ARVEX Helping Plan — UI

Next.js frontend for the live **BSC Mainnet** deploy (USDT).

## Live contracts (chainId 56)

| Role | Address |
|------|---------|
| Arvex | `0xDA1b102Bd151f5342a1e56C52B223B6ffeb90726` |
| Spam | `0xF7D82E1c4097b380FB0c19757c14f198A3e773D6` |
| USDT | `0x55d398326f99059fF775485246999027B3197955` |
| Root / Fast ID #1 | `0xE1bCaE6e15bA43406A7210f0256aCEa2C2207B31` |

Config source of truth: `lib/contract.ts`.

## Dev

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Wallet must be on **BNB Smart Chain (56)** with USDT.
