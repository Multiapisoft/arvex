"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  MaxUint256,
  ZeroAddress,
  formatUnits,
  isAddress,
  parseUnits,
} from "ethers";
import {
  GitBranch,
  History,
  LayoutDashboard,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  BSC_TESTNET_CHAIN_ID,
  BSC_TESTNET_RPC,
  DEFAULT_CONTRACT_ADDRESS,
  DEFAULT_PAYMENT_TOKEN,
  ERC20_ABI,
  EXPLORER_BASE,
  FALCON_ABI,
  INCOME_TYPES,
  PACKAGE_NAMES,
  PACKAGE_PRICES_USD,
} from "@/lib/contract";
import { explorerAddress, fmtTime, fmtToken, fmtUsd, pkgName, shortAddr } from "@/lib/format";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import type { MobileNavItem } from "@/components/layout/MobileNav";
import { WalletAuthScreen } from "@/components/WalletAuthScreen";
import {
  MatrixTreeView,
  type MatrixSeatInfo,
  type MatrixTreeData,
  type MatrixTreeMode,
} from "@/components/MatrixTreeView";

type TabId =
  | "dashboard"
  | "register"
  | "income"
  | "matrix"
  | "team"
  | "packages"
  | "secure"
  | "admin";

type IncomeRow = {
  incomeType: number;
  amount: bigint;
  from: string;
  packageId: number;
  meta: bigint;
  timestamp: number;
};

type ToastState = { message: string; type: "success" | "error" } | null;

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "income", label: "Income History", icon: History },
  { id: "matrix", label: "Matrix / Global", icon: GitBranch },
  { id: "team", label: "My Team", icon: Users },
  { id: "packages", label: "Packages", icon: Package },
  { id: "secure", label: "Secure Fund", icon: Shield },
];

const ADMIN_TAB: { id: TabId; label: string; icon: typeof LayoutDashboard } = {
  id: "admin",
  label: "Admin",
  icon: ShieldCheck,
};

/** Primary items surfaced in the mobile bottom navigation (Solar-style). */
const PRIMARY_NAV: MobileNavItem[] = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "packages", label: "Packages", icon: Package },
  { id: "matrix", label: "Matrix", icon: GitBranch },
  { id: "team", label: "Team", icon: Users },
];

const STORAGE_KEY = "fc_contract_address";
const WALLET_FLAG_KEY = "fc_wallet_connected";
const WALLET_ADDR_KEY = "fc_wallet_address";
const PAGE_SIZE = 10;

/** Normalize ethers Result / array / tuple into up to 3 filled addresses. */
function toAddr3(raw: unknown): string[] {
  const list = raw as { length?: number; [i: number]: unknown } | null;
  return [0, 1, 2].map((i) => {
    const v = list?.[i];
    const s = v != null ? String(v) : "";
    return s && s !== ZeroAddress && isAddress(s) ? s : "";
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 250): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i + 1 < attempts) await sleep(delayMs * (i + 1));
    }
  }
  throw last;
}

declare global {
  interface Window {
    ethereum?: BrowserProvider extends never ? never : unknown;
  }
}

