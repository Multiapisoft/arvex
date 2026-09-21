"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  isAddress,
  parseUnits,
} from "ethers";
import {
  GitBranch,
  History,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import {
  APP_NAME_FULL,
  BSC_CHAIN_ID,
  BSC_RPC,
  DEFAULT_CONTRACT_ADDRESS,
  DEFAULT_PAYMENT_TOKEN,
  ERC20_ABI,
  EXPLORER_BASE,
  JOIN_USD,
  LEVEL_IDS,
  LEVEL_INCOME_USD,
  ADMIN_PULLER_ABI,
  MULTICORE_ABI,
  PAYMENT_TOKEN_SYMBOL,
  REQUIRED_DIRECTS,
  ROOT_REFERRER,
  ROYALTY_DIRECTS,
  ensureBscMainnet,
  lowGasOverrides,
} from "@/lib/contract";
import { explorerAddress, fmtTime, fmtToken, fmtUsd, incomeKind, shortAddr } from "@/lib/format";
import { AppShell, PageHeader, StatTile } from "@/components/layout/AppShell";
import type { MobileNavItem } from "@/components/layout/MobileNav";
import { WalletAuthScreen } from "@/components/WalletAuthScreen";
import { MatrixBoard, type MatrixChild, type MatrixOverviewData } from "@/components/MatrixBoard";
import { RoyaltyPool, type RoyaltyMemberRow } from "@/components/RoyaltyPool";

type TabId = "dashboard" | "withdraw" | "income" | "matrix" | "royalty" | "team" | "virtuals" | "admin";

type IncomeRow = {
  kind: number;
  level: number;
  fromPosition: bigint;
  fromUser: string;
  toPosition: bigint;
  mainId: bigint;
  amount: bigint;
  timestamp: number;
};

type PositionRow = {
  id: bigint;
  owner: string;
  isVirtual: boolean;
  mainId: bigint;
  sourcePosition: bigint;
  sourceLevel: number;
  createdAt: number;
};

type DirectRow = {
  address: string;
  joined: boolean;
  directCount: number;
  positionId: bigint;
  withdrawn: bigint;
};

type ToastState = { message: string; type: "success" | "error" } | null;

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "withdraw", label: "Withdrawal", icon: Wallet },
  { id: "income", label: "Income History", icon: History },
  { id: "matrix", label: "Global Matrix", icon: GitBranch },
  { id: "royalty", label: "Royalty Pool", icon: Trophy },
  { id: "team", label: "My Directs", icon: Users },
  { id: "virtuals", label: "Virtual IDs", icon: Sparkles },
];

const ADMIN_TAB: { id: TabId; label: string; icon: typeof LayoutDashboard } = {
  id: "admin",
  label: "Admin",
  icon: ShieldCheck,
};

const PRIMARY_NAV: MobileNavItem[] = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "matrix", label: "Matrix", icon: GitBranch },
  { id: "withdraw", label: "Withdraw", icon: Wallet },
  { id: "team", label: "Directs", icon: Users },
];

const WALLET_FLAG_KEY = "mc_wallet_connected";
const WALLET_ADDR_KEY = "mc_wallet_address";
const PAGE_SIZE = 10;
const MATRIX_PAGE = 64;
const ROYALTY_PAGE = 64;
const EMPTY_KIDS: MatrixChild[] = [
  { id: 0n, owner: "", isVirtual: false },
  { id: 0n, owner: "", isVirtual: false },
  { id: 0n, owner: "", isVirtual: false },
  { id: 0n, owner: "", isVirtual: false },
];

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function asBig(v: unknown): bigint {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.trunc(v));
    if (typeof v === "boolean") return v ? 1n : 0n;
    if (typeof v === "string" && v !== "") return BigInt(v);
    if (v == null) return 0n;
    return BigInt(String(v));
  } catch {
    return 0n;
  }
}

function asNumArr(raw: unknown, n = 6): number[] {
  const list = raw as { length?: number; [i: number]: unknown } | null;
  return Array.from({ length: n }, (_, i) => Number(list?.[i] ?? 0));
}

function asBigArr(raw: unknown, n = 6): bigint[] {
  const list = raw as { length?: number; [i: number]: unknown } | null;
  return Array.from({ length: n }, (_, i) => asBig(list?.[i]));
}

function asBoolArr(raw: unknown, n = 6): boolean[] {
  const list = raw as { length?: number; [i: number]: unknown } | null;
  return Array.from({ length: n }, (_, i) => Boolean(list?.[i]));
}

function parseKids(raw: unknown): MatrixChild[] {
  const row = raw as Record<string, unknown> & { [i: number]: unknown };
  const ids = (row.ids ?? row[0] ?? []) as unknown[];
  const owners = (row.owners ?? row[1] ?? []) as unknown[];
  const virt = (row.isVirtual ?? row[2] ?? []) as unknown[];
  return [0, 1, 2, 3].map((i) => ({
    id: asBig(ids[i]),
    owner: String(owners[i] ?? ""),
    isVirtual: Boolean(virt[i]),
  }));
}

function emptyKids(): MatrixChild[] {
  return EMPTY_KIDS.map((k) => ({ ...k }));
}

function parsePosition(id: unknown, info: unknown): PositionRow {
  const row = info as Record<string, unknown> & { [i: number]: unknown };
  return {
    id: asBig(id),
    owner: String(row.owner ?? row[0] ?? ""),
    isVirtual: Boolean(row.isVirtual ?? row[1]),
    mainId: asBig(row.mainId ?? row[2]),
    sourcePosition: asBig(row.sourcePosition ?? row[3]),
    sourceLevel: Number(row.sourceLevel ?? row[4] ?? 0),
    createdAt: Number(row.createdAt ?? row[5] ?? 0),
  };
}

function DataLoading({ label = "Loading data…" }: { label?: string }) {
  return (
    <div className="data-loading">
      <Loader2 className="h-5 w-5 animate-spin text-solar-400" />
      <p>{label}</p>
    </div>
  );
}

