"use client";

import Link from "next/link";
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
  // { id: "admin", label: "Admin" },
];

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
  const [matrixInfo, setMatrixInfo] = useState({
    active: false,
    parent: "",
    childrenCount: 0,
    downline: 0n,
    ctoRank: 0,
    children: ["", "", ""] as string[],
    childSeats: [] as MatrixSeatInfo[],
    grandchildren: [[], [], []] as MatrixSeatInfo[][],
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
    }[]
  >([]);
  const [ctoThresholds, setCtoThresholds] = useState<bigint[]>([]);

  // Secure fund
  const [sf, setSf] = useState({
    balance: 0n,
    cycle: 0,
    next: 0,
    deployed: 0,
  });

  // On-chain admin
  const [isOwner, setIsOwner] = useState(false);
  const [paused, setPaused] = useState(false);
  const [treasury, setTreasury] = useState("");
  const [newTreasury, setNewTreasury] = useState("");
  const [sfDistributeCycle, setSfDistributeCycle] = useState("");
  const [sfDistributeRecipients, setSfDistributeRecipients] = useState("");
  const [sfDistributeAmounts, setSfDistributeAmounts] = useState("");

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
      // "0xb573d4159956e798e8f8c228481de1cbab135f72",
      // "0x9ddb41afa46d87a2988b4e057f59a4234a62c0a6",
      "0xd1692deb1670d286376ccab9f0a3662d72106941",
    ]);
    if (saved && isAddress(saved) && !legacy.has(saved.toLowerCase())) {
      setContractAddr(saved);
      setContractInput(saved);
    } else if (saved && legacy.has(saved.toLowerCase())) {
      localStorage.setItem(STORAGE_KEY, DEFAULT_CONTRACT_ADDRESS);
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

      const [sym, onchainDec, users, pkgResults, thresholdResults, bal, cycle, next, deployed] =
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
        ]);

      setTokenSymbol(String(sym));
      setTokenDecimals(Number(onchainDec));
      setTotalUsers(Number(users));
      setPkgRows(
        pkgResults.map((p, idx) => {
          const id = idx + 1;
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
            };
          }
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
          };
        }),
      );
      setCtoThresholds(thresholdResults.map((t) => BigInt(t)));
      setSf({
        balance: BigInt(bal),
        cycle: Number(cycle),
        next: Number(next),
        deployed: Number(deployed),
      });
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

      const [u, pools, secureElig, bal, allow, owner, pausedVal, treasuryVal, matrixInfos] =
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
        ]);

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
  const loadDownline = useCallback(async () => {
    if (!account) {
      setDownlineMembers([]);
      return;
    }
    setDownlineLoading(true);
    try {
      const c = await getReadContract();
      const MAX_MEMBERS = 300;
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

      while (queue.length > 0 && members.length < MAX_MEMBERS) {
        const batch = queue.splice(0, Math.min(queue.length, 24));
        const childBatches = await Promise.all(
          batch.map(async ({ addr, level }) => {
            const childrenRaw: string[] = await c
              .getMatrixChildren(addr, downlinePkg)
              .catch(() => [ZeroAddress, ZeroAddress, ZeroAddress]);
            return { level, children: [0, 1, 2].map((i) => String(childrenRaw[i] || "")) };
          }),
        );

        const nextAddrs: { addr: string; level: number }[] = [];
        for (const { level, children } of childBatches) {
          for (const child of children) {
            if (!child || child === ZeroAddress || !isAddress(child)) continue;
            const key = child.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            nextAddrs.push({ addr: child, level: level + 1 });
          }
        }

        if (!nextAddrs.length) continue;

        const details = await Promise.all(
          nextAddrs.map(async ({ addr, level }) => {
            try {
              const [tu, info] = await Promise.all([c.users(addr), c.matrices(addr, downlinePkg)]);
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

        for (const row of details) {
          if (members.length >= MAX_MEMBERS) break;
          members.push(row);
          queue.push({ addr: row.address, level: row.level });
        }
      }

      setDownlineMembers(members);
    } catch (e) {
      console.error(e);
      setDownlineMembers([]);
    } finally {
      setDownlineLoading(false);
    }
  }, [account, downlinePkg, getReadContract]);

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
      const empty: MatrixTreeData = {
        root: rootAddr,
        parent: "",
        active: false,
        childrenCount: 0,
        downline: "0",
        ctoRank: 0,
        children: [
          { address: "", active: false, childCount: 0, downline: "0" },
          { address: "", active: false, childCount: 0, downline: "0" },
          { address: "", active: false, childCount: 0, downline: "0" },
        ],
        grandchildren: [[], [], []],
      };
      if (!rootAddr || !isAddress(rootAddr)) return empty;

      const c = await getReadContract();

      async function seatOf(addr: string): Promise<MatrixSeatInfo> {
        if (!addr || addr === ZeroAddress || !isAddress(addr)) {
          return { address: "", active: false, childCount: 0, downline: "0" };
        }
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
          c
            .getMatrixChildren(rootAddr, pkgId)
            .catch(() => [ZeroAddress, ZeroAddress, ZeroAddress] as string[]),
        ]);
        const childAddrs = [0, 1, 2].map((i) => String(childrenRaw[i] || ""));
        const childSeats = await Promise.all(childAddrs.map((a) => seatOf(a)));
        const grandchildren = await Promise.all(
          childAddrs.map(async (child) => {
            if (!child || child === ZeroAddress || !isAddress(child)) {
              return [
                { address: "", active: false, childCount: 0, downline: "0" },
                { address: "", active: false, childCount: 0, downline: "0" },
                { address: "", active: false, childCount: 0, downline: "0" },
              ];
            }
            const gcRaw: string[] = await c
              .getMatrixChildren(child, pkgId)
              .catch(() => [ZeroAddress, ZeroAddress, ZeroAddress]);
            return Promise.all([0, 1, 2].map((i) => seatOf(String(gcRaw[i] || ""))));
          }),
        );

        return {
          root: rootAddr,
          parent: String(info.parent ?? info[1] ?? ""),
          active: Boolean(info.active ?? info[0]),
          childrenCount: Number(info.childCount ?? info[2] ?? 0),
          downline: String(info.downlineCount ?? info[3] ?? 0),
          ctoRank: Number(info.rank ?? info[4] ?? 0),
          children: childSeats,
          grandchildren,
        };
      } catch {
        return empty;
      }
    },
    [getReadContract],
  );

  const loadMatrix = useCallback(async () => {
    if (!account) return;
    const root = matrixFocus && isAddress(matrixFocus) ? matrixFocus : account;
    setMatrixLoading(true);
    try {
      const tree = await fetchMatrixTreeData(root, matrixPkg);
      setMatrixInfo({
        active: tree.active,
        parent: tree.parent,
        childrenCount: tree.childrenCount,
        downline: BigInt(tree.downline || 0),
        ctoRank: tree.ctoRank,
        children: tree.children.map((s) => s.address),
        childSeats: tree.children,
        grandchildren: tree.grandchildren,
      });
      setMatrixFocus(root);
      setMatrixPath((prev) => {
        if (!prev.length) return [root];
        const idx = prev.findIndex((a) => a.toLowerCase() === root.toLowerCase());
        if (idx >= 0) return prev.slice(0, idx + 1);
        return prev;
      });
    } catch {
      setMatrixInfo({
        active: false,
        parent: "",
        childrenCount: 0,
        downline: 0n,
        ctoRank: 0,
        children: ["", "", ""],
        childSeats: [],
        grandchildren: [[], [], []],
      });
    } finally {
      setMatrixLoading(false);
    }
  }, [account, fetchMatrixTreeData, matrixFocus, matrixPkg]);

  const refreshSeq = useRef(0);
  const refreshAllRef = useRef<() => Promise<void>>(async () => {});

  const refreshAll = useCallback(async () => {
    const seq = ++refreshSeq.current;
    setBusy(true);
    try {
      // Critical path — unblock UI as soon as dashboard essentials are ready
      await Promise.all([loadStatic(), account ? loadUser() : Promise.resolve()]);
      if (seq !== refreshSeq.current) return;
      if (seq === refreshSeq.current) setBusy(false);

      if (account) {
        await Promise.all([loadIncome(), loadMatrix()]);
        if (seq !== refreshSeq.current) return;
        void loadDirects();
        void loadDownline();
      }
    } finally {
      if (seq === refreshSeq.current) setBusy(false);
    }
  }, [account, loadDirects, loadDownline, loadIncome, loadMatrix, loadStatic, loadUser]);

  refreshAllRef.current = refreshAll;

  const prevIncomeQuery = useRef({ filter: incomeFilter, page: historyPage });
  const prevMatrixQuery = useRef({ pkg: matrixPkg, focus: "" });
  const prevDownlinePkg = useRef(downlinePkg);

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
    if (prev.pkg === matrixPkg && prev.focus.toLowerCase() === matrixFocus.toLowerCase()) return;
    // Package switch → return to own seat for that package matrix
    if (prev.pkg !== matrixPkg && matrixFocus.toLowerCase() !== account.toLowerCase()) {
      prevMatrixQuery.current = { pkg: matrixPkg, focus: account };
      setMatrixFocus(account);
      setMatrixPath([account]);
      return;
    }
    prevMatrixQuery.current = { pkg: matrixPkg, focus: matrixFocus };
    void loadMatrix();
  }, [account, walletRestoring, matrixPkg, matrixFocus, loadMatrix]);

  useEffect(() => {
    if (!account || walletRestoring) return;
    if (prevDownlinePkg.current === downlinePkg) return;
    prevDownlinePkg.current = downlinePkg;
    void loadDownline();
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
    const allow: bigint = await token.allowance(address, contractAddr);
    if (allow >= amount) return;
    // Exact amount — avoids MetaMask "Unlimited spending cap / Review alert"
    showToast("MetaMask: Approve token spending (step 1/2)…");
    const tx = await token.approve(contractAddr, amount);
    await tx.wait();
    showToast("Approved — confirm Register in MetaMask (step 2/2)…");
  }

  async function runTx(label: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      showToast(`${label} successful`);
      await refreshAll();
      return true;
    } catch (e) {
      let msg = `${label} failed`;
      if (e && typeof e === "object") {
        const err = e as {
          code?: number | string;
          reason?: string;
          shortMessage?: string;
          message?: string;
          data?: string;
          error?: { message?: string; code?: number };
          info?: { error?: { code?: number; message?: string } };
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
          msg = "Transaction rejected in MetaMask";
        } else {
          const custom = msg.match(
            /\b(AlreadyRegistered|AlreadyOwnsPackage|InvalidSponsor|MustStartWithStarter|MustUpgradeSequentially|NotRegistered|NothingToWithdraw|SecureFundNotReady|EnforcedPause|InvalidPackage)\b/,
          );
          if (custom) {
            msg =
              custom[1] === "InvalidSponsor"
                ? "Invalid sponsor — sponsor must already be registered"
                : custom[1];
          }
        }
      }
      showToast(String(msg).slice(0, 180), "error");
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

      await ensureApprove(price);
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
    const cycle = Number(sfDistributeCycle);
    const recipients = sfDistributeRecipients
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const amounts = sfDistributeAmounts
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!cycle || recipients.length === 0 || recipients.length !== amounts.length) {
      showToast("Cycle + matching recipients/amounts required", "error");
      return;
    }
    if (!recipients.every((a) => isAddress(a))) {
      showToast("Invalid recipient address", "error");
      return;
    }
    await runTx("Distribute Secure Fund", async () => {
      const { contract } = await getSignerContract();
      const parsed = amounts.map((a) => parseUnits(a, tokenDecimals));
      const tx = await contract.distributeSecureFund(cycle, recipients, parsed);
      await tx.wait();
    });
  }

  function copyText(text: string) {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    showToast("Copied");
  }

  const nextUpgradeHint =
    !account
      ? "Connect wallet to see next upgrade."
      : !registered
        ? "Register & buy Starter first."
        : currentPackage >= 5
          ? "You are on Crown — highest package."
          : `Next: ${PACKAGE_NAMES[currentPackage + 1]} ($${PACKAGE_PRICES_USD[currentPackage + 1]})`;

  const historyPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE) || 1);
  const downlinePages = Math.max(1, Math.ceil(downlineMembers.length / PAGE_SIZE) || 1);
  const pagedDownline = downlineMembers.slice(
    downlinePage * PAGE_SIZE,
    downlinePage * PAGE_SIZE + PAGE_SIZE,
  );

  const navItems = TABS;

  const shellTitle = TABS.find((t) => t.id === tab)?.label || "Dashboard";

  function handleNavigate(id: string) {
    if (id === "register") {
      setTab("dashboard");
      return;
    }
    setTab(id as TabId);
  }

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
      contentClassName={tab === "matrix" ? "!max-w-7xl max-md:!max-w-none" : undefined}
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
        title={TABS.find((t) => t.id === tab)?.label || "Dashboard"}
        description="Packages · Matrix · Secure Fund · Team"
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

        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Package Progress</h2>
          <div className="pkg-progress">
            {[1, 2, 3, 4, 5].map((id) => (
              <span
                key={id}
                className={`pkg-chip${currentPackage > id ? " done" : ""}${currentPackage === id ? " current" : ""}`}
              >
                {PACKAGE_NAMES[id]}
              </span>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 className="card-title">Income by Pool</h2>
          <div className="grid-stats">
            {(
              [
                ["Direct", incomePools.direct],
                ["Matrix", incomePools.matrix],
                ["Global", incomePools.global],
                ["CTO", incomePools.cto],
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
              ["Direct", incomePools.direct],
              ["Matrix", incomePools.matrix],
              ["Global", incomePools.global],
              ["CTO", incomePools.cto],
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
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>From</th>
                  <th>Package</th>
                  <th>Meta</th>
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
                      <td>{shortAddr(r.from)}</td>
                      <td>{pkgName(r.packageId)}</td>
                      <td>{String(r.meta)}</td>
                      <td>{fmtTime(r.timestamp)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
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
          } satisfies MatrixTreeData}
          onPackageChange={setMatrixPkg}
          onFocus={focusMatrixNode}
          onGoHome={goMatrixHome}
          onGoUp={goMatrixUp}
          onPathJump={jumpMatrixPath}
          onRefresh={() => void loadMatrix()}
          onCopy={copyText}
          loadSubtree={(addr) => fetchMatrixTreeData(addr, matrixPkg)}
          onUpgrade={() => {
            setTab("packages");
          }}
        />

        <div className="card" style={{ marginTop: "1rem" }}>
          <h2 className="card-title">
            Package Matrices
            {currentPackage > 0 ? ` · Active: ${PACKAGE_NAMES[currentPackage]}` : ""}
          </h2>
          <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0 0 0.85rem" }}>
            Each owned package has its own 3× placement tree. Matrix income and Global Autopool both
            pay from the same tree for that package.
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
                    onClick={() => owned && setMatrixPkg(m.pkg)}
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
            CTO thresholds:{" "}
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
            <div className="stat-label !text-left">Direct Referrals</div>
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
                String(allMatrix.find((m) => m.pkg === downlinePkg)?.downline ?? downlineMembers.length)
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "0.75rem",
            }}
          >
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>
                Downline List
              </h2>
              <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0.25rem 0 0" }}>
                {downlineLoading
                  ? "Loading matrix downline…"
                  : `${downlineMembers.length} member${downlineMembers.length === 1 ? "" : "s"} in ${PACKAGE_NAMES[downlinePkg] || "package"} matrix`}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
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
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
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
                      <td>{d.active ? "Active" : "Inactive"}</td>
                      <td>{d.childCount}/3</td>
                      <td>{d.downline}</td>
                      <td>{fmtUsd(d.invested, tokenDecimals)}</td>
                      <td>{fmtUsd(d.earned, tokenDecimals)}</td>
                      <td>{fmtTime(d.joinedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {downlineMembers.length > 0 && (
            <div className="mt-3 flex items-center gap-3">
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
          <h2 className="card-title">Direct Team Members</h2>
          <p className="text-muted" style={{ fontSize: "0.82rem", margin: "0 0 0.5rem" }}>
            People who registered with your referral link ({directs.length})
          </p>
          {(directsLoading || userLoading || busy) && <div className="loading-bar mb-3" />}
          <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
            <table className="data-table">
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
                      <td>{shortAddr(d.address)}</td>
                      <td>{pkgName(d.packageId)}</td>
                      <td>{fmtUsd(d.invested, tokenDecimals)}</td>
                      <td>{fmtUsd(d.earned, tokenDecimals)}</td>
                      <td>{fmtTime(d.joinedAt)}</td>
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
          </p>
          {(staticLoading || userLoading) && <div className="loading-bar mb-3" />}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!account || busy || currentPackage >= 5 || staticLoading}
              onClick={() => void onUpgrade()}
            >
              Upgrade Package
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
                  Direct {fmtUsd(p.directBonus, tokenDecimals)} · Secure {fmtUsd(p.secureFund, tokenDecimals)}
                  <br />
                  Matrix {fmtUsd(p.matrixPool, tokenDecimals)} · CTO {fmtUsd(p.ctoPool, tokenDecimals)} · Global{" "}
                  {fmtUsd(p.globalPool, tokenDecimals)}
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
                  <th>Direct</th>
                  <th>Secure</th>
                  <th>Matrix</th>
                  <th>CTO</th>
                  <th>Global</th>
                </tr>
              </thead>
              <tbody>
                {pkgRows.map((p) => (
                  <tr key={p.id}>
                    <td>{PACKAGE_NAMES[p.id]}</td>
                    <td>{fmtUsd(p.price, tokenDecimals)}</td>
                    <td>{fmtUsd(p.directBonus, tokenDecimals)}</td>
                    <td>{fmtUsd(p.secureFund, tokenDecimals)}</td>
                    <td>{fmtUsd(p.matrixPool, tokenDecimals)}</td>
                    <td>{fmtUsd(p.ctoPool, tokenDecimals)}</td>
                    <td>{fmtUsd(p.globalPool, tokenDecimals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">Per-Level Income (Matrix / Global)</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Matrix / level</th>
                  <th>Global / level</th>
                  <th>Levels</th>
                </tr>
              </thead>
              <tbody>
                {pkgRows.map((p) => (
                  <tr key={p.id}>
                    <td>{PACKAGE_NAMES[p.id]}</td>
                    <td>{fmtUsd(p.matrixPerLevel, tokenDecimals)}</td>
                    <td>{fmtUsd(p.globalPerLevel, tokenDecimals)}</td>
                    <td>10</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: "0.82rem", marginTop: "0.85rem" }}>
            3-wide × 10-depth auto-fill matrix. Each upline level earns matrix + global.
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
                <div className="stat-label !text-left">Last Cycle</div>
                <div className="stat-value !text-left">{fmtTime(sf.cycle)}</div>
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
            </p>
            <div className="stat-label !text-left">Your Secure Income</div>
            <div className="stat-value !text-left">{fmtUsd(incomePools.secure, tokenDecimals)}</div>
            <p className="text-muted" style={{ fontSize: "0.82rem", marginTop: "1rem" }}>
              Silver+ packages contribute to Secure Fund. Eligible users are paid yearly when income &lt; invested.
            </p>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">How Secure Fund Works</h2>
          <ol className="text-muted" style={{ fontSize: "0.9rem", lineHeight: 1.7, margin: 0, paddingLeft: "1.2rem" }}>
            <li>Starter has no Secure Fund cut — starts from Silver.</li>
            <li>Pool accumulates in the contract.</li>
            <li>After 1 year the owner finalizes a cycle.</li>
            <li>Eligible users are paid in batches — shown in income history.</li>
          </ol>
        </div>
      </section>
      )}

      {/* On-chain Admin */}
      {tab === "admin" && (
      <section>
        {isOwner ? (
          <div className="card">
            <h2 className="card-title">Owner Admin</h2>
            <p>
              Status:{" "}
              <span className={`badge${paused ? " badge-danger" : " badge-success"}`}>{paused ? "Paused" : "Live"}</span> · Treasury:{" "}
              <code>{shortAddr(treasury, 6)}</code>
            </p>
            <div className="mt-4 flex flex-wrap gap-2" style={{ marginTop: "1rem" }}>
              {paused ? (
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void onPause(false)}>
                  Unpause
                </button>
              ) : (
                <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void onPause(true)}>
                  Pause Contract
                </button>
              )}
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onFinalizeSf()}>
                Finalize Secure Fund Cycle
              </button>
            </div>
            <div className="field" style={{ marginTop: "1rem", maxWidth: 400 }}>
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

            <h2 className="card-title" style={{ marginTop: "1.5rem" }}>Distribute Secure Fund</h2>
            <p className="text-muted" style={{ fontSize: "0.82rem" }}>
              Current cycle: {sf.cycle}. Recipients & amounts must match length (comma or newline separated).
            </p>
            <div className="field" style={{ marginTop: "0.75rem", maxWidth: 400 }}>
              <label className="label">Cycle</label>
              <input
                className="input"
                value={sfDistributeCycle || String(sf.cycle)}
                onChange={(e) => setSfDistributeCycle(e.target.value.trim())}
              />
            </div>
            <div className="field" style={{ marginTop: "0.75rem" }}>
              <label className="label">Recipients (addresses)</label>
              <textarea
                className="input"
                rows={3}
                value={sfDistributeRecipients}
                onChange={(e) => setSfDistributeRecipients(e.target.value)}
                placeholder="0xabc…, 0xdef…"
                style={{ resize: "vertical", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div className="field" style={{ marginTop: "0.75rem" }}>
              <label className="label">Amounts (token units or wei)</label>
              <textarea
                className="input"
                rows={3}
                value={sfDistributeAmounts}
                onChange={(e) => setSfDistributeAmounts(e.target.value)}
                placeholder="10.5, 20"
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
        ) : (
          <div className="card">
            <p className="text-muted">On-chain admin tools appear only for the contract owner wallet.</p>
            <p className="text-muted" style={{ fontSize: "0.85rem" }}>
              For the web Admin User Panel (login + user management), open{" "}
              <Link href="/admin/login">/admin/login</Link>.
            </p>
          </div>
        )}
      </section>
      )}
      </div>

      {toastNode}
    </AppShell>
  );
}
