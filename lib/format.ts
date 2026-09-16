import { formatUnits, isAddress } from "ethers";
import { INCOME_TYPES } from "./contract";

export function shortAddr(addr?: string | null, size = 4) {
  if (!addr) return "—";
  if (!isAddress(addr)) return addr;
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

export function fmtToken(value: bigint | number | string | undefined, decimals = 18, digits = 2) {
  try {
    if (value === undefined || value === null) return "—";
    const v = typeof value === "bigint" ? value : BigInt(value);
    const n = Number(formatUnits(v, decimals));
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  } catch {
    return "—";
  }
}

export function fmtUsd(value: bigint | number | string | undefined, decimals = 18) {
  const s = fmtToken(value, decimals, 2);
  return s === "—" ? s : `$${s}`;
}

export function incomeKind(id: number | bigint | string) {
  return INCOME_TYPES[Number(id)] || `Type ${id}`;
}

export function fmtTime(ts: number | bigint | string) {
  const n = Number(ts);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

export function explorerAddress(addr: string, base: string) {
  return `${base}/address/${addr}`;
}