function getEthereum() {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

function clearRefFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ref")) return;
  url.searchParams.delete("ref");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

export default function MultiCoreApp() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [toast, setToast] = useState<ToastState>(null);
  const [account, setAccount] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [walletRestoring, setWalletRestoring] = useState(true);
  const [cachedWalletLabel, setCachedWalletLabel] = useState("…");
  const [contractAddr] = useState(DEFAULT_CONTRACT_ADDRESS);
  const [busy, setBusy] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [tokenSymbol, setTokenSymbol] = useState(PAYMENT_TOKEN_SYMBOL);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [paymentToken, setPaymentToken] = useState(DEFAULT_PAYMENT_TOKEN);
  const [joinAmount, setJoinAmount] = useState(0n);

  const [registered, setRegistered] = useState(false);
  const [userChecked, setUserChecked] = useState(false);
  const routedAfterConnect = useRef(false);
  const [sponsor, setSponsor] = useState("");
  const [directCount, setDirectCount] = useState(0);
  const [positionCount, setPositionCount] = useState(0);
  const [virtualCount, setVirtualCount] = useState(0);
  const [inRoyalty, setInRoyalty] = useState(false);
  const [earnedRoyalty, setEarnedRoyalty] = useState(0n);
  const [earnedMatrix, setEarnedMatrix] = useState<bigint[]>(Array(6).fill(0n));
  const [earnedAdmin, setEarnedAdmin] = useState(0n);
  const [earnedSpill, setEarnedSpill] = useState(0n);
  const [withdrawn, setWithdrawn] = useState(0n);
  const [claimable, setClaimable] = useState(0n);
  const [pendingAmount, setPendingAmount] = useState(0n);
  const [pendingPerLevel, setPendingPerLevel] = useState<bigint[]>(Array(6).fill(0n));
  const [heldPerLevel, setHeldPerLevel] = useState<bigint[]>(Array(6).fill(0n));
  const [primaryPosition, setPrimaryPosition] = useState(0n);
  const [matrixFilled, setMatrixFilled] = useState<number[]>(Array(6).fill(0));
  const [matrixCompleted, setMatrixCompleted] = useState<boolean[]>(Array(6).fill(false));
  const [balance, setBalance] = useState(0n);
  const [allowance, setAllowance] = useState(0n);

  const [sponsorInput, setSponsorInput] = useState(ROOT_REFERRER);
  const refSponsor = useRef("");

  const [incomeFilter, setIncomeFilter] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyRows, setHistoryRows] = useState<IncomeRow[]>([]);

  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [virtuals, setVirtuals] = useState<PositionRow[]>([]);
  const [directs, setDirects] = useState<DirectRow[]>([]);
  const [directsLoading, setDirectsLoading] = useState(false);
  const [virtualsLoading, setVirtualsLoading] = useState(false);

  const [matrixFocus, setMatrixFocus] = useState(0n);
  const [matrixPath, setMatrixPath] = useState<bigint[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixViewLevel, setMatrixViewLevel] = useState(1);
  const [matrixOverview, setMatrixOverview] = useState<MatrixOverviewData | null>(null);
  const [matrixSlots, setMatrixSlots] = useState<MatrixChild[]>([]);
  const [matrixGrandchildren, setMatrixGrandchildren] = useState<MatrixChild[][]>([[], [], [], []]);
  const [matrixLevelUsers, setMatrixLevelUsers] = useState<MatrixChild[]>([]);
  const [matrixLevelFilled, setMatrixLevelFilled] = useState(0);
  const [matrixLevelCapacity, setMatrixLevelCapacity] = useState(0);
  const [matrixLevelOffset, setMatrixLevelOffset] = useState(0);
  const [matrixOwner, setMatrixOwner] = useState("");
  const [matrixIsVirtual, setMatrixIsVirtual] = useState(false);
  const [matrixMainId, setMatrixMainId] = useState(0n);

  const [royaltyRows, setRoyaltyRows] = useState<RoyaltyMemberRow[]>([]);
  const [royaltyLoading, setRoyaltyLoading] = useState(false);

  const [totalPositions, setTotalPositions] = useState(0);
  const [paidIds, setPaidIds] = useState(0);
  const [globalVirtuals, setGlobalVirtuals] = useState(0);
  const [royaltyPool, setRoyaltyPool] = useState(0n);
  const [royaltyMembers, setRoyaltyMembers] = useState(0);
  const [virtualQueue, setVirtualQueue] = useState(0);
  const [reserved, setReserved] = useState(0n);
  const [royaltyEpoch, setRoyaltyEpoch] = useState(0n);

  const [isOwner, setIsOwner] = useState(false);
  const [paused, setPaused] = useState(false);
  const [treasury, setTreasury] = useState("");
  const [newTreasury, setNewTreasury] = useState("");
  const [blockAddr, setBlockAddr] = useState("");
  const [royaltyBatch, setRoyaltyBatch] = useState("32");
  const [virtualBatch, setVirtualBatch] = useState("8");
  const [recoverToken, setRecoverToken] = useState("");
  const [recoverTo, setRecoverTo] = useState("");
  const [recoverAmt, setRecoverAmt] = useState("");
  const [adminPuller, setAdminPuller] = useState("");
  const [pullerReceiver, setPullerReceiver] = useState("");
  const [totalPullable, setTotalPullable] = useState(0n);
  const [pullAmount, setPullAmount] = useState("");

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
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate from ?ref= */
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && isAddress(ref)) {
      refSponsor.current = ref;
      setSponsorInput(ref);
    } else {
      setSponsorInput(ROOT_REFERRER);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreWallet() {
      const eth = getEthereum();
      const wantRestore = localStorage.getItem(WALLET_FLAG_KEY) === "1";
      const cached = localStorage.getItem(WALLET_ADDR_KEY) || "";
      if (cached && isAddress(cached)) setCachedWalletLabel(shortAddr(cached, 6));

      if (!eth) {
        if (!cancelled) {
          setWalletRestoring(false);
          setHydrated(true);
        }
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
        /* ignore */
      } finally {
        if (!cancelled) {
          setWalletRestoring(false);
          setHydrated(true);
        }
      }
    }

    void restoreWallet();

    const eth = getEthereum();
    if (!eth?.on) {
      return () => {
        cancelled = true;
      };
    }

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
    if (!readProviderRef.current) {
      readProviderRef.current = new JsonRpcProvider(BSC_RPC, BSC_CHAIN_ID, { staticNetwork: true });
    }
    return readProviderRef.current;
  }, []);

  const getSignerContract = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) throw new Error("MetaMask / Web3 wallet not found");
    await ensureBscMainnet(eth);
    const provider = new BrowserProvider(eth);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== BSC_CHAIN_ID) {
      throw new Error("Please switch to BNB Smart Chain Testnet (chainId 97)");
    }
    const signer = await provider.getSigner();
    if (!isAddress(contractAddr) || contractAddr === ZeroAddress) {
      throw new Error("Set a valid Multi Core contract address first");
    }
    return {
      provider,
      signer,
      contract: new Contract(contractAddr, MULTICORE_ABI, signer),
      address: await signer.getAddress(),
    };
  }, [contractAddr]);

  const getReadContract = useCallback(async () => {
    if (!isAddress(contractAddr) || contractAddr === ZeroAddress) {
      throw new Error("Invalid contract address");
    }
    return new Contract(contractAddr, MULTICORE_ABI, getReadProvider());
  }, [contractAddr, getReadProvider]);

  const loadStatic = useCallback(async () => {
    if (!isAddress(contractAddr) || contractAddr === ZeroAddress) return;
    try {
      const c = await getReadContract();
      const provider = getReadProvider();
      const tokenAddr: string = (await c.paymentToken().catch(() => DEFAULT_PAYMENT_TOKEN)) || DEFAULT_PAYMENT_TOKEN;
      setPaymentToken(tokenAddr);
      const token = new Contract(tokenAddr, ERC20_ABI, provider);
      const [
        sym,
        dec,
        join,
        positionsN,
        paid,
        virt,
        pool,
        members,
        queue,
        reservedAmt,
        epoch,
        pausedVal,
        ownerAddr,
        treasuryAddr,
        pullerAddr,
      ] = await Promise.all([
        token.symbol().catch(() => PAYMENT_TOKEN_SYMBOL),
        token.decimals().catch(() => 18),
        c.joinAmount().catch(() => 0n),
        c.totalPositions().catch(() => 0n),
        c.paidIds().catch(() => 0n),
        c.virtualIdCount().catch(() => 0n),
        c.royaltyPool().catch(() => 0n),
        c.royaltyMemberCount().catch(() => 0n),
        c.virtualQueueLength().catch(() => 0n),
        c.reservedFunds().catch(() => 0n),
        c.currentRoyaltyEpoch().catch(() => 0n),
        c.paused().catch(() => false),
        c.owner().catch(() => ZeroAddress),
        c.treasury().catch(() => ""),
        c.adminPuller().catch(() => ZeroAddress),
      ]);
      setTokenSymbol(String(sym));
      setTokenDecimals(Number(dec));
      setJoinAmount(asBig(join));
      setTotalPositions(Number(positionsN));
      setPaidIds(Number(paid));
      setGlobalVirtuals(Number(virt));
      setRoyaltyPool(asBig(pool));
      setRoyaltyMembers(Number(members));
      setVirtualQueue(Number(queue));
      setReserved(asBig(reservedAmt));
      setRoyaltyEpoch(asBig(epoch));
      setPaused(Boolean(pausedVal));
      setTreasury(String(treasuryAddr || ""));
      const puller = String(pullerAddr || "");
      setAdminPuller(isAddress(puller) && puller !== ZeroAddress ? puller : "");
      try {
        const coreBal = await token.balanceOf(contractAddr).catch(() => 0n);
        setTotalPullable(asBig(coreBal));
      } catch {
        setTotalPullable(0n);
      }
      if (isAddress(puller) && puller !== ZeroAddress) {
        try {
          const p = new Contract(puller, ADMIN_PULLER_ABI, provider);
          const recv = await p.receiver().catch(() => "");
          setPullerReceiver(String(recv || ""));
        } catch {
          setPullerReceiver("");
        }
      } else {
        setPullerReceiver("");
      }
      if (account) {
        setIsOwner(String(ownerAddr).toLowerCase() === account.toLowerCase());
      }
    } catch {
      /* contract not set yet */
    }
  }, [account, contractAddr, getReadContract, getReadProvider]);

  const loadUser = useCallback(async () => {
    if (!account) {
      setUserChecked(false);
      setRegistered(false);
      setUserLoading(false);
      setEarnedAdmin(0n);
      setEarnedSpill(0n);
      return;
    }
    if (!isAddress(contractAddr) || contractAddr === ZeroAddress) {
      setUserChecked(true);
      setRegistered(false);
      return;
    }
    setUserLoading(true);
    try {
      const c = await getReadContract();
      const provider = getReadProvider();
      const tokenAddr = paymentToken || DEFAULT_PAYMENT_TOKEN;
      const token = new Contract(tokenAddr, ERC20_ABI, provider);

      const [wallet, bal, allow, ownerAddr, pausedVal, treasuryVal] = await Promise.all([
        c.walletOf(account),
        token.balanceOf(account).catch(() => 0n),
        token.allowance(account, contractAddr).catch(() => 0n),
        c.owner().catch(() => ZeroAddress),
        c.paused().catch(() => false),
        c.treasury().catch(() => ""),
      ]);

      const member = wallet.member ?? wallet[0];
      const joined = Boolean(member.joined ?? member[4]);
      setRegistered(joined);
      setUserChecked(true);
      if (joined) clearRefFromUrl();
      if (!routedAfterConnect.current) {
        routedAfterConnect.current = true;
        setTab("dashboard");
      }

      setSponsor(String(member.referrer ?? member[0] ?? ""));
      setDirectCount(Number(member.directCount ?? member[1] ?? 0));
      setPositionCount(Number(member.positionCount ?? member[2] ?? 0));
      setVirtualCount(Number(member.virtualCount ?? member[3] ?? 0));
      setInRoyalty(Boolean(member.inRoyaltyPool ?? member[5]));
      setEarnedRoyalty(asBig(member.earnedRoyalty ?? member[7]));
      setWithdrawn(asBig(member.withdrawn ?? member[8]));
      setEarnedMatrix(asBigArr(member.earnedMatrix ?? member[9]));
      setClaimable(asBig(wallet.claimableAmount ?? wallet[1]));
      setPendingAmount(asBig(wallet.pendingAmount ?? wallet[2]));
      setPendingPerLevel(asBigArr(wallet.pendingPerLevel ?? wallet[3]));
      const primary = asBig(wallet.primaryPosition ?? wallet[4]);
      setPrimaryPosition(primary);
      setMatrixFilled(asNumArr(wallet.matrixFilled ?? wallet[5]));
      setMatrixCompleted(asBoolArr(wallet.matrixCompleted ?? wallet[6]));
      setHeldPerLevel(asBigArr(wallet.matrixHeldAmounts ?? wallet[7]));
      setBalance(asBig(bal));
      setAllowance(asBig(allow));
      setIsOwner(String(ownerAddr).toLowerCase() === account.toLowerCase());
      setPaused(Boolean(pausedVal));
      setTreasury(String(treasuryVal || ""));

      if (primary > 0n && matrixFocus === 0n) {
        setMatrixFocus(primary);
        setMatrixPath([primary]);
      }
    } catch (e) {
      console.error(e);
      setUserChecked(true);
      if (!routedAfterConnect.current) routedAfterConnect.current = true;
    } finally {
      setUserLoading(false);
    }
  }, [account, contractAddr, getReadContract, getReadProvider, matrixFocus, paymentToken]);

  const loadIncome = useCallback(async () => {
    if (!account || !isAddress(contractAddr) || contractAddr === ZeroAddress) return;
    setIncomeLoading(true);
    try {
      const c = await getReadContract();
      const totalLen = Number(await c.incomeCount(account).catch(() => 0n));
      // Pull full ledger for accurate Admin/Spill totals (creator wallet can be large).
      const fetchLimit = Math.min(256, Math.max(0, totalLen));
      const raw = fetchLimit > 0 ? await c.incomeOf(account, 0, fetchLimit).catch(() => []) : [];
      let all: IncomeRow[] = (raw as unknown[]).map((r) => {
        const row = r as Record<string, unknown> & { [i: number]: unknown };
        return {
          kind: Number(row.kind ?? row[0] ?? 0),
          level: Number(row.level ?? row[1] ?? 0),
          fromPosition: asBig(row.fromPosition ?? row[2]),
          fromUser: String(row.fromUser ?? row[3] ?? ""),
          toPosition: asBig(row.toPosition ?? row[4]),
          mainId: asBig(row.mainId ?? row[5]),
          amount: asBig(row.amount ?? row[6]),
          timestamp: Number(row.timestamp ?? row[7] ?? 0),
        };
      });
      let adminSum = 0n;
      let spillSum = 0n;
      for (const row of all) {
        if (row.kind === 7) adminSum += row.amount;
        else if (row.kind === 6) spillSum += row.amount;
      }
      setEarnedAdmin(adminSum);
      setEarnedSpill(spillSum);
      all = all.reverse();
      const filtered = incomeFilter > 0 ? all.filter((r) => r.kind === incomeFilter) : all;
      setHistoryTotal(filtered.length);
      const offset = historyPage * PAGE_SIZE;
      setHistoryRows(filtered.slice(offset, offset + PAGE_SIZE));
    } catch (e) {
      console.error(e);
      setHistoryRows([]);
      setHistoryTotal(0);
      setEarnedAdmin(0n);
      setEarnedSpill(0n);
    } finally {
      setIncomeLoading(false);
    }
  }, [account, contractAddr, getReadContract, historyPage, incomeFilter]);

  const loadDirects = useCallback(async () => {
    if (!account || !isAddress(contractAddr) || contractAddr === ZeroAddress) {
      setDirects([]);
      return;
    }
    setDirectsLoading(true);
    try {
      const c = await getReadContract();
      const wallets: string[] = await c.directsOf(account, 0, 64).catch(() => []);
      const rows = await Promise.all(
        wallets.filter((a) => a && isAddress(a)).map(async (addr) => {
          try {
            const w = await c.walletOf(addr);
            const member = w.member ?? w[0];
            return {
              address: addr,
              joined: Boolean(member.joined ?? member[4]),
              directCount: Number(member.directCount ?? member[1] ?? 0),
              positionId: asBig(w.primaryPosition ?? w[4]),
              withdrawn: asBig(member.withdrawn ?? member[8]),
            } satisfies DirectRow;
          } catch {
            return {
              address: addr,
              joined: true,
              directCount: 0,
              positionId: 0n,
              withdrawn: 0n,
            };
          }
        }),
      );
      setDirects(rows);
    } catch (e) {
      console.error(e);
      setDirects([]);
    } finally {
      setDirectsLoading(false);
    }
  }, [account, contractAddr, getReadContract]);

  const loadPositions = useCallback(async () => {
    if (!account || !isAddress(contractAddr) || contractAddr === ZeroAddress) {
      setPositions([]);
      setVirtuals([]);
      return;
    }
    setVirtualsLoading(true);
    try {
      const c = await getReadContract();
      const raw = await c.positionsOf(account, 0, 64).catch(() => null);
      const ids = (raw?.ids ?? raw?.[0] ?? []) as unknown[];
      const info = (raw?.info ?? raw?.[1] ?? []) as unknown[];
      const rows = ids.map((id, i) => parsePosition(id, info[i]));
      setPositions(rows);
      const main = rows.find((r) => !r.isVirtual) ?? rows[0];
      if (main) {
        const vraw = await c.virtualsOf(main.id, 0, 64).catch(() => null);
        const vids = (vraw?.ids ?? vraw?.[0] ?? []) as unknown[];
        const vinfo = (vraw?.info ?? vraw?.[1] ?? []) as unknown[];
        setVirtuals(vids.map((id, i) => parsePosition(id, vinfo[i])));
      } else {
        setVirtuals([]);
      }
    } catch (e) {
      console.error(e);
      setPositions([]);
      setVirtuals([]);
    } finally {
      setVirtualsLoading(false);
    }
  }, [account, contractAddr, getReadContract]);

  const loadMatrix = useCallback(
    async (id?: bigint, level?: number, offset?: number) => {
      const focus = id && id > 0n ? id : matrixFocus;
      const lvl = level && level >= 1 && level <= 6 ? level : matrixViewLevel;
      const off = offset !== undefined ? Math.max(0, offset) : matrixLevelOffset;
      if (!focus || focus === 0n || !isAddress(contractAddr) || contractAddr === ZeroAddress) {
        setMatrixOverview(null);
        setMatrixSlots(emptyKids());
        setMatrixGrandchildren([emptyKids(), emptyKids(), emptyKids(), emptyKids()]);
        setMatrixLevelUsers([]);
        setMatrixLevelFilled(0);
        setMatrixLevelCapacity(0);
        return;
      }
      setMatrixLoading(true);
      if (offset !== undefined) setMatrixLevelOffset(off);
      try {
        const c = await getReadContract();
        const [overview, levelData, pos, kidsRaw] = await Promise.all([
          c.matrixOverview(focus),
          c.matrixLevel(focus, lvl, off, MATRIX_PAGE),
          c.positions(focus),
          c.childrenOf(focus).catch(() => null),
        ]);
        setMatrixOverview({
          filled: asNumArr(overview.filled ?? overview[0]),
          capacity: asNumArr(overview.capacity ?? overview[1]),
          completed: asBoolArr(overview.completed ?? overview[2]),
          earned: asBigArr(overview.earned ?? overview[3]),
          pending: asBigArr(overview.pending ?? overview[4]),
          qualified: asBoolArr(overview.qualified ?? overview[6]),
          held: asBigArr(overview.held ?? overview[8]),
        });
        const kids = kidsRaw ? parseKids(kidsRaw) : emptyKids();
        setMatrixSlots(kids);
        const grands = await Promise.all(
          kids.map(async (kid) => {
            if (!kid.id || kid.id === 0n || !kid.owner || kid.owner === ZeroAddress) return emptyKids();
            try {
              return parseKids(await c.childrenOf(kid.id));
            } catch {
              return emptyKids();
            }
          }),
        );
        setMatrixGrandchildren(grands);
        const ids = (levelData.ids ?? levelData[2] ?? []) as unknown[];
        const owners = (levelData.owners ?? levelData[3] ?? []) as unknown[];
        const virt = (levelData.isVirtual ?? levelData[4] ?? []) as unknown[];
        setMatrixLevelFilled(Number(levelData.filled ?? levelData[0] ?? 0));
        setMatrixLevelCapacity(Number(levelData.capacity ?? levelData[1] ?? 0));
        setMatrixLevelUsers(
          ids.map((slotId, i) => ({
            id: asBig(slotId),
            owner: String(owners?.[i] ?? ""),
            isVirtual: Boolean(virt?.[i]),
          })),
        );
        const info = pos as Record<string, unknown> & { [i: number]: unknown };
        setMatrixOwner(String(info.owner ?? info[0] ?? ""));
        setMatrixIsVirtual(Boolean(info.isVirtual ?? info[1]));
        setMatrixMainId(asBig(info.mainId ?? info[2]));
      } catch (e) {
        console.error(e);
        setMatrixOverview(null);
        setMatrixSlots(emptyKids());
        setMatrixGrandchildren([emptyKids(), emptyKids(), emptyKids(), emptyKids()]);
        setMatrixLevelUsers([]);
      } finally {
        setMatrixLoading(false);
      }
    },
    [contractAddr, getReadContract, matrixFocus, matrixLevelOffset, matrixViewLevel],
  );

  const loadRoyaltyMembers = useCallback(async () => {
    if (!isAddress(contractAddr) || contractAddr === ZeroAddress) {
      setRoyaltyRows([]);
      return;
    }
    setRoyaltyLoading(true);
    try {
      const c = await getReadContract();
      const count = Number(await c.royaltyMemberCount().catch(() => 0n));
      setRoyaltyMembers(count);
      const pool = await c.royaltyPool().catch(() => 0n);
      setRoyaltyPool(asBig(pool));
      const wallets: string[] = [];
      for (let off = 0; off < count; off += ROYALTY_PAGE) {
        const page = await c.royaltyMembersOf(off, ROYALTY_PAGE);
        wallets.push(...(Array.from(page as Iterable<string>) as string[]));
      }
      const rows = await Promise.all(
        wallets.map(async (addr) => {
          const [wallet, blocked] = await Promise.all([
            c.walletOf(addr),
            c.royaltyBlocked(addr).catch(() => false),
          ]);
          const member = wallet.member ?? wallet[0];
          return {
            address: addr,
            directs: Number(member.directCount ?? member[1] ?? 0),
            inPool: Boolean(member.inRoyaltyPool ?? member[5]),
            blocked: Boolean(blocked),
            mainId: asBig(wallet.primaryPosition ?? wallet[4]),
            earnedRoyalty: asBig(member.earnedRoyalty ?? member[7]),
            withdrawn: asBig(member.withdrawn ?? member[8]),
          } satisfies RoyaltyMemberRow;
        }),
      );
      setRoyaltyRows(rows);
    } catch (e) {
      console.error(e);
      setRoyaltyRows([]);
    } finally {
      setRoyaltyLoading(false);
    }
  }, [contractAddr, getReadContract]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadStatic(),
      account ? loadUser() : Promise.resolve(),
    ]);
    if (account) {
      void loadIncome();
      void loadDirects();
      void loadPositions();
      void loadMatrix();
      void loadRoyaltyMembers();
    }
  }, [account, loadDirects, loadIncome, loadMatrix, loadPositions, loadRoyaltyMembers, loadStatic, loadUser]);

  useEffect(() => {
    if (walletRestoring) return;
    const id = window.setTimeout(() => {
      void refreshAll();
    }, 0);
    return () => window.clearTimeout(id);
  }, [account, contractAddr, walletRestoring]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!account || walletRestoring) return;
    const id = window.setTimeout(() => {
      void loadIncome();
    }, 0);
    return () => window.clearTimeout(id);
  }, [account, walletRestoring, incomeFilter, historyPage, loadIncome]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (tab === "dashboard" || tab === "matrix") void loadMatrix();
      if (tab === "dashboard" || tab === "royalty" || tab === "admin") void loadRoyaltyMembers();
      if (tab === "dashboard" || tab === "team") void loadDirects();
      if (tab === "dashboard" || tab === "virtuals") void loadPositions();
    }, 0);
    return () => window.clearTimeout(id);
  }, [tab, loadDirects, loadMatrix, loadPositions, loadRoyaltyMembers]);

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

  async function ensureApprove(amount: bigint) {
    const { contract, signer, address, provider } = await getSignerContract();
    const tokenAddr: string =
      (await contract.paymentToken().catch(() => DEFAULT_PAYMENT_TOKEN)) || DEFAULT_PAYMENT_TOKEN;
    const token = new Contract(tokenAddr, ERC20_ABI, signer);
    const spender = contract.target as string;
    let allow: bigint = BigInt(await token.allowance(address, spender));
    if (allow >= amount) return;

    showToast(`MetaMask: Approve ${tokenSymbol} spending (step 1/2)…`);
    const gas = await lowGasOverrides(provider, () => token.approve.estimateGas(spender, amount));
    const tx = await token.approve(spender, amount, gas);
    await tx.wait();

    allow = BigInt(await token.allowance(address, spender));
    if (allow < amount) {
      await sleep(1200);
      allow = BigInt(await token.allowance(address, spender));
    }
    if (allow < amount) {
      throw new Error(
        `Token approve failed — allowance ${fmtToken(allow, tokenDecimals)} < need ${fmtToken(amount, tokenDecimals)}.`,
      );
    }
    showToast("Approved — confirm Join in MetaMask (step 2/2)…");
  }

  function friendlyTxError(label: string, e: unknown): string {
    let msg = `${label} failed`;
    if (!e || typeof e !== "object") return msg;
    const err = e as {
      code?: number | string;
      reason?: string;
      shortMessage?: string;
      message?: string;
      revert?: { signature?: string; name?: string } | null;
    };
    msg = err.reason || err.shortMessage || err.message || msg;
    const code = err.code;
    const lower = String(msg).toLowerCase();
    if (code === 4001 || code === "ACTION_REJECTED" || lower.includes("user rejected") || lower.includes("user denied")) {
      return "Transaction rejected in MetaMask";
    }
    const revertName = err.revert?.name || err.revert?.signature?.split("(")[0];
    const names: Record<string, string> = {
      AlreadyJoined: "This wallet already joined",
      InvalidReferrer: "Invalid referrer address",
      ReferrerNotMember: "Referrer must already be a member",
      NothingToWithdraw: "Nothing to withdraw",
      EnforcedPause: "Contract is paused",
      EmptyRoyaltyPool: "Royalty pool is empty",
      NoRoyaltyMembers: "No royalty members this month",
      RoyaltyRoundActive: "A royalty round is already running",
      RoyaltyAlreadyDistributed: "This month already distributed",
      ERC20InsufficientAllowance: `Approve ${tokenSymbol} first, then Join again`,
      ERC20InsufficientBalance: `Insufficient ${tokenSymbol} — need $${JOIN_USD}`,
    };
    if (revertName && names[revertName]) return names[revertName];
    const custom = String(msg).match(
      /\b(AlreadyJoined|InvalidReferrer|ReferrerNotMember|NothingToWithdraw|EnforcedPause|EmptyRoyaltyPool|NoRoyaltyMembers|RoyaltyRoundActive|RoyaltyAlreadyDistributed|ERC20InsufficientAllowance|ERC20InsufficientBalance)\b/,
    );
    if (custom?.[1] && names[custom[1]]) return names[custom[1]];
    if (lower.includes("missing revert data") || lower.includes("unknown custom error")) {
      return `${label} failed — check BSC Testnet, ${tokenSymbol} balance, approve, and a registered referrer.`;
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

  function resolveSponsor(): string | null {
    const typed = sponsorInput.trim();
    if (isAddress(typed)) return typed;
    if (refSponsor.current && isAddress(refSponsor.current)) return refSponsor.current;
    if (isAddress(ROOT_REFERRER)) return ROOT_REFERRER;
    return null;
  }

  async function onRegisterBuy() {
    const referrer = resolveSponsor();
    if (!referrer) {
      showToast("Enter a valid referrer address", "error");
      return;
    }
    const ok = await runTx("Join", async () => {
      const eth = getEthereum();
      if (eth?.request) await ensureBscMainnet(eth);
      const { contract, signer, address, provider } = await getSignerContract();
      const price: bigint = asBig(await contract.joinAmount());
      if (price <= 0n) throw new Error("Join amount unavailable — check contract");

      const tokenAddr: string =
        (await contract.paymentToken().catch(() => DEFAULT_PAYMENT_TOKEN)) || DEFAULT_PAYMENT_TOKEN;
      const token = new Contract(tokenAddr, ERC20_ABI, signer);
      const bal: bigint = BigInt(await token.balanceOf(address));
      if (bal < price) {
        throw new Error(
          `Insufficient ${tokenSymbol} — need ${fmtToken(price, tokenDecimals)}, have ${fmtToken(bal, tokenDecimals)}`,
        );
      }

      const refMember = await contract.memberOf(referrer);
      if (!Boolean(refMember.joined ?? refMember[4])) {
        throw new Error("Referrer must already be a member");
      }

      await ensureApprove(price);
      await contract.register.staticCall(referrer);
      const gas = await lowGasOverrides(provider, () => contract.register.estimateGas(referrer));
      const tx = await contract.register(referrer, gas);
      await tx.wait();
    });
    if (ok) {
      clearRefFromUrl();
      refSponsor.current = "";
      setSponsorInput(ROOT_REFERRER);
      setTab("dashboard");
    }
  }

  async function onWithdraw() {
    await runTx("Withdraw", async () => {
      const { contract, provider } = await getSignerContract();
      const gas = await lowGasOverrides(provider, () => contract.withdraw.estimateGas());
      const tx = await contract.withdraw(gas);
      await tx.wait();
    });
  }

  async function onProcessVirtuals() {
    const n = Math.max(1, Number(virtualBatch) || 8);
    await runTx("Process virtual IDs", async () => {
      const { contract, provider } = await getSignerContract();
      const gas = await lowGasOverrides(provider, () => contract.processVirtualQueue.estimateGas(n));
      const tx = await contract.processVirtualQueue(n, gas);
      await tx.wait();
    });
  }

  async function onProcessRoyalty() {
    const n = Math.max(1, Number(royaltyBatch) || 32);
    await runTx("Process royalty", async () => {
      const { contract, provider } = await getSignerContract();
      const gas = await lowGasOverrides(provider, () => contract.processMonthlyRoyalty.estimateGas(n));
      const tx = await contract.processMonthlyRoyalty(n, gas);
      await tx.wait();
    });
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      showToast("Copy failed", "error");
    }
  }

  function openMatrix(id: bigint) {
    if (id <= 0n) return;
    setMatrixFocus(id);
    setMatrixPath((prev) => (prev[prev.length - 1] === id ? prev : [...prev, id]));
    setMatrixViewLevel(1);
    setMatrixLevelOffset(0);
    setTab("matrix");
    void loadMatrix(id, 1, 0);
  }

  function matrixBack() {
    setMatrixPath((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, -1);
      const target = next[next.length - 1];
      if (target) {
        setMatrixFocus(target);
        setMatrixViewLevel(1);
        setMatrixLevelOffset(0);
        void loadMatrix(target, 1, 0);
      }
      return next;
    });
  }

  const navItems = useMemo(() => (isOwner ? [...TABS, ADMIN_TAB] : TABS), [isOwner]);
  const shellTitle = navItems.find((t) => t.id === tab)?.label || "Dashboard";
  const historyPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE) || 1);
  const earnedMatrixTotal = earnedMatrix.reduce((a, b) => a + b, 0n);
  // Lifetime = everything credited (matrix/royalty + admin/spill for treasury).
  const earnedTotal = earnedRoyalty + earnedMatrixTotal + earnedAdmin + earnedSpill;
  const heldTotal = heldPerLevel.reduce((a, b) => a + b, 0n);
  const isTreasuryWallet =
    !!account &&
    !!treasury &&
    isAddress(treasury) &&
    account.toLowerCase() === treasury.toLowerCase();

  function handleNavigate(id: string) {
    if (id === "admin" && !isOwner) {
      showToast("Admin is only for the contract owner wallet", "error");
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

  const contractBar = (
    <>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
        <span>
          Contract:{" "}
          {isAddress(contractAddr) && contractAddr !== ZeroAddress ? (
            <a href={explorerAddress(contractAddr, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
              {shortAddr(contractAddr, 6)}
            </a>
          ) : (
            "not set"
          )}
        </span>
        <span>
          {tokenSymbol}:{" "}
          {paymentToken ? (
            <a href={explorerAddress(paymentToken, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
              {shortAddr(paymentToken, 6)}
            </a>
          ) : (
            "—"
          )}
        </span>
        <span className="badge badge-success">BSC Testnet · ${JOIN_USD} join</span>
        <span>
          Root:{" "}
          <a href={explorerAddress(ROOT_REFERRER, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
            {shortAddr(ROOT_REFERRER, 6)}
          </a>
        </span>
        {paused && <span className="badge badge-danger">Paused</span>}
      </div>
    </>
  );

  if (!hydrated) {
    return (
      <>
        <WalletAuthScreen mode="login" onConnect={() => void connect()} busy={busy} />
        {toastNode}
      </>
    );
  }

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
          <span className="badge badge-gold font-mono hidden sm:inline-flex">{shortAddr(account, 6)}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void refreshAll()} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5${busy ? " animate-spin" : ""}`} />
            Refresh
          </button>
          <button className="btn btn-danger btn-sm" type="button" onClick={disconnect}>
            Disconnect
          </button>
        </>
      }
    >
      <>
        <PageHeader
          title={tab === "dashboard" ? "Dashboard" : shellTitle}
          description={
            tab === "admin"
              ? "Owner-only contract controls"
              : tab === "matrix"
                ? "Global 4×6 tree"
                : tab === "royalty"
                  ? "Monthly equal split · 20 directs"
                  : `${APP_NAME_FULL} · ${shortAddr(contractAddr, 6)}`
          }
        />
        {contractBar}
      </>

      <div className="flex flex-col gap-4">
        {tab === "dashboard" && (
          <section className="relative">
            {(busy || userLoading) && (
              <div className="section-loading-overlay">
                <DataLoading label="Loading your dashboard…" />
              </div>
            )}
            <div className="card mb-4">
              <h2 className="card-title">Your referral link</h2>
              <div className="field">
                <label className="label">Share this so new members join under you</label>
                <div className="flex flex-wrap gap-2">
                  <input className="input" readOnly value={referralLink} style={{ flex: 1, minWidth: 200 }} />
                  <button className="btn btn-primary" type="button" onClick={() => void copyText(referralLink)}>
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="grid-stats mb-4">
              {(
                [
                  ["Main ID", primaryPosition > 0n ? `#${primaryPosition.toString()}` : "—"],
                  ["Directs", String(directCount)],
                  ["Positions", String(positionCount)],
                  ["Virtual IDs", String(virtualCount)],
                  ["Withdrawable", fmtUsd(claimable, tokenDecimals)],
                  ["Withdrawn", fmtUsd(withdrawn, tokenDecimals)],
                  ...(isTreasuryWallet
                    ? ([
                        ["Admin income", fmtUsd(earnedAdmin, tokenDecimals)],
                        ["Spill income", fmtUsd(earnedSpill, tokenDecimals)],
                      ] as const)
                    : ([] as const)),
                  ["Held until level complete", fmtUsd(heldTotal, tokenDecimals)],
                  ["Matrix income", fmtUsd(earnedMatrixTotal, tokenDecimals)],
                  ["Royalty income", fmtUsd(earnedRoyalty, tokenDecimals)],
                  ["Pending levels", fmtUsd(pendingAmount, tokenDecimals)],
                  ["Royalty pool", inRoyalty ? "Qualified (20 directs)" : `${directCount}/${ROYALTY_DIRECTS}`],
                  ["Sponsor", shortAddr(sponsor)],
                  ["Join amount", joinAmount > 0n ? fmtUsd(joinAmount, tokenDecimals) : `$${JOIN_USD}`],
                ] as const
              ).map(([label, value], i) => (
                <div className="card" key={label}>
                  <div className="stat-label !text-left">{label}</div>
                  <div className={`stat-value !text-left${label === "Withdrawable" ? " text-gradient-gold" : ""}`}>{value}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <h2 className="card-title mb-3">Level progress (main ID)</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {LEVEL_IDS.map((cap, i) => (
                  <div key={cap} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span>
                        L{i + 1} · ${LEVEL_INCOME_USD[i]}
                      </span>
                      <span className={matrixCompleted[i] ? "text-leaf-400" : "text-muted"}>
                        {matrixFilled[i]}/{cap}
                        {matrixCompleted[i] ? " · Paid" : ""}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-solar-400"
                        style={{ width: `${Math.min(100, (matrixFilled[i] / cap) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-2xs text-muted">
                      {matrixCompleted[i]
                        ? `Paid $${LEVEL_INCOME_USD[i]} on complete`
                        : heldPerLevel[i] > 0n
                          ? `Held ${fmtUsd(heldPerLevel[i], tokenDecimals)} · $${LEVEL_INCOME_USD[i]} when ${cap}/${cap}`
                          : `$${LEVEL_INCOME_USD[i]} when ${cap} IDs complete`}
                      {REQUIRED_DIRECTS[i] > 0 ? ` · need ${REQUIRED_DIRECTS[i]} directs` : ""}
                      {pendingPerLevel[i] > 0n ? ` · pending ${fmtUsd(pendingPerLevel[i], tokenDecimals)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {(tab === "dashboard" || tab === "withdraw") && (
          <section className="card">
            <h2 className="card-title">Withdraw to your wallet</h2>
            <p className="mb-4 text-sm text-muted">
              {isTreasuryWallet
                ? "Creator/treasury wallet earns Admin (~$2.26 per join) plus Spill (matrix levels with no upline). Matrix level pay still only clears when a level is full."
                : "Matrix claimable when a level is full: L1 $4 (4 IDs), L2 $10 (16), L3 $25, L4 $60, L5 $150, L6 $375. Not $1 per join. No platform fee."}
            </p>
            <div className="grid-stats mb-4">
              <StatTile label="Claimable" value={fmtUsd(claimable, tokenDecimals)} accent />
              <StatTile label="Held until complete" value={fmtUsd(heldTotal, tokenDecimals)} />
              <StatTile label="Already withdrawn" value={fmtUsd(withdrawn, tokenDecimals)} />
              <StatTile label="Wallet balance" value={`${fmtToken(balance, tokenDecimals)} ${tokenSymbol}`} />
              <StatTile label={`${tokenSymbol} allowance`} value={`${fmtToken(allowance, tokenDecimals)} ${tokenSymbol}`} />
              <StatTile label="Lifetime earned" value={fmtUsd(earnedTotal, tokenDecimals)} />
              {isTreasuryWallet && (
                <>
                  <StatTile label="Admin income" value={fmtUsd(earnedAdmin, tokenDecimals)} />
                  <StatTile label="Spill income" value={fmtUsd(earnedSpill, tokenDecimals)} />
                  <StatTile label="Matrix income" value={fmtUsd(earnedMatrixTotal, tokenDecimals)} />
                </>
              )}
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || claimable === 0n}
              onClick={() => void onWithdraw()}
            >
              Withdraw {fmtUsd(claimable, tokenDecimals)}
            </button>
          </section>
        )}

        {(tab === "dashboard" || tab === "income") && (
          <section className="card">
            <div className="card-header mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="card-title">Income ledger</h2>
              <select
                className="input"
                value={incomeFilter}
                onChange={(e) => {
                  setIncomeFilter(Number(e.target.value));
                  setHistoryPage(0);
                }}
              >
                <option value={0}>All types</option>
                <option value={1}>Direct</option>
                <option value={2}>Matrix</option>
                <option value={3}>Pending</option>
                <option value={4}>Unlocked</option>
                <option value={5}>Royalty</option>
                <option value={6}>Spill</option>
                <option value={7}>Admin</option>
              </select>
            </div>
            {incomeLoading ? (
              <DataLoading label="Loading income…" />
            ) : historyRows.length === 0 ? (
              <p className="text-sm text-muted">No income records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Level</th>
                      <th>Amount</th>
                      <th>From ID</th>
                      <th>To ID</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row, i) => (
                      <tr key={`${row.timestamp}-${i}`}>
                        <td>{incomeKind(row.kind)}</td>
                        <td>{row.level || "—"}</td>
                        <td>{fmtUsd(row.amount, tokenDecimals)}</td>
                        <td>#{row.fromPosition.toString()}</td>
                        <td>#{row.toPosition.toString()}</td>
                        <td>{fmtTime(row.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {historyPages > 1 && (
              <div className="mt-3 flex gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={historyPage <= 0}
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </button>
                <span className="text-sm text-muted">
                  {historyPage + 1} / {historyPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={historyPage + 1 >= historyPages}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        )}

        {(tab === "dashboard" || tab === "matrix") && (
          <MatrixBoard
              positionId={matrixFocus || primaryPosition}
              isVirtual={matrixIsVirtual}
              mainId={matrixMainId || primaryPosition}
              owner={matrixOwner || account}
              account={account}
              decimals={tokenDecimals}
              overview={matrixOverview}
              slots={matrixSlots}
              grandchildren={matrixGrandchildren}
              levelUsers={matrixLevelUsers}
              levelFilled={matrixLevelFilled}
              levelCapacity={matrixLevelCapacity}
              levelOffset={matrixLevelOffset}
              viewLevel={matrixViewLevel}
              path={matrixPath}
              positions={positions}
              onViewLevel={(lvl) => {
                setMatrixViewLevel(lvl);
                setMatrixLevelOffset(0);
                void loadMatrix(undefined, lvl, 0);
              }}
              onPage={(nextOffset) => {
                setMatrixLevelOffset(nextOffset);
                void loadMatrix(undefined, undefined, nextOffset);
              }}
              onSelectId={(id) => {
                setMatrixFocus(id);
                setMatrixPath([id]);
                setMatrixViewLevel(1);
                setMatrixLevelOffset(0);
                void loadMatrix(id, 1, 0);
              }}
              onBack={matrixBack}
              loading={matrixLoading}
              onRefresh={() => void loadMatrix()}
              onOpenChild={(id) => openMatrix(id)}
            />
        )}

        {(tab === "dashboard" || tab === "royalty") && (
          <RoyaltyPool
            pool={royaltyPool}
            epoch={royaltyEpoch}
            memberCount={royaltyMembers}
            members={royaltyRows}
            loading={royaltyLoading}
            decimals={tokenDecimals}
            youQualified={inRoyalty}
            yourDirects={directCount}
            youAddress={account}
          />
        )}

        {(tab === "dashboard" || tab === "team") && (
          <section className="card">
            <h2 className="card-title mb-3">Direct IDs ({directCount})</h2>
            {directsLoading ? (
              <DataLoading label="Loading directs…" />
            ) : directs.length === 0 ? (
              <p className="text-sm text-muted">No directs yet. Share your referral link.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Wallet</th>
                      <th>Main ID</th>
                      <th>Their directs</th>
                      <th>Withdrawn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {directs.map((d) => (
                      <tr key={d.address}>
                        <td className="font-mono">{shortAddr(d.address, 6)}</td>
                        <td>
                          {d.positionId > 0n ? (
                            <button className="btn btn-ghost btn-sm" type="button" onClick={() => openMatrix(d.positionId)}>
                              #{d.positionId.toString()}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{d.directCount}</td>
                        <td>{fmtUsd(d.withdrawn, tokenDecimals)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {(tab === "dashboard" || tab === "virtuals") && (
          <section className="card">
            <h2 className="card-title mb-3">Virtual IDs</h2>
            {virtualsLoading ? (
              <DataLoading label="Loading virtual IDs…" />
            ) : virtuals.length === 0 ? (
              <p className="text-sm text-muted">No virtual IDs yet. Complete Level 2+ to mint them.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Virtual ID</th>
                      <th>Main ID</th>
                      <th>From level</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {virtuals.map((v) => (
                      <tr key={v.id.toString()}>
                        <td>
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => openMatrix(v.id)}>
                            #{v.id.toString()}
                          </button>
                        </td>
                        <td>#{v.mainId.toString()}</td>
                        <td>{v.sourceLevel || "—"}</td>
                        <td>{fmtTime(v.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {virtualQueue > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm text-muted">{virtualQueue} virtual ID(s) waiting in the global queue.</p>
                <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void onProcessVirtuals()}>
                  Process queue
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "admin" && isOwner && (
          <section className="flex flex-col gap-4">
            <div className="grid-stats">
              <StatTile label="Positions" value={String(totalPositions)} />
              <StatTile label="Paid IDs" value={String(paidIds)} />
              <StatTile label="Virtual IDs" value={String(globalVirtuals)} />
              <StatTile label="Royalty pool" value={fmtUsd(royaltyPool, tokenDecimals)} accent />
              <StatTile label="Royalty members" value={String(royaltyMembers)} />
              <StatTile label="Virtual queue" value={String(virtualQueue)} />
              <StatTile label="Reserved funds" value={fmtUsd(reserved, tokenDecimals)} />
              <StatTile label="Epoch" value={royaltyEpoch.toString()} />
            </div>

            <div className="card">
              <h2 className="card-title mb-3">Monthly royalty</h2>
              <p className="mb-3 text-sm text-muted">
                Splits the current pool equally among wallets that still have {ROYALTY_DIRECTS} directs. Call again if
                the round is still active.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="field">
                  <label className="label">Members per tx</label>
                  <input className="input" value={royaltyBatch} onChange={(e) => setRoyaltyBatch(e.target.value)} />
                </div>
                <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onProcessRoyalty()}>
                  Process royalty
                </button>
              </div>
            </div>

            <RoyaltyPool
              pool={royaltyPool}
              epoch={royaltyEpoch}
              memberCount={royaltyMembers}
              members={royaltyRows}
              loading={royaltyLoading}
              decimals={tokenDecimals}
              youQualified={inRoyalty}
              yourDirects={directCount}
              youAddress={account}
            />

            <div className="card">
              <h2 className="card-title mb-3">Virtual queue</h2>
              <div className="flex flex-wrap items-end gap-2">
                <div className="field">
                  <label className="label">IDs per tx</label>
                  <input className="input" value={virtualBatch} onChange={(e) => setVirtualBatch(e.target.value)} />
                </div>
                <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onProcessVirtuals()}>
                  Process virtuals
                </button>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title mb-3">Pause</h2>
              <p className="mb-3 text-sm text-muted">Status: {paused ? "Paused" : "Live"}</p>
              <div className="flex gap-2">
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={busy || paused}
                  onClick={() =>
                    void runTx("Pause", async () => {
                      const { contract, provider } = await getSignerContract();
                      const gas = await lowGasOverrides(provider, () => contract.pause.estimateGas());
                      const tx = await contract.pause(gas);
                      await tx.wait();
                    })
                  }
                >
                  Pause
                </button>
                <button
                  className="btn btn-green"
                  type="button"
                  disabled={busy || !paused}
                  onClick={() =>
                    void runTx("Unpause", async () => {
                      const { contract, provider } = await getSignerContract();
                      const gas = await lowGasOverrides(provider, () => contract.unpause.estimateGas());
                      const tx = await contract.unpause(gas);
                      await tx.wait();
                    })
                  }
                >
                  Unpause
                </button>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title mb-3">Admin fund puller</h2>
              <p className="mb-2 text-sm text-muted">
                Same as USDTCoinContract: owner calls sellAdminFunds — all to one receiver (no split).
              </p>
              <p className="mb-1 text-sm text-muted">
                Puller:{" "}
                {adminPuller ? (
                  <a href={explorerAddress(adminPuller, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
                    {shortAddr(adminPuller, 6)}
                  </a>
                ) : (
                  "not linked"
                )}
              </p>
              <p className="mb-1 text-sm text-muted">
                Receiver: {pullerReceiver ? shortAddr(pullerReceiver, 6) : "—"}
              </p>
              <p className="mb-3 text-sm text-muted">
                Core balance: {fmtToken(totalPullable, tokenDecimals)} {tokenSymbol}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label className="label">Amount</label>
                  <input
                    className="input"
                    value={pullAmount}
                    onChange={(e) => setPullAmount(e.target.value.trim())}
                    placeholder="e.g. 10 or leave empty = all"
                  />
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy || !adminPuller || totalPullable === 0n}
                  onClick={() =>
                    void runTx("sellAdminFunds", async () => {
                      const eth = getEthereum();
                      if (!eth) throw new Error("No wallet");
                      await ensureBscMainnet(eth);
                      const provider = new BrowserProvider(eth);
                      const signer = await provider.getSigner();
                      const puller = new Contract(adminPuller, ADMIN_PULLER_ABI, signer);
                      const amount =
                        pullAmount && Number(pullAmount) > 0
                          ? parseUnits(pullAmount, tokenDecimals)
                          : totalPullable;
                      const gas = await lowGasOverrides(provider, () =>
                        puller.sellAdminFunds.estimateGas(amount),
                      );
                      const tx = await puller.sellAdminFunds(amount, gas);
                      await tx.wait();
                      setPullAmount("");
                    })
                  }
                >
                  Pull
                </button>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title mb-3">Treasury</h2>
              <p className="mb-2 text-sm text-muted">Current: {shortAddr(treasury, 6)}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="field" style={{ flex: 1, minWidth: 240 }}>
                  <label className="label">New treasury</label>
                  <input
                    className="input input-mono"
                    value={newTreasury}
                    onChange={(e) => setNewTreasury(e.target.value.trim())}
                    placeholder="0x…"
                  />
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy || !isAddress(newTreasury)}
                  onClick={() =>
                    void runTx("Update treasury", async () => {
                      const { contract, provider } = await getSignerContract();
                      const gas = await lowGasOverrides(provider, () => contract.setTreasury.estimateGas(newTreasury));
                      const tx = await contract.setTreasury(newTreasury, gas);
                      await tx.wait();
                    })
                  }
                >
                  Save treasury
                </button>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title mb-3">Royalty block</h2>
              <div className="flex flex-wrap items-end gap-2">
                <div className="field" style={{ flex: 1, minWidth: 240 }}>
                  <label className="label">Wallet</label>
                  <input
                    className="input input-mono"
                    value={blockAddr}
                    onChange={(e) => setBlockAddr(e.target.value.trim())}
                    placeholder="0x…"
                  />
                </div>
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={busy || !isAddress(blockAddr)}
                  onClick={() =>
                    void runTx("Block royalty", async () => {
                      const { contract, provider } = await getSignerContract();
                      const gas = await lowGasOverrides(provider, () =>
                        contract.setRoyaltyBlocked.estimateGas(blockAddr, true),
                      );
                      const tx = await contract.setRoyaltyBlocked(blockAddr, true, gas);
                      await tx.wait();
                    })
                  }
                >
                  Block
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy || !isAddress(blockAddr)}
                  onClick={() =>
                    void runTx("Unblock royalty", async () => {
                      const { contract, provider } = await getSignerContract();
                      const gas = await lowGasOverrides(provider, () =>
                        contract.setRoyaltyBlocked.estimateGas(blockAddr, false),
                      );
                      const tx = await contract.setRoyaltyBlocked(blockAddr, false, gas);
                      await tx.wait();
                    })
                  }
                >
                  Unblock
                </button>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title mb-3">Recover ERC20</h2>
              <p className="mb-2 text-sm text-muted">Payment token can only be recovered while paused and above reserved funds.</p>
              <div className="grid-two">
                <div className="field">
                  <label className="label">Token</label>
                  <input className="input input-mono" value={recoverToken} onChange={(e) => setRecoverToken(e.target.value.trim())} />
                </div>
                <div className="field">
                  <label className="label">To</label>
                  <input className="input input-mono" value={recoverTo} onChange={(e) => setRecoverTo(e.target.value.trim())} />
                </div>
                <div className="field">
                  <label className="label">Amount (raw units)</label>
                  <input className="input" value={recoverAmt} onChange={(e) => setRecoverAmt(e.target.value.trim())} />
                </div>
              </div>
              <button
                className="btn btn-ghost mt-3"
                type="button"
                disabled={busy || !isAddress(recoverToken) || !isAddress(recoverTo) || !recoverAmt}
                onClick={() =>
                  void runTx("Recover token", async () => {
                    const { contract, provider } = await getSignerContract();
                    const amt = BigInt(recoverAmt);
                    const gas = await lowGasOverrides(provider, () =>
                      contract.recoverERC20.estimateGas(recoverToken, amt, recoverTo),
                    );
                    const tx = await contract.recoverERC20(recoverToken, amt, recoverTo, gas);
                    await tx.wait();
                  })
                }
              >
                Recover
              </button>
            </div>
          </section>
        )}
      </div>
      {toastNode}
    </AppShell>
  );
}