function getEthereum() {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

/** Remove ?ref= from the address bar without reloading. */
function clearRefFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ref")) return;
  url.searchParams.delete("ref");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

function DataLoading({ label = "Loading data…" }: { label?: string }) {
  return (
    <div className="data-loading">
      <Loader2 className="h-5 w-5 animate-spin text-solar-400" />
      <p>{label}</p>
    </div>
  );
}

export default function FalconApp() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [toast, setToast] = useState<ToastState>(null);
  const [account, setAccount] = useState<string>("");
  const [walletRestoring, setWalletRestoring] = useState(true);
  const [cachedWalletLabel, setCachedWalletLabel] = useState("…");
  const [contractAddr, setContractAddr] = useState(DEFAULT_CONTRACT_ADDRESS);
  const [contractInput, setContractInput] = useState(DEFAULT_CONTRACT_ADDRESS);
  const [busy, setBusy] = useState(false);
  const [staticLoading, setStaticLoading] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [tokenSymbol, setTokenSymbol] = useState("USDC");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [paymentToken, setPaymentToken] = useState(DEFAULT_PAYMENT_TOKEN);

  // Dashboard
  const [registered, setRegistered] = useState(false);
  const [userChecked, setUserChecked] = useState(false);
  const routedAfterConnect = useRef(false);
  const [currentPackage, setCurrentPackage] = useState(0);
  const [sponsor, setSponsor] = useState("");
  const [invested, setInvested] = useState<bigint>(0n);
  const [earned, setEarned] = useState<bigint>(0n);
  const [withdrawable, setWithdrawable] = useState<bigint>(0n);
  const [joinedAt, setJoinedAt] = useState(0);
  const [balance, setBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [incomePools, setIncomePools] = useState({
    direct: 0n,
    matrix: 0n,
    global: 0n,
    cto: 0n,
    secure: 0n,
  });
  const [secureEligible, setSecureEligible] = useState(false);

  // Register
  const [sponsorInput, setSponsorInput] = useState("");
  /** Referral from ?ref= — kept for register fallback; input stays empty by default. */
  const refSponsor = useRef("");

  // Income history
  const [incomeFilter, setIncomeFilter] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyRows, setHistoryRows] = useState<IncomeRow[]>([]);

  // Matrix
  const [matrixPkg, setMatrixPkg] = useState(1);
  const [matrixTreeMode, setMatrixTreeMode] = useState<MatrixTreeMode>("matrix");
  const [matrixFocus, setMatrixFocus] = useState("");
  const [matrixPath, setMatrixPath] = useState<string[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  /** Tracks last auto-synced package so manual package picks are kept until upgrade. */
  const lastSyncedPkg = useRef(0);
  const matrixLoadSeq = useRef(0);
  const [matrixInfo, setMatrixInfo] = useState({
    active: false,
    parent: "",
    childrenCount: 0,
    downline: 0n,
    ctoRank: 0,
    children: ["", "", ""] as string[],
    childSeats: [] as MatrixSeatInfo[],
    grandchildren: [[], [], []] as MatrixSeatInfo[][],
    matrixDirects: 0,
    globalQualified: false,
  });
  const [allMatrix, setAllMatrix] = useState<
    { pkg: number; active: boolean; downline: bigint; rank: number; children: number }[]
  >([]);

  // Team
  const [directs, setDirects] = useState<
    {
      address: string;
      packageId: number;
      invested: bigint;
      earned: bigint;
      joinedAt: number;
    }[]
  >([]);
  const [downlinePkg, setDownlinePkg] = useState(1);
  const [downlinePage, setDownlinePage] = useState(0);
  const [downlineLoading, setDownlineLoading] = useState(false);
  const [downlineError, setDownlineError] = useState("");
  const downlineLoadSeq = useRef(0);
  const [directsLoading, setDirectsLoading] = useState(false);
  const [downlineMembers, setDownlineMembers] = useState<
    {
      address: string;
      level: number;
      packageId: number;
      invested: bigint;
      earned: bigint;
      joinedAt: number;
      active: boolean;
      childCount: number;
      downline: string;
    }[]
  >([]);
  const [totalUsers, setTotalUsers] = useState(0);

  // Packages
  const [pkgRows, setPkgRows] = useState<
    {
      id: number;
      price: bigint;
      directBonus: bigint;
      secureFund: bigint;
      matrixPool: bigint;
      ctoPool: bigint;
      globalPool: bigint;
      matrixPerLevel: bigint;
      globalPerLevel: bigint;
      ctoPerRank: bigint[];
    }[]
  >([]);
  const [ctoThresholds, setCtoThresholds] = useState<bigint[]>([]);

  // Secure fund
  const [sf, setSf] = useState({
    balance: 0n,
    cycle: 0,
    next: 0,
    deployed: 0,
    targetPercent: 120,
    cyclePool: 0n,
  });
  const [sfPayoutDue, setSfPayoutDue] = useState(0n);
  const [sfTargetAmount, setSfTargetAmount] = useState(0n);
  const [sfClaimed, setSfClaimed] = useState(false);
  const [sfTargetInput, setSfTargetInput] = useState("120");

  // On-chain admin
  const [isOwner, setIsOwner] = useState(false);
  const [paused, setPaused] = useState(false);
  const [treasury, setTreasury] = useState("");
  const [newTreasury, setNewTreasury] = useState("");
  const [sfDistributeCycle, setSfDistributeCycle] = useState("");
  const [sfDistributeRecipients, setSfDistributeRecipients] = useState("");
  const [rescueTokenAddr, setRescueTokenAddr] = useState("");
  const [rescueTo, setRescueTo] = useState("");
  const [rescueAmount, setRescueAmount] = useState("");

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const referralLink = useMemo(() => {
    if (typeof window === "undefined" || !account) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("ref", account);
    return url.toString();
  }, [account]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Prefer env/default when localStorage still has a previous deploy address.
    const legacy = new Set([
      "0xb573d4159956e798e8f8c228481de1cbab135f72",
      "0x9ddb41afa46d87a2988b4e057f59a4234a62c0a6",
      "0xd1692deb1670d286376ccab9f0a3662d72106941",
      "0xbc9e7f1413989ea5dca5ac27dd499bab742696fe",
      // previous FalconCapital deploys — force migrate to current env/default
      "0xc5b92cf8cd14e8160ba97cac1bb5e16826b17378",
      "0xae5c77d92367f4ce78288acf2929d85a95c0d5b5",
    ]);
    const preferred = DEFAULT_CONTRACT_ADDRESS;
    if (saved && isAddress(saved) && !legacy.has(saved.toLowerCase())) {
      setContractAddr(saved);
      setContractInput(saved);
    } else {
      localStorage.setItem(STORAGE_KEY, preferred);
      setContractAddr(preferred);
      setContractInput(preferred);
    }
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && isAddress(ref)) {
      refSponsor.current = ref;
      setSponsorInput(ref);
    }
  }, []);

  // Restore wallet session after refresh (MetaMask eth_accounts — no popup)
  useEffect(() => {
    let cancelled = false;

    async function restoreWallet() {
      const eth = getEthereum();
      const wantRestore = localStorage.getItem(WALLET_FLAG_KEY) === "1";
      const cached = localStorage.getItem(WALLET_ADDR_KEY) || "";
      if (cached && isAddress(cached)) {
        setCachedWalletLabel(shortAddr(cached, 6));
      }

      if (!eth) {
        if (!cancelled) setWalletRestoring(false);
        return;
      }

      try {
        const accounts: string[] = await eth.request({ method: "eth_accounts" });
        if (cancelled) return;

        if (accounts?.[0] && isAddress(accounts[0])) {
          localStorage.setItem(WALLET_FLAG_KEY, "1");
          localStorage.setItem(WALLET_ADDR_KEY, accounts[0]);
          setAccount(accounts[0]);
        } else if (!wantRestore) {
          localStorage.removeItem(WALLET_FLAG_KEY);
          localStorage.removeItem(WALLET_ADDR_KEY);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setWalletRestoring(false);
      }
    }

    void restoreWallet();

    const eth = getEthereum();
    if (!eth?.on) return () => {
      cancelled = true;
    };

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts?.[0] && isAddress(accounts[0])) {
        localStorage.setItem(WALLET_FLAG_KEY, "1");
        localStorage.setItem(WALLET_ADDR_KEY, accounts[0]);
        setAccount(accounts[0]);
        setUserChecked(false);
        routedAfterConnect.current = false;
      } else {
        localStorage.removeItem(WALLET_FLAG_KEY);
        localStorage.removeItem(WALLET_ADDR_KEY);
        setAccount("");
        setRegistered(false);
        setUserChecked(false);
        routedAfterConnect.current = false;
      }
    };

    eth.on("accountsChanged", onAccountsChanged);
    return () => {
      cancelled = true;
      eth.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const readProviderRef = useRef<JsonRpcProvider | null>(null);

  const getReadProvider = useCallback(() => {
    // Reuse one provider — creating a new JsonRpcProvider per call is slow.
    if (!readProviderRef.current) {
      readProviderRef.current = new JsonRpcProvider(BSC_TESTNET_RPC, BSC_TESTNET_CHAIN_ID, {
        staticNetwork: true,
      });
    }
    return readProviderRef.current;
  }, []);

  const getSignerContract = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) throw new Error("MetaMask / Web3 wallet not found");
    const provider = new BrowserProvider(eth);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== BSC_TESTNET_CHAIN_ID) {
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x61" }],
        });
      } catch {
        throw new Error("Please switch to BSC Testnet (chainId 97)");
      }
    }
    const signer = await provider.getSigner();
    if (!isAddress(contractAddr) || contractAddr === ZeroAddress) {
      throw new Error("Set a valid FalconCapital contract address first");
    }
    return {
      provider,
      signer,
      contract: new Contract(contractAddr, FALCON_ABI, signer),
      address: await signer.getAddress(),
    };
  }, [contractAddr]);

  const getReadContract = useCallback(async () => {
    if (!isAddress(contractAddr) || contractAddr === ZeroAddress) {
      throw new Error("Invalid contract address");
    }
    return new Contract(contractAddr, FALCON_ABI, getReadProvider());
  }, [contractAddr, getReadProvider]);

  const loadStatic = useCallback(async () => {
    setStaticLoading(true);
    try {
      const c = await getReadContract();
      const provider = getReadProvider();
      const tokenAddr: string =
        (await c.paymentToken().catch(() => DEFAULT_PAYMENT_TOKEN)) || DEFAULT_PAYMENT_TOKEN;
      setPaymentToken(tokenAddr);
      const token = new Contract(tokenAddr, ERC20_ABI, provider);

      const [sym, onchainDec, users, pkgResults, thresholdResults, bal, cycle, next, deployed, targetPct] =
        await Promise.all([
          token.symbol().catch(() => "USDC"),
          c.paymentDecimals().catch(() => token.decimals().catch(() => 18)),
          c.userCount().catch(() => 0n),
          Promise.all([1, 2, 3, 4, 5].map((id) => c.getPackage(id).catch(() => null))),
          Promise.all([0, 1, 2, 3, 4].map((i) => c.ctoThresholds(i).catch(() => 0n))),
          c.secureFundBalance().catch(() => 0n),
          c.secureFundCycle().catch(() => 0n),
          c.nextSecureFundAvailableAt().catch(() => 0n),
          c.deployedAt().catch(() => 0n),
          c.secureFundTargetPercent().catch(() => 120),
        ]);

      const cycleNum = Number(cycle);
      const cyclePool =
        cycleNum > 0
          ? BigInt(await c.secureFundCyclePool(cycleNum).catch(() => 0n))
          : 0n;

      setTokenSymbol(String(sym));
      setTokenDecimals(Number(onchainDec));
      setTotalUsers(Number(users));
      setPkgRows(
        pkgResults.map((p, idx) => {
          const id = idx + 1;
          const emptyRanks = [0n, 0n, 0n, 0n, 0n];
          if (!p) {
            return {
              id,
              price: 0n,
              directBonus: 0n,
              secureFund: 0n,
              matrixPool: 0n,
              ctoPool: 0n,
              globalPool: 0n,
              matrixPerLevel: 0n,
              globalPerLevel: 0n,
              ctoPerRank: emptyRanks,
            };
          }
          const rawRanks = (p.ctoPerRank ?? p[8] ?? emptyRanks) as readonly (
            | bigint
            | number
            | string
            | boolean
            | undefined
          )[];
          const ctoPerRank = [0, 1, 2, 3, 4].map((i) => BigInt(rawRanks[i] ?? 0));
          return {
            id,
            price: BigInt(p.price ?? p[0] ?? 0),
            directBonus: BigInt(p.directBonus ?? p[1] ?? 0),
            secureFund: BigInt(p.secureFund ?? p[2] ?? 0),
            matrixPool: BigInt(p.matrixPool ?? p[3] ?? 0),
            ctoPool: BigInt(p.ctoPool ?? p[4] ?? 0),
            globalPool: BigInt(p.globalPool ?? p[5] ?? 0),
            matrixPerLevel: BigInt(p.matrixPerLevel ?? p[6] ?? 0),
            globalPerLevel: BigInt(p.globalPerLevel ?? p[7] ?? 0),
            ctoPerRank,
          };
        }),
      );
      setCtoThresholds(thresholdResults.map((t) => BigInt(t)));
      const pct = Number(targetPct);
      setSf({
        balance: BigInt(bal),
        cycle: cycleNum,
        next: Number(next),
        deployed: Number(deployed),
        targetPercent: pct,
        cyclePool,
      });
      setSfTargetInput(String(pct));
    } catch {
      // Contract not set / not deployed yet — UI still usable
    } finally {
      setStaticLoading(false);
    }
  }, [getReadContract, getReadProvider]);

  /** Slow scan — background only so dashboard isn't blocked. */
  const loadDirects = useCallback(async () => {
    if (!account) {
      setDirects([]);
      setDirectsLoading(false);
      return;
    }
    setDirectsLoading(true);
    try {
      const c = await getReadContract();
      const count = Number(await c.userCount().catch(() => 0n));
      const maxScan = Math.min(count, 500);
      const team: {
        address: string;
        packageId: number;
        invested: bigint;
        earned: bigint;
        joinedAt: number;
      }[] = [];
      const CHUNK = 40;
      const me = account.toLowerCase();

      for (let i = 0; i < maxScan; i += CHUNK) {
        const indexes = Array.from({ length: Math.min(CHUNK, maxScan - i) }, (_, j) => i + j);
        const addrs = await Promise.all(
          indexes.map((idx) => c.userList(idx).then((a: string) => String(a)).catch(() => "")),
        );
        const valid = addrs.filter((a) => a && isAddress(a));
        const details = await Promise.all(
          valid.map(async (addr) => {
            try {
              const tu = await c.users(addr);
              return { addr, tu };
            } catch {
              return null;
            }
          }),
        );
        for (const row of details) {
          if (!row) continue;
          const sp = String(row.tu.sponsor ?? row.tu[1] ?? "");
          if (sp.toLowerCase() !== me) continue;
          team.push({
            address: row.addr,
            packageId: Number(row.tu.currentPackage ?? row.tu[2] ?? 0),
            invested: BigInt(row.tu.totalInvested ?? row.tu[3] ?? 0),
            earned: BigInt(row.tu.totalEarned ?? row.tu[4] ?? 0),
            joinedAt: Number(row.tu.registeredAt ?? row.tu[6] ?? 0),
          });
        }
      }
      setDirects(team);
    } catch (e) {
      console.error(e);
    } finally {
      setDirectsLoading(false);
    }
  }, [account, getReadContract]);

  const loadUser = useCallback(async () => {
    if (!account) {
      setUserChecked(false);
      setRegistered(false);
      setUserLoading(false);
      return;
    }
    setUserLoading(true);
    try {
      const c = await getReadContract();
      const provider = getReadProvider();
      const tokenAddr = paymentToken || DEFAULT_PAYMENT_TOKEN;
      const token = new Contract(tokenAddr, ERC20_ABI, provider);

      const [u, pools, secureElig, bal, allow, owner, pausedVal, treasuryVal, matrixInfos, payoutDue, targetAmt, sfCycle] =
        await Promise.all([
          c.users(account),
          c.getIncomeTotals(account).catch(() => null),
          c.isSecureFundEligible(account).catch(() => false),
          token.balanceOf(account).catch(() => 0n),
          token.allowance(account, contractAddr).catch(() => 0n),
          c.owner().catch(() => ZeroAddress),
          c.paused().catch(() => false),
          c.treasury().catch(() => ""),
          Promise.all([1, 2, 3, 4, 5].map((id) => c.matrices(account, id).catch(() => null))),
          c.secureFundPayoutDue(account).catch(() => 0n),
          c.secureFundTargetAmount(account).catch(() => 0n),
          c.secureFundCycle().catch(() => 0n),
        ]);

      const cycleNum = Number(sfCycle);
      const claimed =
        cycleNum > 0
          ? Boolean(await c.secureFundClaimed(cycleNum, account).catch(() => false))
          : false;
      setSfPayoutDue(BigInt(payoutDue));
      setSfTargetAmount(BigInt(targetAmt));
      setSfClaimed(claimed);

      const reg = Boolean(u.registered ?? u[0]);
      setRegistered(reg);
      setUserChecked(true);
      if (reg) clearRefFromUrl();
      if (!routedAfterConnect.current) {
        routedAfterConnect.current = true;
        setTab(reg ? "dashboard" : "register");
      } else if (reg) {
        setTab((prev) => (prev === "register" ? "dashboard" : prev));
      }
      setSponsor(String(u.sponsor ?? u[1] ?? ""));
      const pkg = Number(u.currentPackage ?? u[2] ?? 0);
      setCurrentPackage(pkg);
      // Keep matrix tree on the user's active (highest) package after load / upgrade
      if (pkg > 0 && pkg !== lastSyncedPkg.current) {
        lastSyncedPkg.current = pkg;
        setMatrixPkg(pkg);
        setDownlinePkg(pkg);
      }
      setInvested(BigInt(u.totalInvested ?? u[3] ?? 0));
      setEarned(BigInt(u.totalEarned ?? u[4] ?? 0));
      setWithdrawable(BigInt(u.withdrawable ?? u[5] ?? 0));
      setJoinedAt(Number(u.registeredAt ?? u[6] ?? 0));

      if (pools) {
        setIncomePools({
          direct: BigInt(pools.direct ?? pools[0] ?? 0),
          matrix: BigInt(pools.matrix ?? pools[1] ?? 0),
          global: BigInt(pools.global ?? pools[2] ?? 0),
          cto: BigInt(pools.cto ?? pools[3] ?? 0),
          secure: BigInt(pools.secureFund ?? pools[4] ?? 0),
        });
      }
      setSecureEligible(Boolean(secureElig));
      setBalance(BigInt(bal));
      setAllowance(BigInt(allow));
      setIsOwner(String(owner).toLowerCase() === account.toLowerCase());
      setPaused(Boolean(pausedVal));
      setTreasury(String(treasuryVal || ""));
      setAllMatrix(
        matrixInfos.map((info, idx) => {
          const id = idx + 1;
          if (!info) return { pkg: id, active: false, downline: 0n, rank: 0, children: 0 };
          return {
            pkg: id,
            active: Boolean(info.active ?? info[0]),
            downline: BigInt(info.downlineCount ?? info[3] ?? 0),
            rank: Number(info.rank ?? info[4] ?? 0),
            children: Number(info.childCount ?? info[2] ?? 0),
          };
        }),
      );
    } catch (e) {
      console.error(e);
      setUserChecked(true);
      if (!routedAfterConnect.current) {
        routedAfterConnect.current = true;
        setTab("register");
      }
    } finally {
      setUserLoading(false);
    }
  }, [account, contractAddr, getReadContract, getReadProvider, paymentToken]);

  /** Walk matrix children BFS to list every downline address under the account. */
  const loadDownline = useCallback(
    async (pkgOverride?: number) => {
      if (!account) {
        setDownlineMembers([]);
        setDownlineError("");
        return;
      }
      const pkgId =
        pkgOverride && pkgOverride >= 1 && pkgOverride <= 5 ? pkgOverride : downlinePkg;
      const seq = ++downlineLoadSeq.current;
      setDownlineLoading(true);
      setDownlineError("");
      setDownlinePage(0);
      try {
        const c = await getReadContract();
        const MAX_MEMBERS = 300;
        const BATCH = 8;
        const seen = new Set<string>([account.toLowerCase()]);
        const queue: { addr: string; level: number }[] = [{ addr: account, level: 0 }];
        const members: {
          address: string;
          level: number;
          packageId: number;
          invested: bigint;
          earned: bigint;
          joinedAt: number;
          active: boolean;
          childCount: number;
          downline: string;
        }[] = [];

        async function childrenOf(addr: string): Promise<string[]> {
          const raw = await withRetry(() => c.getMatrixChildren(addr, pkgId), 3, 300);
          return toAddr3(raw);
        }

        while (queue.length > 0 && members.length < MAX_MEMBERS) {
          if (seq !== downlineLoadSeq.current) return;
          const batch = queue.splice(0, Math.min(queue.length, BATCH));
          const childBatches = await Promise.all(
            batch.map(async ({ addr, level }) => {
              try {
                const children = await childrenOf(addr);
                return { level, children };
              } catch {
                // Soft-fail a single node so one RPC blip doesn't wipe the whole tree
                return { level, children: [] as string[] };
              }
            }),
          );

          const nextAddrs: { addr: string; level: number }[] = [];
          for (const { level, children } of childBatches) {
            for (const child of children) {
              const key = child.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              nextAddrs.push({ addr: child, level: level + 1 });
            }
          }

          if (!nextAddrs.length) {
            if (queue.length) await sleep(80);
            continue;
          }

          const details = await Promise.all(
            nextAddrs.map(async ({ addr, level }) => {
              try {
                const [tu, info] = await Promise.all([
                  withRetry(() => c.users(addr), 2, 200),
                  withRetry(() => c.matrices(addr, pkgId), 2, 200),
                ]);
                return {
                  address: addr,
                  level,
                  packageId: Number(tu.currentPackage ?? tu[2] ?? 0),
                  invested: BigInt(tu.totalInvested ?? tu[3] ?? 0),
                  earned: BigInt(tu.totalEarned ?? tu[4] ?? 0),
                  joinedAt: Number(tu.registeredAt ?? tu[6] ?? 0),
                  active: Boolean(info.active ?? info[0]),
                  childCount: Number(info.childCount ?? info[2] ?? 0),
                  downline: String(info.downlineCount ?? info[3] ?? 0),
                };
              } catch {
                return {
                  address: addr,
                  level,
                  packageId: 0,
                  invested: 0n,
                  earned: 0n,
                  joinedAt: 0,
                  active: false,
                  childCount: 0,
                  downline: "0",
                };
              }
            }),
          );

          if (seq !== downlineLoadSeq.current) return;

          for (const row of details) {
            if (members.length >= MAX_MEMBERS) break;
            members.push(row);
            queue.push({ addr: row.address, level: row.level });
          }

          // Ease public RPC pressure between BFS layers
          if (queue.length) await sleep(60);
        }

        if (seq !== downlineLoadSeq.current) return;

        // If BFS found nothing but contract reports downline, surface it for retry
        if (members.length === 0) {
          const info = await c.matrices(account, pkgId).catch(() => null);
          const reported = Number(info?.downlineCount ?? info?.[3] ?? 0);
          if (reported > 0) {
            setDownlineError(
              `Could not load ${reported} downline members (RPC). Tap Retry.`,
            );
          }
        }

        setDownlineMembers(members);
      } catch (e) {
        console.error(e);
        if (seq === downlineLoadSeq.current) {
          setDownlineMembers([]);
          setDownlineError("Failed to load matrix downline. Tap Retry.");
        }
      } finally {
        if (seq === downlineLoadSeq.current) setDownlineLoading(false);
      }
    },
    [account, downlinePkg, getReadContract],
  );

  const loadIncome = useCallback(async () => {
    if (!account) return;
    setIncomeLoading(true);
    try {
      const c = await getReadContract();
      const totalLen = Number(await c.incomeHistoryLength(account).catch(() => 0n));

      // Keep the window small for snappy first paint (filter still works client-side)
      const fetchLimit = Math.min(60, Math.max(PAGE_SIZE * 3, Math.min(totalLen, 60)));
      const start = Math.max(0, totalLen - fetchLimit);
      const raw = await c.getIncomeHistory(account, start, fetchLimit).catch(() => []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let all: IncomeRow[] = (raw as any[]).map((r) => ({
        incomeType: Number(r.incomeType ?? r[0] ?? 0),
        amount: BigInt(r.amount ?? r[1] ?? 0),
        from: String(r.from ?? r[2] ?? ""),
        packageId: Number(r.packageId ?? r[3] ?? 0),
        meta: BigInt(r.meta ?? r[4] ?? 0),
        timestamp: Number(r.timestamp ?? r[5] ?? 0),
      }));
      all = all.reverse();
      if (incomeFilter > 0) {
        all = all.filter((r) => r.incomeType === incomeFilter);
      }
      setHistoryTotal(all.length);
      const offset = historyPage * PAGE_SIZE;
      setHistoryRows(all.slice(offset, offset + PAGE_SIZE));
    } catch {
      setHistoryRows([]);
      setHistoryTotal(0);
    } finally {
      setIncomeLoading(false);
    }
  }, [account, getReadContract, historyPage, incomeFilter]);

  const fetchMatrixTreeData = useCallback(
    async (rootAddr: string, pkgId: number): Promise<MatrixTreeData> => {
      const emptySeat = (): MatrixSeatInfo => ({
        address: "",
        active: false,
        childCount: 0,
        downline: "0",
      });
      const empty: MatrixTreeData = {
        root: rootAddr,
        parent: "",
        active: false,
        childrenCount: 0,
        downline: "0",
        ctoRank: 0,
        children: [emptySeat(), emptySeat(), emptySeat()],
        grandchildren: [[], [], []],
        matrixDirects: 0,
        globalQualified: false,
      };
      if (!rootAddr || !isAddress(rootAddr) || pkgId < 1 || pkgId > 5) return empty;

      const c = await getReadContract();

      async function seatOf(addr: string): Promise<MatrixSeatInfo> {
        if (!addr || addr === ZeroAddress || !isAddress(addr)) return emptySeat();
        try {
          const info = await c.matrices(addr, pkgId);
          return {
            address: addr,
            active: Boolean(info.active ?? info[0]),
            childCount: Number(info.childCount ?? info[2] ?? 0),
            downline: String(info.downlineCount ?? info[3] ?? 0),
          };
        } catch {
          return { address: addr, active: false, childCount: 0, downline: "0" };
        }
      }

      try {
        const [info, childrenRaw] = await Promise.all([
          c.matrices(rootAddr, pkgId),
          c.getMatrixChildren(rootAddr, pkgId).catch(() => null),
        ]);
        const childAddrs = toAddr3(childrenRaw);
        const childSeats = await Promise.all(childAddrs.map((a) => seatOf(a)));
        const grandchildren = await Promise.all(
          childAddrs.map(async (child) => {
            if (!child) return [emptySeat(), emptySeat(), emptySeat()];
            const gcRaw = await c.getMatrixChildren(child, pkgId).catch(() => null);
            return Promise.all(toAddr3(gcRaw).map((a) => seatOf(a)));
          }),
        );
        const matrixDirects = Number(info.childCount ?? info[2] ?? 0);
        const globalQualified =
          matrixDirects >= 3 ||
          Boolean(await c.isGlobalPoolQualified(rootAddr, pkgId).catch(() => false));

        return {
          root: rootAddr,
          parent: String(info.parent ?? info[1] ?? ""),
          active: Boolean(info.active ?? info[0]),
          childrenCount: matrixDirects,
          downline: String(info.downlineCount ?? info[3] ?? 0),
          ctoRank: Number(info.rank ?? info[4] ?? 0),
          children: childSeats,
          grandchildren,
          matrixDirects,
          globalQualified,
        };
      } catch {
        return empty;
      }
    },
    [getReadContract],
  );

  /**
   * Global Autopool tree: only members who completed 3 matrix directs
   * (`isGlobalPoolQualified` / childCount === 3). Placed in a 3-wide tree
   * in matrix-BFS discovery order under the focused root.
   */
  const fetchGlobalTreeData = useCallback(
    async (rootAddr: string, pkgId: number): Promise<MatrixTreeData> => {
      const emptySeat = (): MatrixSeatInfo => ({
        address: "",
        active: false,
        childCount: 0,
        downline: "0",
      });
      const empty: MatrixTreeData = {
        root: rootAddr,
        parent: "",
        active: false,
        childrenCount: 0,
        downline: "0",
        ctoRank: 0,
        children: [emptySeat(), emptySeat(), emptySeat()],
        grandchildren: [[], [], []],
        matrixDirects: 0,
        globalQualified: false,
      };
      if (!rootAddr || !isAddress(rootAddr) || pkgId < 1 || pkgId > 5) return empty;

      const c = await getReadContract();
      const MAX_SCAN = 300;

      type NodeMeta = {
        address: string;
        parent: string;
        childCount: number;
        downlineCount: string;
        rank: number;
        matrixActive: boolean;
        qualified: boolean;
        kids: string[];
      };

      async function readNode(addr: string): Promise<NodeMeta | null> {
        if (!addr || addr === ZeroAddress || !isAddress(addr)) return null;
        try {
          const [info, kidsRaw, qual] = await Promise.all([
            c.matrices(addr, pkgId),
            c.getMatrixChildren(addr, pkgId).catch(() => null),
            c.isGlobalPoolQualified(addr, pkgId).catch(() => false),
          ]);
          const childCount = Number(info.childCount ?? info[2] ?? 0);
          return {
            address: addr,
            parent: String(info.parent ?? info[1] ?? ""),
            childCount,
            downlineCount: String(info.downlineCount ?? info[3] ?? 0),
            rank: Number(info.rank ?? info[4] ?? 0),
            matrixActive: Boolean(info.active ?? info[0]),
            qualified: Boolean(qual) || childCount >= 3,
            kids: toAddr3(kidsRaw),
          };
        } catch {
          return null;
        }
      }

      try {
        const rootMeta = await readNode(rootAddr);
        if (!rootMeta) return empty;

        const byAddr = new Map<string, NodeMeta>();
        byAddr.set(rootAddr.toLowerCase(), rootMeta);

        const seen = new Set<string>([rootAddr.toLowerCase()]);
        const queue = [...rootMeta.kids];
        for (const k of rootMeta.kids) seen.add(k.toLowerCase());

        while (queue.length > 0 && byAddr.size < MAX_SCAN) {
          const batch = queue.splice(0, 8);
          const nodes = await Promise.all(batch.map((a) => readNode(a)));
          for (const node of nodes) {
            if (!node) continue;
            const key = node.address.toLowerCase();
            if (byAddr.has(key)) continue;
            byAddr.set(key, node);
            for (const kid of node.kids) {
              const kk = kid.toLowerCase();
              if (!seen.has(kk)) {
                seen.add(kk);
                queue.push(kid);
              }
            }
          }
          if (queue.length) await sleep(40);
        }

        /** Qualified descendants under `addr` in matrix (excluding addr), matrix-BFS order. */
        function qualifiedUnder(addr: string): string[] {
          const start = byAddr.get(addr.toLowerCase());
          if (!start) return [];
          const out: string[] = [];
          const q = [...start.kids];
          const vis = new Set<string>([addr.toLowerCase()]);
          while (q.length) {
            const cur = q.shift()!;
            const k = cur.toLowerCase();
            if (vis.has(k)) continue;
            vis.add(k);
            const meta = byAddr.get(k);
            if (!meta) continue;
            if (meta.qualified) out.push(meta.address);
            q.push(...meta.kids);
          }
          return out;
        }

        function seatFromQualified(addr: string): MatrixSeatInfo {
          if (!addr) return emptySeat();
          const meta = byAddr.get(addr.toLowerCase());
          const under = qualifiedUnder(addr);
          return {
            address: addr,
            active: true,
            childCount: Math.min(3, under.length),
            downline: String(under.length),
          };
        }

        const underRoot = qualifiedUnder(rootAddr);
        // Flat 3× fill: as members qualify they occupy the next Global seats in BFS order
        const childAddrs = [underRoot[0] || "", underRoot[1] || "", underRoot[2] || ""];
        const childSeats = childAddrs.map((a) => seatFromQualified(a));
        const grandchildren = [0, 1, 2].map((c) =>
          [0, 1, 2].map((i) => seatFromQualified(underRoot[3 + c * 3 + i] || "")),
        );

        return {
          root: rootAddr,
          parent: rootMeta.parent,
          active: rootMeta.qualified,
          childrenCount: Math.min(3, underRoot.length),
          downline: String(underRoot.length),
          ctoRank: rootMeta.rank,
          children: childSeats,
          grandchildren,
          matrixDirects: rootMeta.childCount,
          globalQualified: rootMeta.qualified,
        };
      } catch {
        return empty;
      }
    },
    [getReadContract],
  );

  const loadMatrix = useCallback(
    async (opts?: { root?: string; pkg?: number; mode?: MatrixTreeMode }) => {
      if (!account) return;
      const root =
        opts?.root && isAddress(opts.root)
          ? opts.root
          : matrixFocus && isAddress(matrixFocus)
            ? matrixFocus
            : account;
      const pkgId = opts?.pkg && opts.pkg >= 1 && opts.pkg <= 5 ? opts.pkg : matrixPkg;
      const mode = opts?.mode ?? matrixTreeMode;
      const seq = ++matrixLoadSeq.current;
      setMatrixLoading(true);
      try {
        const tree =
          mode === "global"
            ? await fetchGlobalTreeData(root, pkgId)
            : await fetchMatrixTreeData(root, pkgId);
        if (seq !== matrixLoadSeq.current) return;
        setMatrixInfo({
          active: tree.active,
          parent: tree.parent,
          childrenCount: tree.childrenCount,
          downline: BigInt(tree.downline || 0),
          ctoRank: tree.ctoRank,
          children: tree.children.map((s) => s.address),
          childSeats: tree.children,
          grandchildren: tree.grandchildren,
          matrixDirects: tree.matrixDirects ?? tree.childrenCount,
          globalQualified: tree.globalQualified ?? false,
        });
        setMatrixFocus(root);
        setMatrixPath((prev) => {
          if (!prev.length) return [root];
          const idx = prev.findIndex((a) => a.toLowerCase() === root.toLowerCase());
          if (idx >= 0) return prev.slice(0, idx + 1);
          return prev;
        });
      } catch {
        if (seq !== matrixLoadSeq.current) return;
        setMatrixInfo({
          active: false,
          parent: "",
          childrenCount: 0,
          downline: 0n,
          ctoRank: 0,
          children: ["", "", ""],
          childSeats: [],
          grandchildren: [[], [], []],
          matrixDirects: 0,
          globalQualified: false,
        });
      } finally {
        if (seq === matrixLoadSeq.current) setMatrixLoading(false);
      }
    },
    [account, fetchGlobalTreeData, fetchMatrixTreeData, matrixFocus, matrixPkg, matrixTreeMode],
  );

  const selectMatrixPackage = useCallback((pkgId: number) => {
    if (pkgId < 1 || pkgId > 5) return;
    setMatrixPkg((prev) => (prev === pkgId ? prev : pkgId));
    setDownlinePkg(pkgId);
  }, []);

  const refreshSeq = useRef(0);
  const refreshAllRef = useRef<() => Promise<void>>(async () => {});
  const prevIncomeQuery = useRef({ filter: incomeFilter, page: historyPage });
  const prevMatrixQuery = useRef({ pkg: matrixPkg, focus: "" });
  const prevDownlinePkg = useRef(downlinePkg);

  const refreshAll = useCallback(async () => {
    const seq = ++refreshSeq.current;
    setBusy(true);
    try {
      // Critical path — unblock UI as soon as dashboard essentials are ready
      await Promise.all([loadStatic(), account ? loadUser() : Promise.resolve()]);
      if (seq !== refreshSeq.current) return;
      if (seq === refreshSeq.current) setBusy(false);

      if (account) {
        // Prefer package synced by loadUser so we never paint the wrong matrix tree
        const pkgForMatrix =
          lastSyncedPkg.current > 0 ? lastSyncedPkg.current : matrixPkg;
        // Mark query as current so the matrix effect doesn't clear & re-fetch
        prevMatrixQuery.current = { pkg: pkgForMatrix, focus: account };
        await Promise.all([
          loadIncome(),
          loadMatrix({ root: account, pkg: pkgForMatrix }),
        ]);
        if (seq !== refreshSeq.current) return;
        // Directs scan is heavy on public RPC — run after downline so Team list fills first
        prevDownlinePkg.current = pkgForMatrix;
        await loadDownline(pkgForMatrix);
        if (seq !== refreshSeq.current) return;
        void loadDirects();
      }
    } finally {
      if (seq === refreshSeq.current) setBusy(false);
    }
  }, [account, loadDirects, loadDownline, loadIncome, loadMatrix, loadStatic, loadUser, matrixPkg]);

  refreshAllRef.current = refreshAll;

  // Keep matrix root in sync when wallet account changes
  useEffect(() => {
    if (!account) return;
    setMatrixFocus(account);
    setMatrixPath([account]);
    lastSyncedPkg.current = 0;
    // Mark as synced so matrix effect doesn't double-fetch with refreshAll
    prevMatrixQuery.current = { pkg: prevMatrixQuery.current.pkg, focus: account };
  }, [account]);

  // Load once when wallet/contract is ready (no polling / no focus re-fetch)
  useEffect(() => {
    if (walletRestoring) return;
    if (!isAddress(contractAddr) || contractAddr === ZeroAddress) return;

    let cancelled = false;
    const bootId = window.setTimeout(() => {
      if (!cancelled) void refreshAllRef.current();
    }, 50);

    return () => {
      cancelled = true;
      refreshSeq.current += 1;
      window.clearTimeout(bootId);
    };
  }, [account, contractAddr, walletRestoring]);

  // Income filter / pagination only (initial load handled by refreshAll)
  useEffect(() => {
    if (!account || walletRestoring) return;
    const prev = prevIncomeQuery.current;
    if (prev.filter === incomeFilter && prev.page === historyPage) return;
    prevIncomeQuery.current = { filter: incomeFilter, page: historyPage };
    void loadIncome();
  }, [account, walletRestoring, incomeFilter, historyPage, loadIncome]);

  // Matrix package / focus navigation only
  useEffect(() => {
    if (!account || walletRestoring) return;
    const prev = prevMatrixQuery.current;
    const focus = (matrixFocus || account).toLowerCase();
    const prevFocus = (prev.focus || "").toLowerCase();
    if (prev.pkg === matrixPkg && prevFocus === focus) return;

    // Package switch → always reload that package's matrix from own seat
    if (prev.pkg !== matrixPkg) {
      prevMatrixQuery.current = { pkg: matrixPkg, focus: account };
      // Clear previous package seats immediately
      setMatrixInfo({
        active: false,
        parent: "",
        childrenCount: 0,
        downline: 0n,
        ctoRank: 0,
        children: ["", "", ""],
        childSeats: [],
        grandchildren: [[], [], []],
        matrixDirects: 0,
        globalQualified: false,
      });
      if (matrixFocus.toLowerCase() !== account.toLowerCase()) {
        setMatrixFocus(account);
        setMatrixPath([account]);
      } else {
        setMatrixPath([account]);
      }
      void loadMatrix({ root: account, pkg: matrixPkg });
      return;
    }

    prevMatrixQuery.current = { pkg: matrixPkg, focus: matrixFocus || account };
    void loadMatrix();
  }, [account, walletRestoring, matrixPkg, matrixFocus, loadMatrix]);

  // Reload tree when switching Matrix ↔ Global Autopool
  const prevTreeMode = useRef(matrixTreeMode);
  useEffect(() => {
    if (!account || walletRestoring) return;
    if (prevTreeMode.current === matrixTreeMode) return;
    prevTreeMode.current = matrixTreeMode;
    setMatrixFocus(account);
    setMatrixPath([account]);
    prevMatrixQuery.current = { pkg: matrixPkg, focus: account };
    void loadMatrix({ root: account, pkg: matrixPkg, mode: matrixTreeMode });
  }, [account, walletRestoring, matrixTreeMode, matrixPkg, loadMatrix]);

  useEffect(() => {
    if (!account || walletRestoring) return;
    if (prevDownlinePkg.current === downlinePkg) return;
    prevDownlinePkg.current = downlinePkg;
    void loadDownline(downlinePkg);
  }, [account, walletRestoring, downlinePkg, loadDownline]);

  function focusMatrixNode(addr: string) {
    if (!isAddress(addr)) return;
    setMatrixPath((prev) => {
      const base = prev.length ? prev : matrixFocus ? [matrixFocus] : account ? [account] : [];
      const idx = base.findIndex((a) => a.toLowerCase() === addr.toLowerCase());
      if (idx >= 0) return base.slice(0, idx + 1);
      return [...base, addr];
    });
    setMatrixFocus(addr);
  }

  function goMatrixHome() {
    if (!account) return;
    setMatrixPath([account]);
    setMatrixFocus(account);
  }

  function goMatrixUp() {
    const parent = matrixInfo.parent;
    if (!parent || parent === ZeroAddress || !isAddress(parent)) return;
    setMatrixPath((prev) => {
      if (prev.length > 1) return prev.slice(0, -1);
      return [parent];
    });
    setMatrixFocus(parent);
  }

  function jumpMatrixPath(index: number) {
    setMatrixPath((prev) => {
      const next = prev.slice(0, index + 1);
      const target = next[next.length - 1];
      if (target) setMatrixFocus(target);
      return next;
    });
  }

  async function connect() {
    try {
      const eth = getEthereum();
      if (!eth) {
        showToast("Install MetaMask or another Web3 wallet", "error");
        return;
      }
      const provider = new BrowserProvider(eth);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      localStorage.setItem(WALLET_FLAG_KEY, "1");
      localStorage.setItem(WALLET_ADDR_KEY, addr);
      setUserChecked(false);
      routedAfterConnect.current = false;
      setAccount(addr);
      showToast("Wallet connected");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Connect failed", "error");
    }
  }

  function disconnect() {
    localStorage.removeItem(WALLET_FLAG_KEY);
    localStorage.removeItem(WALLET_ADDR_KEY);
    setAccount("");
    setRegistered(false);
    setUserChecked(false);
    routedAfterConnect.current = false;
    showToast("Disconnected");
  }

  function saveContract() {
    if (!isAddress(contractInput)) {
      showToast("Invalid contract address", "error");
      return;
    }
    localStorage.setItem(STORAGE_KEY, contractInput);
    setContractAddr(contractInput);
    showToast("Contract address saved");
  }

  async function ensureApprove(amount: bigint) {
    const { contract, signer, address } = await getSignerContract();
    const tokenAddr: string =
      (await contract.paymentToken().catch(() => DEFAULT_PAYMENT_TOKEN)) || DEFAULT_PAYMENT_TOKEN;
    const token = new Contract(tokenAddr, ERC20_ABI, signer);
    const spender = contract.target as string;
    let allow: bigint = BigInt(await token.allowance(address, spender));
    if (allow >= amount) return;

    // Exact amount — avoids MetaMask "Unlimited spending cap / Review alert"
    showToast("MetaMask: Approve token spending (step 1/2)…");
    const tx = await token.approve(spender, amount);
    await tx.wait();

    // Re-read — RPC can lag one block after approve
    allow = BigInt(await token.allowance(address, spender));
    if (allow < amount) {
      await new Promise((r) => window.setTimeout(r, 1200));
      allow = BigInt(await token.allowance(address, spender));
    }
    if (allow < amount) {
      throw new Error(
        `Token approve failed — allowance ${fmtToken(allow, tokenDecimals)} < need ${fmtToken(amount, tokenDecimals)}. Confirm approve for ${shortAddr(spender, 6)}.`,
      );
    }
    showToast("Approved — confirm Register in MetaMask (step 2/2)…");
  }

  function friendlyTxError(label: string, e: unknown): string {
    let msg = `${label} failed`;
    if (!e || typeof e !== "object") return msg;

    const err = e as {
      code?: number | string;
      reason?: string;
      shortMessage?: string;
      message?: string;
      data?: string | { data?: string };
      error?: { message?: string; code?: number; data?: string };
      info?: { error?: { code?: number; message?: string; data?: unknown } };
      revert?: { signature?: string; name?: string; args?: unknown[] } | null;
    };

    msg =
      err.reason ||
      err.shortMessage ||
      err.error?.message ||
      err.message ||
      msg;

    const code = err.code ?? err.error?.code ?? err.info?.error?.code;
    const lower = String(msg).toLowerCase();
    if (
      code === 4001 ||
      code === "ACTION_REJECTED" ||
      lower.includes("user rejected") ||
      lower.includes("user denied") ||
      lower.includes("rejected the request")
    ) {
      return "Transaction rejected in MetaMask";
    }

    const rawData =
      (typeof err.data === "string" ? err.data : err.data?.data) ||
      err.error?.data ||
      "";
    if (typeof rawData === "string" && rawData.startsWith("0xfb8f41b2")) {
      return "Token allowance missing — approve USDC spend first, then Register again";
    }
    if (typeof rawData === "string" && rawData.startsWith("0xe450d38c")) {
      return `Insufficient ${tokenSymbol} balance for this package`;
    }

    const revertName = err.revert?.name || err.revert?.signature?.split("(")[0];
    if (revertName) {
      if (revertName === "InvalidSponsor") {
        return "Invalid sponsor — sponsor must already be registered";
      }
      if (revertName === "AlreadyRegistered") {
        return "This wallet is already registered";
      }
      return revertName;
    }

    const custom = String(msg).match(
      /\b(AlreadyRegistered|AlreadyOwnsPackage|InvalidSponsor|MustStartWithStarter|MustUpgradeSequentially|NotRegistered|NothingToWithdraw|SecureFundNotReady|EnforcedPause|InvalidPackage|ERC20InsufficientAllowance|ERC20InsufficientBalance)\b/,
    );
    if (custom) {
      if (custom[1] === "InvalidSponsor") {
        return "Invalid sponsor — sponsor must already be registered";
      }
      if (custom[1] === "ERC20InsufficientAllowance") {
        return "Token allowance missing — approve USDC spend first, then Register again";
      }
      if (custom[1] === "ERC20InsufficientBalance") {
        return `Insufficient ${tokenSymbol} balance for this package`;
      }
      return custom[1];
    }

    if (lower.includes("missing revert data") || lower.includes("unknown custom error")) {
      return `${label} failed — check: (1) BSC Testnet, (2) enough ${tokenSymbol}, (3) approve confirmed, (4) sponsor registered, (5) contract ${shortAddr(contractAddr, 6)}`;
    }

    return String(msg).slice(0, 180);
  }

  async function runTx(label: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      showToast(`${label} successful`);
      await refreshAll();
      return true;
    } catch (e) {
      showToast(friendlyTxError(label, e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    await runTx("Withdraw", async () => {
      const { contract } = await getSignerContract();
      const tx = await contract.withdraw();
      await tx.wait();
    });
  }

  function resolveSponsor(): string | null {
    const typed = sponsorInput.trim();
    if (isAddress(typed)) return typed;
    if (refSponsor.current && isAddress(refSponsor.current)) return refSponsor.current;
    return null;
  }

  async function onRegisterOnly() {
    const sponsor = resolveSponsor();
    if (!sponsor) {
      showToast("Enter a valid sponsor address", "error");
      return;
    }
    const ok = await runTx("Register", async () => {
      const { contract } = await getSignerContract();
      const sponsorInfo = await contract.users(sponsor);
      if (!Boolean(sponsorInfo.registered ?? sponsorInfo[0])) {
        throw new Error("Invalid sponsor — sponsor must already be registered");
      }
      const tx = await contract.registerWithSponsor(sponsor);
      await tx.wait();
    });
    if (ok) {
      clearRefFromUrl();
      refSponsor.current = "";
      setSponsorInput("");
      setTab("dashboard");
    }
  }

  async function onRegisterBuy() {
    const sponsor = resolveSponsor();
    if (!sponsor) {
      showToast("Enter a valid sponsor address", "error");
      return;
    }
    const ok = await runTx("Register & Buy", async () => {
      const eth = getEthereum();
      if (eth?.request) {
        const chainHex: string = await eth.request({ method: "eth_chainId" });
        const chainId = Number.parseInt(chainHex, 16);
        if (chainId !== BSC_TESTNET_CHAIN_ID) {
          try {
            await eth.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: `0x${BSC_TESTNET_CHAIN_ID.toString(16)}` }],
            });
          } catch {
            throw new Error("Switch MetaMask to BNB Smart Chain Testnet (chainId 97)");
          }
        }
      }

      const { contract, signer, address } = await getSignerContract();
      const pkg = await contract.getPackage(1);
      const price = BigInt(pkg.price ?? pkg[0] ?? 0);
      if (price <= 0n) throw new Error("Package price unavailable — check contract");

      const tokenAddr: string =
        (await contract.paymentToken().catch(() => DEFAULT_PAYMENT_TOKEN)) || DEFAULT_PAYMENT_TOKEN;
      const token = new Contract(tokenAddr, ERC20_ABI, signer);
      const bal: bigint = BigInt(await token.balanceOf(address));
      if (bal < price) {
        throw new Error(
          `Insufficient ${tokenSymbol} — need ${fmtToken(price, tokenDecimals)}, have ${fmtToken(bal, tokenDecimals)}`,
        );
      }

      const sponsorInfo = await contract.users(sponsor);
      if (!Boolean(sponsorInfo.registered ?? sponsorInfo[0])) {
        throw new Error("Invalid sponsor — sponsor must already be registered");
      }

      await ensureApprove(price);

      try {
        await contract.registerAndBuy.staticCall(sponsor, 1);
      } catch (e) {
        throw e;
      }

      const tx = await contract.registerAndBuy(sponsor, 1);
      await tx.wait();
    });
    if (ok) {
      clearRefFromUrl();
      refSponsor.current = "";
      setSponsorInput("");
      setTab("dashboard");
    }
  }

  async function onUpgrade() {
    const next = currentPackage + 1;
    if (next < 2 || next > 5) {
      showToast("No further upgrade available", "error");
      return;
    }
    await runTx("Upgrade", async () => {
      const { contract } = await getSignerContract();
      const pkg = await contract.getPackage(next);
      const price = BigInt(pkg.price ?? pkg[0] ?? 0);
      await ensureApprove(price);
      const tx = await contract.buyPackage(next);
      await tx.wait();
    });
  }

  async function onPause(doPause: boolean) {
    await runTx(doPause ? "Pause" : "Unpause", async () => {
      const { contract } = await getSignerContract();
      const tx = doPause ? await contract.pause() : await contract.unpause();
      await tx.wait();
    });
  }

  async function onFinalizeSf() {
    await runTx("Finalize Secure Fund", async () => {
      const { contract } = await getSignerContract();
      const tx = await contract.finalizeSecureFundCycle();
      await tx.wait();
    });
  }

  async function onSetTreasury() {
    if (!isAddress(newTreasury)) {
      showToast("Invalid treasury address", "error");
      return;
    }
    await runTx("Set Treasury", async () => {
      const { contract } = await getSignerContract();
      const tx = await contract.setTreasury(newTreasury);
      await tx.wait();
    });
  }

  async function onDistributeSf() {
    const cycle = Number(sfDistributeCycle || sf.cycle);
    const recipients = sfDistributeRecipients
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!cycle || recipients.length === 0) {
      showToast("Cycle + at least one recipient required", "error");
      return;
    }
    if (!recipients.every((a) => isAddress(a))) {
      showToast("Invalid recipient address", "error");
      return;
    }
    await runTx("Distribute Secure Fund", async () => {
      const { contract } = await getSignerContract();
      const tx = await contract.distributeSecureFund(cycle, recipients);
      await tx.wait();
    });
  }

  async function onSetSfTargetPercent() {
    const pct = Number(sfTargetInput);
    if (!Number.isFinite(pct) || pct <= 0) {
      showToast("Enter a valid target percent", "error");
      return;
    }
    await runTx("Set Secure Fund %", async () => {
      const { contract } = await getSignerContract();
      const tx = await contract.setSecureFundTargetPercent(pct);
      await tx.wait();
    });
  }

  async function onClaimSecureFund() {
    const cycle = sf.cycle;
    if (!cycle) {
      showToast("No secure fund cycle yet", "error");
      return;
    }
    await runTx("Claim Secure Fund", async () => {
      const { contract } = await getSignerContract();
      const tx = await contract.claimSecureFund(cycle);
      await tx.wait();
    });
  }

  async function onRescueToken() {
    if (!isAddress(rescueTokenAddr) || !isAddress(rescueTo)) {
      showToast("Invalid token or recipient address", "error");
      return;
    }
    if (!rescueAmount.trim()) {
      showToast("Enter amount", "error");
      return;
    }
    await runTx("Rescue Token", async () => {
      const { contract } = await getSignerContract();
      const amount = parseUnits(rescueAmount.trim(), tokenDecimals);
      const tx = await contract.rescueToken(rescueTokenAddr, rescueTo, amount);
      await tx.wait();
    });
  }

  function copyText(text: string) {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    showToast("Copied");
  }

  function incomeLevelLabel(row: IncomeRow) {
    if ((row.incomeType === 2 || row.incomeType === 3) && row.meta > 0n) {
      return `L${row.meta.toString()}`;
    }
    return "—";
  }

  const nextPackageConfig = pkgRows.find((p) => p.id === currentPackage + 1);
  const nextPackagePriceLabel =
    nextPackageConfig && nextPackageConfig.price > 0n
      ? `$${formatUnits(nextPackageConfig.price, tokenDecimals)}`
      : `$${PACKAGE_PRICES_USD[currentPackage + 1] || 0}`;

  const canUpgrade =
    Boolean(account) && registered && currentPackage >= 1 && currentPackage < 5;

  const nextUpgradeHint =
    !account
      ? "Connect wallet to see next upgrade."
      : !registered
        ? "Register & buy Starter first."
        : currentPackage >= 5
          ? "You are on Crown — highest package."
          : currentPackage < 1
            ? "Buy Starter first to unlock upgrades."
            : `Next: ${PACKAGE_NAMES[currentPackage + 1]} (${nextPackagePriceLabel})`;

  const historyPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE) || 1);
  const downlinePages = Math.max(1, Math.ceil(downlineMembers.length / PAGE_SIZE) || 1);
  const pagedDownline = downlineMembers.slice(
    downlinePage * PAGE_SIZE,
    downlinePage * PAGE_SIZE + PAGE_SIZE,
  );

  const navItems = useMemo(
    () => (isOwner ? [...TABS, ADMIN_TAB] : TABS),
    [isOwner],
  );

  const shellTitle =
    navItems.find((t) => t.id === tab)?.label || TABS.find((t) => t.id === tab)?.label || "Dashboard";

  function handleNavigate(id: string) {
    if (id === "register") {
      setTab("dashboard");
      return;
    }
    if (id === "admin" && !isOwner) {
      showToast("Admin access is only for the contract owner wallet", "error");
      setTab("dashboard");
      return;
    }
    if (id === "team" && matrixPkg >= 1 && matrixPkg <= 5) {
      setDownlinePkg(matrixPkg);
    }
    setTab(id as TabId);
  }

  // Kick non-owners out of admin if ownership changes
  useEffect(() => {
    if (tab === "admin" && !isOwner) setTab("dashboard");
  }, [tab, isOwner]);

  const toastNode = toast ? (
    <div
      className={`toast fixed bottom-6 right-6 z-[999] ${toast.type === "error" ? "toast-danger" : "toast-success"}`}
      role="status"
    >
      {toast.message}
    </div>
  ) : null;

  if (walletRestoring) {
    return (
      <>
        <WalletAuthScreen mode="checking" accountLabel={cachedWalletLabel} />
        {toastNode}
      </>
    );
  }

  if (!account) {
    return (
      <>
        <WalletAuthScreen mode="login" onConnect={() => void connect()} busy={busy} />
        {toastNode}
      </>
    );
  }

  if (!userChecked) {
    return (
      <>
        <WalletAuthScreen mode="checking" accountLabel={shortAddr(account, 6)} />
        {toastNode}
      </>
    );
  }

  if (!registered) {
    return (
      <>
        <WalletAuthScreen
          mode="register"
          accountLabel={shortAddr(account, 6)}
          sponsorInput={sponsorInput}
          onSponsorChange={setSponsorInput}
          onRegisterBuy={() => void onRegisterBuy()}
          onRegisterOnly={() => void onRegisterOnly()}
          onDisconnect={disconnect}
          busy={busy}
        />
        {toastNode}
      </>
    );
  }

  return (
    <AppShell
      title={shellTitle}
      navItems={navItems}
      primaryNavItems={PRIMARY_NAV}
      activeId={tab}
      onNavigate={handleNavigate}
      headerRight={
        <>
          <span className="badge badge-gold font-mono hidden sm:inline-flex">
            {shortAddr(account, 6)}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => void refreshAll()}
            disabled={busy}
          >
            <RefreshCw className={`h-3.5 w-3.5${busy ? " animate-spin" : ""}`} />
            Refresh
          </button>
          <button className="btn btn-danger btn-sm" type="button" onClick={disconnect}>
            Disconnect
          </button>
        </>
      }
    >
      {tab !== "matrix" && (
        <>
      <PageHeader
        title={shellTitle}
        description={
          tab === "admin"
            ? "Owner-only contract controls"
            : "Packages · Matrix · Secure Fund · Team"
        }
      />

      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
        <span>
          Contract:{" "}
          {isAddress(contractAddr) && contractAddr !== ZeroAddress ? (
            <a href={explorerAddress(contractAddr, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
              {shortAddr(contractAddr, 6)}
            </a>
          ) : (
            "—"
          )}
        </span>
        <span>
          Payment token ({tokenSymbol}):{" "}
          {paymentToken ? (
            <a href={explorerAddress(paymentToken, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
              {shortAddr(paymentToken, 6)}
            </a>
          ) : (
            "—"
          )}
        </span>
      </div>

      <details className="card mb-4">
        <summary className="cursor-pointer text-sm text-muted">Advanced — change contract (optional)</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="field" style={{ flex: 2, minWidth: 280 }}>
            <label className="label">FalconCapital Contract Address</label>
            <input
              className="input input-mono"
              value={contractInput}
              onChange={(e) => setContractInput(e.target.value.trim())}
              spellCheck={false}
            />
          </div>
          <button className="btn btn-ghost" type="button" onClick={saveContract}>
            Reload Contract
          </button>
        </div>
      </details>
        </>
      )}

      <div className="flex flex-col gap-4">
      {/* Dashboard */}
      {tab === "dashboard" && (
      <section className="relative">
        {(busy || userLoading) && (
          <div className="section-loading-overlay">
            <DataLoading label="Loading your dashboard…" />
          </div>
        )}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Your Referral Link</h2>
          <div className="field">
            <label className="label">Share this sponsor link</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input className="input" readOnly value={referralLink} style={{ flex: 1, minWidth: 200 }} />
              <button className="btn btn-primary" type="button" onClick={() => copyText(referralLink)}>
                Copy
              </button>
            </div>
          </div>
          <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0.65rem 0 0" }}>
            New users join using your address as sponsor.
          </p>
        </div>

        <div className="grid-stats" style={{ marginBottom: "1rem" }}>
          {(
            [
              [
                "Registered",
                registered ? (
                  <span style={{ color: "var(--color-success)",display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                    Active{" "}
                    <span aria-hidden="true" style={{ color: "var(--color-success)", fontWeight: 700 }}>
                      ✓
                    </span>
                  </span>
                ) : (
                  "No"
                ),
              ],
              ["Current Package", currentPackage ? pkgName(currentPackage) : "—"],
              ["Sponsor", shortAddr(sponsor)],
              ["Total Investment", fmtUsd(invested, tokenDecimals)],
              ["Total Earned", fmtUsd(earned, tokenDecimals)],
              ["Withdrawable", fmtUsd(withdrawable, tokenDecimals)],
              ["Wallet Balance", `${fmtToken(balance, tokenDecimals)} ${tokenSymbol}`],
              ["Token Allowance", `${fmtToken(allowance, tokenDecimals)} ${tokenSymbol}`],
              ["Joined", fmtTime(joinedAt)],
            ] as const
          ).map(([label, value], i) => (
            <div className="card" key={label}>
              <div className="stat-label !text-left">{label}</div>
              <div className={`stat-value !text-left${i === 5 ? " text-gradient-gold" : ""}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="card dash-upgrade-card" style={{ marginBottom: "1rem" }}>
          <div className="dash-upgrade-grid">
            <div className="dash-upgrade-col">
              <h2 className="card-title">Package Progress</h2>
              <div className="pkg-progress pkg-progress-track">
                {[1, 2, 3, 4, 5].map((id, idx) => (
                  <div key={id} className="pkg-step">
                    {idx > 0 ? (
                      <span
                        className={`pkg-step-line${currentPackage >= id ? " filled" : ""}`}
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className={`pkg-chip${currentPackage > id ? " done" : ""}${currentPackage === id ? " current" : ""}`}
                    >
                      {PACKAGE_NAMES[id]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="dash-upgrade-divider" aria-hidden />

            <div className="dash-upgrade-col dash-upgrade-actions">
              <h2 className="card-title">Upgrade Package</h2>
              <div className="dash-upgrade-meta">
                <div className="dash-upgrade-meta-item">
                  <span>Current</span>
                  <strong>{currentPackage ? pkgName(currentPackage) : "None"}</strong>
                </div>
                <div className="dash-upgrade-meta-item">
                  <span>Next</span>
                  <strong className={canUpgrade ? "next" : ""}>
                    {canUpgrade
                      ? `${PACKAGE_NAMES[currentPackage + 1]} · ${nextPackagePriceLabel}`
                      : currentPackage >= 5
                        ? "Max reached"
                        : "—"}
                  </strong>
                </div>
              </div>
              <div className="dash-upgrade-btns">
                <button
                  className={`btn btn-primary${canUpgrade && !busy && !staticLoading ? " btn-blink" : ""}`}
                  type="button"
                  disabled={!canUpgrade || busy || staticLoading}
                  onClick={() => void onUpgrade()}
                >
                  {canUpgrade
                    ? `Upgrade to ${PACKAGE_NAMES[currentPackage + 1]}`
                    : currentPackage >= 5
                      ? "Max Package Reached"
                      : "Upgrade Package"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setTab("packages")}
                >
                  View Packages
                </button>
              </div>
              {!canUpgrade ? (
                <p className="text-muted dash-upgrade-hint">{nextUpgradeHint}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Income by Pool</h2>
          <div className="grid-stats">
            {(
              [
                ["Referral", incomePools.direct],
                ["Matrix", incomePools.matrix],
                ["Global", incomePools.global],
                ["Rank", incomePools.cto],
                ["Secure Fund", incomePools.secure],
              ] as const
            ).map(([label, val]) => (
              <div key={label}>
                <div className="stat-label !text-left">{label}</div>
                <div className="stat-value !text-left">{fmtUsd(val, tokenDecimals)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!account || withdrawable === 0n || busy}
              onClick={() => void onWithdraw()}
            >
              Withdraw Earnings
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Secure Fund Eligibility</h2>
          <p>
            <span className={`badge${secureEligible ? " badge-success" : ""}`}>
              {account ? (secureEligible ? "Eligible" : "Not eligible") : "—"}
            </span>
          </p>
          <p className="text-muted" style={{ fontSize: "0.85rem", margin: "0.5rem 0 0" }}>
            Eligible when total income is zero or less than invested.
          </p>
        </div>
      </section>
      )}

      {/* Income */}
      {tab === "income" && (
      <section>
        <div className="grid-stats" style={{ marginBottom: "1rem" }}>
          {(
            [
              ["Referral", incomePools.direct],
              ["Matrix", incomePools.matrix],
              ["Global", incomePools.global],
              ["Rank", incomePools.cto],
              ["Secure", incomePools.secure],
            ] as const
          ).map(([label, val]) => (
            <div className="card" key={label}>
              <div className="stat-label !text-left">{label}</div>
              <div className="stat-value !text-left">
                {userLoading || busy ? (
                  <span className="skeleton inline-block h-7 w-20" aria-hidden />
                ) : (
                  fmtUsd(val, tokenDecimals)
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "end",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <h2 className="card-title" style={{ margin: 0 }}>
              Income History <span className="text-muted" style={{ fontWeight: 400 }}>({historyTotal})</span>
            </h2>
            <div className="field" style={{ maxWidth: 180, margin: 0 }}>
              <label className="label">Filter</label>
              <select
                className="input"
                value={incomeFilter}
                disabled={incomeLoading}
                onChange={(e) => {
                  setHistoryPage(0);
                  setIncomeFilter(Number(e.target.value));
                }}
              >
                {Object.entries(INCOME_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {Number(k) === 0 ? "All types" : v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {incomeLoading && <div className="loading-bar mb-3" />}
          <div className="team-table-wrap income-table-wrap">
            <table className="data-table team-data-table income-data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>From</th>
                  <th>Package</th>
                  <th>Level</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {!account ? (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      Connect wallet & load data
                    </td>
                  </tr>
                ) : incomeLoading ? (
                  <tr>
                    <td colSpan={6}>
                      <DataLoading label="Loading income history…" />
                    </td>
                  </tr>
                ) : historyRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      No income records
                    </td>
                  </tr>
                ) : (
                  historyRows.map((r, i) => (
                    <tr key={`${r.timestamp}-${i}`}>
                      <td>
                        <span className="badge badge-gold">
                          {INCOME_TYPES[r.incomeType] || r.incomeType}
                        </span>
                      </td>
                      <td>{fmtUsd(r.amount, tokenDecimals)}</td>
                      <td className="font-mono">{shortAddr(r.from)}</td>
                      <td>{pkgName(r.packageId)}</td>
                      <td>{incomeLevelLabel(r)}</td>
                      <td className="income-col-time">{fmtTime(r.timestamp)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="team-pager">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={historyPage <= 0 || incomeLoading}
              onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
            >
              ← Prev
            </button>
            <span className="text-muted" style={{ fontFamily: "var(--font-mono)" }}>
              {historyPage + 1} / {historyPages}
            </span>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={historyPage + 1 >= historyPages || incomeLoading}
              onClick={() => setHistoryPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      </section>
      )}

      {/* Matrix + Global Autopool */}
      {tab === "matrix" && (
      <section>
        <MatrixTreeView
          account={account}
          packageId={matrixPkg}
          activePackageId={currentPackage}
          treeMode={matrixTreeMode}
          onTreeModeChange={setMatrixTreeMode}
          loading={matrixLoading || busy}
          path={matrixPath.length ? matrixPath : matrixFocus ? [matrixFocus] : account ? [account] : []}
          sponsor={sponsor}
          joinedLabel={joinedAt ? fmtTime(joinedAt) : "—"}
          matrixEarnedLabel={fmtUsd(incomePools.matrix, tokenDecimals)}
          globalEarnedLabel={fmtUsd(incomePools.global, tokenDecimals)}
          data={{
            root: matrixFocus || account,
            parent: matrixInfo.parent,
            active: matrixInfo.active,
            childrenCount: matrixInfo.childrenCount,
            downline: String(matrixInfo.downline),
            ctoRank: matrixInfo.ctoRank,
            children: matrixInfo.childSeats.length
              ? matrixInfo.childSeats
              : matrixInfo.children.map((address) => ({
                  address,
                  active: false,
                  childCount: 0,
                  downline: "0",
                })),
            grandchildren: matrixInfo.grandchildren,
            matrixDirects: matrixInfo.matrixDirects,
            globalQualified: matrixInfo.globalQualified,
          } satisfies MatrixTreeData}
          onPackageChange={selectMatrixPackage}
          onFocus={focusMatrixNode}
          onGoHome={goMatrixHome}
          onGoUp={goMatrixUp}
          onPathJump={jumpMatrixPath}
          onRefresh={() =>
            void loadMatrix({
              root: matrixFocus || account,
              pkg: matrixPkg,
              mode: matrixTreeMode,
            })
          }
          onCopy={copyText}
          loadSubtree={(addr) =>
            matrixTreeMode === "global"
              ? fetchGlobalTreeData(addr, matrixPkg)
              : fetchMatrixTreeData(addr, matrixPkg)
          }
          onUpgrade={() => void onUpgrade()}
          canUpgrade={canUpgrade}
          upgradeLabel={
            canUpgrade
              ? `Upgrade to ${PACKAGE_NAMES[currentPackage + 1]}`
              : currentPackage >= 5
                ? "Max Package Reached"
                : "Upgrade Package"
          }
          upgradeDisabled={!canUpgrade || busy || staticLoading}
        />

        <div className="card" style={{ marginTop: "1rem" }}>
          <h2 className="card-title">
            Package Matrices
            {currentPackage > 0 ? ` · Active: ${PACKAGE_NAMES[currentPackage]}` : ""}
          </h2>
          <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0 0 0.85rem" }}>
            Each owned package has its own 3× placement tree. Matrix shows all seats; Global
            Autopool only includes members who completed 3 matrix directs.
          </p>
          {(userLoading || busy) && allMatrix.length === 0 ? (
            <DataLoading label="Loading package matrices…" />
          ) : (
            <div className="grid-stats">
              {allMatrix.map((m) => {
                const owned = currentPackage > 0 && m.pkg <= currentPackage;
                const isActive = m.pkg === currentPackage;
                const selected = m.pkg === matrixPkg;
                return (
                  <button
                    type="button"
                    className={`card text-left transition hover:border-[var(--color-border-strong)]${
                      selected ? " ring-1 ring-[var(--color-solar-400)]" : ""
                    }${!owned ? " opacity-50" : ""}`}
                    key={m.pkg}
                    disabled={!owned && currentPackage > 0}
                    onClick={() => owned && selectMatrixPackage(m.pkg)}
                  >
                    <div className="stat-label !text-left">
                      {PACKAGE_NAMES[m.pkg]}
                      {isActive ? " · Active" : owned ? " · Owned" : ""}
                    </div>
                    <div className="stat-value !text-left">
                      {m.active ? "On" : owned ? "Empty" : "Locked"}
                    </div>
                    <p className="text-muted" style={{ fontSize: "0.78rem", margin: "0.5rem 0 0" }}>
                      Downline {String(m.downline)} · Children {m.children}/3 · Rank {m.rank || "—"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-muted" style={{ fontSize: "0.82rem", marginTop: "0.85rem" }}>
            Rank thresholds:{" "}
            {ctoThresholds.length
              ? ctoThresholds.map((t, i) => `Rank${i + 1}=${String(t)}`).join(" · ")
              : "Rank1=27 · Rank2=243 · Rank3=2187 · Rank4=19683 · Rank5=59049"}{" "}
            downline
          </p>
        </div>
      </section>
      )}

      {/* Team */}
      {tab === "team" && (
      <section>
        <div className="grid-stats" style={{ marginBottom: "1rem" }}>
          <div className="card">
            <div className="stat-label !text-left">Referrals</div>
            <div className="stat-value !text-left text-gradient-gold">
              {userLoading || busy || directsLoading ? <span className="skeleton inline-block h-7 w-12" aria-hidden /> : directs.length}
            </div>
          </div>
          <div className="card">
            <div className="stat-label !text-left">Downline Members</div>
            <div className="stat-value !text-left text-gradient-gold">
              {downlineLoading || userLoading || busy ? (
                <span className="skeleton inline-block h-7 w-12" aria-hidden />
              ) : (
                String(
                  downlineMembers.length ||
                    allMatrix.find((m) => m.pkg === downlinePkg)?.downline ||
                    0,
                )
              )}
            </div>
          </div>
          {/* <div className="card">
            <div className="stat-label !text-left">Platform Users</div>
            <div className="stat-value !text-left">
              {staticLoading || busy ? <span className="skeleton inline-block h-7 w-12" aria-hidden /> : totalUsers}
            </div>
          </div> */}
        </div>
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Invite Link</h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input className="input" readOnly value={referralLink} style={{ flex: 1, minWidth: 200 }} />
            <button className="btn btn-primary" type="button" onClick={() => copyText(referralLink)}>
              Copy Link
            </button>
          </div>
        </div>
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="team-list-head">
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>
                Downline List
              </h2>
              <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0.25rem 0 0" }}>
                {downlineLoading
                  ? "Loading matrix downline…"
                  : `${downlineMembers.length} member${downlineMembers.length === 1 ? "" : "s"} in ${PACKAGE_NAMES[downlinePkg] || "package"} matrix`}
              </p>
              {downlineError ? (
                <p className="text-danger" style={{ fontSize: "0.82rem", margin: "0.35rem 0 0" }}>
                  {downlineError}{" "}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.78rem" }}
                    onClick={() => void loadDownline(downlinePkg)}
                    disabled={downlineLoading}
                  >
                    Retry
                  </button>
                </p>
              ) : null}
            </div>
            <div className="team-pkg-filters">
              {[1, 2, 3, 4, 5].map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`btn ${downlinePkg === id ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => {
                    setDownlinePage(0);
                    setDownlinePkg(id);
                  }}
                  disabled={downlineLoading}
                >
                  {PACKAGE_NAMES[id]}
                </button>
              ))}
            </div>
          </div>
          {downlineLoading && <div className="loading-bar mb-3" />}
          <div className="team-table-wrap">
            <table className="data-table team-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Level</th>
                  <th>Address</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Children</th>
                  <th>Their Downline</th>
                  <th>Invested</th>
                  <th>Earned</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {downlineLoading ? (
                  <tr>
                    <td colSpan={10}>
                      <DataLoading label="Loading matrix downline…" />
                    </td>
                  </tr>
                ) : downlineMembers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-muted">
                      No downline members yet
                    </td>
                  </tr>
                ) : (
                  pagedDownline.map((d, i) => (
                    <tr key={`${d.address}-${d.level}`}>
                      <td>{downlinePage * PAGE_SIZE + i + 1}</td>
                      <td>L{d.level}</td>
                      <td title={d.address}>{shortAddr(d.address)}</td>
                      <td>{pkgName(d.packageId)}</td>
                      <td>
                        <span className={d.active ? "text-leaf-400" : "text-danger"}>
                          {d.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{d.childCount}/3</td>
                      <td>{d.downline}</td>
                      <td>{fmtUsd(d.invested, tokenDecimals)}</td>
                      <td>{fmtUsd(d.earned, tokenDecimals)}</td>
                      <td className="team-col-joined">{fmtTime(d.joinedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {downlineMembers.length > 0 && (
            <div className="team-pager">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={downlinePage <= 0 || downlineLoading}
                onClick={() => setDownlinePage((p) => Math.max(0, p - 1))}
              >
                ← Prev
              </button>
              <span className="text-muted" style={{ fontFamily: "var(--font-mono)" }}>
                {downlinePage + 1} / {downlinePages}
              </span>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={downlinePage + 1 >= downlinePages || downlineLoading}
                onClick={() => setDownlinePage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="card-title">Referral Team Members</h2>
          <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0 0 0.5rem" }}>
            People who registered with your referral link ({directs.length})
          </p>
          {(directsLoading || userLoading || busy) && <div className="loading-bar mb-3" />}
          <div className="team-table-wrap" style={{ marginTop: "0.5rem" }}>
            <table className="data-table team-data-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Package</th>
                  <th>Invested</th>
                  <th>Earned</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {directsLoading || userLoading || busy ? (
                  <tr>
                    <td colSpan={5}>
                      <DataLoading label="Scanning direct referrals…" />
                    </td>
                  </tr>
                ) : directs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted">
                      —
                    </td>
                  </tr>
                ) : (
                  directs.map((d) => (
                    <tr key={d.address}>
                      <td title={d.address}>{shortAddr(d.address)}</td>
                      <td>{pkgName(d.packageId)}</td>
                      <td>{fmtUsd(d.invested, tokenDecimals)}</td>
                      <td>{fmtUsd(d.earned, tokenDecimals)}</td>
                      <td className="team-col-joined">{fmtTime(d.joinedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      )}

      {/* Packages */}
      {tab === "packages" && (
      <section>
        {(staticLoading || busy) && pkgRows.length === 0 && (
          <div className="card mb-4">
            <DataLoading label="Loading packages…" />
          </div>
        )}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Upgrade Package</h2>
          <p className="text-muted" style={{ fontSize: "0.88rem", margin: "0 0 1rem" }}>
            Starter → Silver → Gold → Diamond → Crown (sequential)
            {canUpgrade ? (
              <>
                {" "}
                · Next:{" "}
                <strong style={{ color: "var(--color-solar-300)" }}>
                  {PACKAGE_NAMES[currentPackage + 1]} ({nextPackagePriceLabel})
                </strong>
              </>
            ) : null}
          </p>
          {(staticLoading || userLoading) && <div className="loading-bar mb-3" />}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={`btn btn-primary${canUpgrade && !busy && !staticLoading ? " btn-blink" : ""}`}
              type="button"
              disabled={!canUpgrade || busy || staticLoading}
              onClick={() => void onUpgrade()}
            >
              {canUpgrade
                ? `Upgrade to ${PACKAGE_NAMES[currentPackage + 1]}`
                : currentPackage >= 5
                  ? "Max Package Reached"
                  : "Upgrade Package"}
            </button>
          </div>
          <p className="text-muted" style={{ fontSize: "0.82rem", marginTop: "1rem" }}>
            {nextUpgradeHint}
          </p>
        </div>
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">All Packages</h2>
          <div className="pkg-cards">
            {(pkgRows.length
              ? pkgRows
              : [1, 2, 3, 4, 5].map((id) => ({
                  id,
                  price: 0n,
                  directBonus: 0n,
                  secureFund: 0n,
                  matrixPool: 0n,
                  ctoPool: 0n,
                  globalPool: 0n,
                  matrixPerLevel: 0n,
                  globalPerLevel: 0n,
                  ctoPerRank: [0n, 0n, 0n, 0n, 0n],
                }))
            ).map((p) => (
              <div className="pkg-card" key={p.id}>
                <strong>{PACKAGE_NAMES[p.id]}</strong>
                <div className="price">
                  {p.price > 0n
                    ? `$${formatUnits(p.price, tokenDecimals)}`
                    : `$${PACKAGE_PRICES_USD[p.id]}`}
                </div>
                <div className="split">
                  Referral {fmtUsd(p.directBonus, tokenDecimals)} · Matrix {fmtUsd(p.matrixPool, tokenDecimals)} ·
                  Global {fmtUsd(p.globalPool, tokenDecimals)}
                  <br />
                  Rank pool {fmtUsd(p.ctoPool, tokenDecimals)} · Secure {fmtUsd(p.secureFund, tokenDecimals)}
                  <br />
                  Matrix/lvl {fmtUsd(p.matrixPerLevel, tokenDecimals)} · Global/lvl{" "}
                  {fmtUsd(p.globalPerLevel, tokenDecimals)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Package Distribution (On-chain)</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Price</th>
                  <th>Referral</th>
                  <th>Matrix</th>
                  <th>Global</th>
                  <th>Rank</th>
                  <th>Secure</th>
                </tr>
              </thead>
              <tbody>
                {pkgRows.map((p) => (
                  <tr key={p.id}>
                    <td>{PACKAGE_NAMES[p.id]}</td>
                    <td>{fmtUsd(p.price, tokenDecimals)}</td>
                    <td>{fmtUsd(p.directBonus, tokenDecimals)}</td>
                    <td>{fmtUsd(p.matrixPool, tokenDecimals)}</td>
                    <td>{fmtUsd(p.globalPool, tokenDecimals)}</td>
                    <td>{fmtUsd(p.ctoPool, tokenDecimals)}</td>
                    <td>{fmtUsd(p.secureFund, tokenDecimals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: "0.82rem", marginTop: "0.75rem" }}>
            Totals match package price (Referral + Matrix + Global + Rank + Secure).
          </p>
        </div>
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Per-Level Income (Matrix / Global)</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Matrix pool</th>
                  <th>Matrix / level</th>
                  <th>Global pool</th>
                  <th>Global / level</th>
                  <th>Levels</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {pkgRows.map((p) => {
                  const levels = 10n;
                  const matrixOk = p.matrixPerLevel * levels === p.matrixPool;
                  const globalOk = p.globalPerLevel * levels === p.globalPool;
                  return (
                    <tr key={p.id}>
                      <td>{PACKAGE_NAMES[p.id]}</td>
                      <td>{fmtUsd(p.matrixPool, tokenDecimals)}</td>
                      <td>{fmtUsd(p.matrixPerLevel, tokenDecimals)}</td>
                      <td>{fmtUsd(p.globalPool, tokenDecimals)}</td>
                      <td>{fmtUsd(p.globalPerLevel, tokenDecimals)}</td>
                      <td>10</td>
                      <td style={{ color: matrixOk && globalOk ? "var(--color-success)" : "var(--color-danger)" }}>
                        {matrixOk && globalOk ? "OK" : "Mismatch"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: "0.82rem", marginTop: "0.85rem" }}>
            Global / Matrix per-level × 10 levels should equal their pool totals.
          </p>
        </div>
        <div className="card">
          <h2 className="card-title">Rank Distribution (per rank)</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Rank pool</th>
                  <th>Rank 1</th>
                  <th>Rank 2</th>
                  <th>Rank 3</th>
                  <th>Rank 4</th>
                  <th>Rank 5</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {pkgRows.map((p) => {
                  const ranks = p.ctoPerRank?.length
                    ? p.ctoPerRank
                    : [0n, 0n, 0n, 0n, 0n];
                  const sum = ranks.reduce((a, b) => a + b, 0n);
                  const ok = sum === p.ctoPool;
                  return (
                    <tr key={p.id}>
                      <td>{PACKAGE_NAMES[p.id]}</td>
                      <td>{fmtUsd(p.ctoPool, tokenDecimals)}</td>
                      {ranks.map((amt, i) => (
                        <td key={i}>{fmtUsd(amt, tokenDecimals)}</td>
                      ))}
                      <td style={{ color: ok ? "var(--color-success)" : "var(--color-danger)" }}>
                        {ok ? "OK" : "Mismatch"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: "0.82rem", marginTop: "0.85rem" }}>
            Rank thresholds:{" "}
            {ctoThresholds.length
              ? ctoThresholds.map((t, i) => `R${i + 1}=${String(t)}`).join(" · ")
              : "R1=27 · R2=243 · R3=2187 · R4=19683 · R5=59049"}{" "}
            downline. Each qualified rank gets its share from the Rank pool.
          </p>
        </div>
      </section>
      )}

      {/* Secure Fund */}
      {tab === "secure" && (
      <section>
        {(staticLoading || busy) && (
          <div className="loading-bar mb-3" />
        )}
        <div className="grid-two" style={{ marginBottom: "1rem" }}>
          <div className="card">
            <h2 className="card-title">Platform Secure Fund</h2>
            {staticLoading || busy ? (
              <DataLoading label="Loading secure fund…" />
            ) : (
            <div className="grid-two">
              <div>
                <div className="stat-label !text-left">Current Pool</div>
                <div className="stat-value !text-left">{fmtUsd(sf.balance, tokenDecimals)}</div>
              </div>
              <div>
                <div className="stat-label !text-left">Cycle</div>
                <div className="stat-value !text-left">{sf.cycle || "—"}</div>
              </div>
              <div>
                <div className="stat-label !text-left">Cycle Pool</div>
                <div className="stat-value !text-left">{fmtUsd(sf.cyclePool, tokenDecimals)}</div>
              </div>
              <div>
                <div className="stat-label !text-left">Target %</div>
                <div className="stat-value !text-left">{sf.targetPercent}%</div>
              </div>
              <div>
                <div className="stat-label !text-left">Next Available</div>
                <div className="stat-value !text-left">{fmtTime(sf.next)}</div>
              </div>
              <div>
                <div className="stat-label !text-left">Deployed At</div>
                <div className="stat-value !text-left">{fmtTime(sf.deployed)}</div>
              </div>
            </div>
            )}
          </div>
          <div className="card">
            <h2 className="card-title">Your Status</h2>
            {userLoading || busy ? (
              <DataLoading label="Checking eligibility…" />
            ) : (
              <>
            <p style={{ margin: "0.25rem 0 0.75rem" }}>
              <span className={`badge${secureEligible ? " badge-success" : ""}`}>
                {account ? (secureEligible ? "Eligible" : "Not eligible") : "—"}
              </span>
              {sf.cycle > 0 && (
                <span className={`badge${sfClaimed ? "" : " badge-success"}`} style={{ marginLeft: "0.4rem" }}>
                  {sfClaimed ? "Claimed this cycle" : "Claim open"}
                </span>
              )}
            </p>
            <div className="stat-label !text-left">Your Secure Income</div>
            <div className="stat-value !text-left">{fmtUsd(incomePools.secure, tokenDecimals)}</div>
            <div className="grid-two" style={{ marginTop: "0.85rem" }}>
              <div>
                <div className="stat-label !text-left">Payout Due</div>
                <div className="stat-value !text-left" style={{ fontSize: "1.15rem" }}>
                  {fmtUsd(sfPayoutDue, tokenDecimals)}
                </div>
              </div>
              <div>
                <div className="stat-label !text-left">Target Amount</div>
                <div className="stat-value !text-left" style={{ fontSize: "1.15rem" }}>
                  {fmtUsd(sfTargetAmount, tokenDecimals)}
                </div>
              </div>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              style={{ marginTop: "1rem" }}
              disabled={!account || busy || !secureEligible || !sf.cycle || sfClaimed || sfPayoutDue === 0n}
              onClick={() => void onClaimSecureFund()}
            >
              Claim Secure Fund (Cycle {sf.cycle || "—"})
            </button>
            <p className="text-muted" style={{ fontSize: "0.82rem", marginTop: "1rem" }}>
              Silver+ packages contribute to Secure Fund. Eligible under-earners can claim after the
              owner finalizes a cycle.
            </p>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">How Secure Fund Works</h2>
          <ol className="text-muted" style={{ fontSize: "0.9rem", lineHeight: 1.7, margin: 0, paddingLeft: "1.2rem" }}>
            <li>Starter has no Secure Fund cut — starts from Silver.</li>
            <li>Pool accumulates in the contract (target {sf.targetPercent}% of invested).</li>
            <li>Owner finalizes a cycle when the period is ready.</li>
            <li>Eligible users claim their payout — shown in income history.</li>
          </ol>
        </div>
      </section>
      )}

      {/* On-chain Admin — owner wallet only */}
      {tab === "admin" && isOwner && (
      <section className="admin-panel">
        <div className="grid-stats" style={{ marginBottom: "1rem" }}>
          <div className="card">
            <div className="stat-label !text-left">Contract</div>
            <div className="stat-value !text-left" style={{ fontSize: "1rem" }}>
              <a href={explorerAddress(contractAddr, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
                {shortAddr(contractAddr, 6)}
              </a>
            </div>
          </div>
          <div className="card">
            <div className="stat-label !text-left">Status</div>
            <div className="stat-value !text-left">
              <span className={`badge${paused ? " badge-danger" : " badge-success"}`}>
                {paused ? "Paused" : "Live"}
              </span>
            </div>
          </div>
          <div className="card">
            <div className="stat-label !text-left">Users</div>
            <div className="stat-value !text-left text-gradient-gold">{totalUsers}</div>
          </div>
          <div className="card">
            <div className="stat-label !text-left">SF Pool</div>
            <div className="stat-value !text-left text-gradient-gold">
              {fmtUsd(sf.balance, tokenDecimals)}
            </div>
          </div>
        </div>

        <div className="grid-two" style={{ marginBottom: "1rem" }}>
          <div className="card">
            <h2 className="card-title">Contract Controls</h2>
            <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0 0 0.85rem" }}>
              Treasury: <code>{treasury ? shortAddr(treasury, 6) : "—"}</code>
            </p>
            <div className="flex flex-wrap gap-2">
              {paused ? (
                <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onPause(false)}>
                  Unpause Contract
                </button>
              ) : (
                <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void onPause(true)}>
                  Pause Contract
                </button>
              )}
            </div>
            <div className="field" style={{ marginTop: "1rem" }}>
              <label className="label">New Treasury Address</label>
              <input
                className="input"
                value={newTreasury}
                onChange={(e) => setNewTreasury(e.target.value.trim())}
                placeholder="0x…"
                spellCheck={false}
              />
            </div>
            <button
              className="btn btn-ghost"
              type="button"
              style={{ marginTop: "0.5rem" }}
              disabled={busy}
              onClick={() => void onSetTreasury()}
            >
              Set Treasury
            </button>
          </div>

          <div className="card">
            <h2 className="card-title">Secure Fund Settings</h2>
            <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0 0 0.85rem" }}>
              Cycle {sf.cycle || "—"} · Pool {fmtUsd(sf.cyclePool, tokenDecimals)} · Next{" "}
              {fmtTime(sf.next)}
            </p>
            <div className="field" style={{ maxWidth: 220 }}>
              <label className="label">Target Percent</label>
              <input
                className="input"
                value={sfTargetInput}
                onChange={(e) => setSfTargetInput(e.target.value.trim())}
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: "0.65rem" }}>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => void onSetSfTargetPercent()}
              >
                Update Target %
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => void onFinalizeSf()}
              >
                Finalize Cycle
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Distribute Secure Fund</h2>
          <p className="text-muted" style={{ fontSize: "0.82rem" }}>
            New ABI: pass cycle + recipient addresses only. Payout amounts are computed on-chain.
          </p>
          <div className="field" style={{ marginTop: "0.75rem", maxWidth: 280 }}>
            <label className="label">Cycle</label>
            <input
              className="input"
              value={sfDistributeCycle || String(sf.cycle || "")}
              onChange={(e) => setSfDistributeCycle(e.target.value.trim())}
            />
          </div>
          <div className="field" style={{ marginTop: "0.75rem" }}>
            <label className="label">Recipients (comma or newline)</label>
            <textarea
              className="input"
              rows={4}
              value={sfDistributeRecipients}
              onChange={(e) => setSfDistributeRecipients(e.target.value)}
              placeholder="0xabc…&#10;0xdef…"
              style={{ resize: "vertical", fontFamily: "var(--font-mono)" }}
            />
          </div>
          <button
            className="btn btn-primary"
            type="button"
            style={{ marginTop: "0.75rem" }}
            disabled={busy}
            onClick={() => void onDistributeSf()}
          >
            Distribute Secure Fund
          </button>
        </div>

        <div className="card">
          <h2 className="card-title">Rescue Token</h2>
          <p className="text-muted" style={{ fontSize: "0.82rem" }}>
            Withdraw stuck ERC-20 tokens from the contract (owner only).
          </p>
          <div className="grid-two" style={{ marginTop: "0.75rem" }}>
            <div className="field">
              <label className="label">Token</label>
              <input
                className="input"
                value={rescueTokenAddr}
                onChange={(e) => setRescueTokenAddr(e.target.value.trim())}
                placeholder="0x token…"
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label className="label">To</label>
              <input
                className="input"
                value={rescueTo}
                onChange={(e) => setRescueTo(e.target.value.trim())}
                placeholder="0x recipient…"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="field" style={{ marginTop: "0.75rem", maxWidth: 280 }}>
            <label className="label">Amount ({tokenSymbol})</label>
            <input
              className="input"
              value={rescueAmount}
              onChange={(e) => setRescueAmount(e.target.value.trim())}
              placeholder="0.0"
            />
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            style={{ marginTop: "0.75rem" }}
            disabled={busy}
            onClick={() => void onRescueToken()}
          >
            Rescue Token
          </button>
        </div>
      </section>
      )}
      {tab === "admin" && !isOwner && (
        <section>
          <div className="card">
            <h2 className="card-title">Access Denied</h2>
            <p className="text-muted">
              Admin Panel is only available when the connected wallet is the contract owner.
            </p>
          </div>
        </section>
      )}
      </div>

      {toastNode}
    </AppShell>
  );
}
