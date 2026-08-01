"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Home,
  Info,
  Layers,
  Loader2,
  Network,
  RefreshCw,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ZeroAddress, isAddress } from "ethers";
import { PACKAGE_NAMES } from "@/lib/contract";
import { pkgName, shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MatrixSeatInfo = {
  address: string;
  active: boolean;
  childCount: number;
  downline: string;
};

export type MatrixTreeData = {
  root: string;
  parent: string;
  active: boolean;
  childrenCount: number;
  downline: string;
  ctoRank: number;
  children: MatrixSeatInfo[];
  grandchildren: MatrixSeatInfo[][];
  /** Matrix direct slots filled (0–3) — used for Global Autopool entry progress. */
  matrixDirects?: number;
  /** True when this root has completed 3 matrix directs (Global Autopool qualified). */
  globalQualified?: boolean;
};

export type MatrixTreeMode = "matrix" | "global";

type MatrixTreeViewProps = {
  account: string;
  packageId: number;
  /** User's highest owned package — used to highlight Active + unlock owned matrices. */
  activePackageId?: number;
  data: MatrixTreeData;
  path: string[];
  loading?: boolean;
  sponsor?: string;
  joinedLabel?: string;
  matrixEarnedLabel?: string;
  globalEarnedLabel?: string;
  treeMode?: MatrixTreeMode;
  onTreeModeChange?: (mode: MatrixTreeMode) => void;
  onPackageChange: (id: number) => void;
  onFocus: (address: string) => void;
  onGoHome: () => void;
  onGoUp: () => void;
  onPathJump: (index: number) => void;
  onRefresh: () => void;
  onCopy: (text: string) => void;
  loadSubtree: (address: string) => Promise<MatrixTreeData>;
  onUpgrade?: () => void;
  /** Highlight upgrade CTA when user can buy the next package. */
  canUpgrade?: boolean;
  upgradeLabel?: string;
  upgradeDisabled?: boolean;
};

function isFilled(addr: string) {
  return Boolean(addr && addr !== ZeroAddress && isAddress(addr));
}

function emptySeats(n: number): MatrixSeatInfo[] {
  return Array.from({ length: n }, () => ({
    address: "",
    active: false,
    childCount: 0,
    downline: "0",
  }));
}

function seatStatus(seat: MatrixSeatInfo): "you" | "active" | "inactive" | "empty" {
  if (!isFilled(seat.address)) return "empty";
  return seat.active ? "active" : "inactive";
}

function MemberNode({
  seat,
  label,
  levelLabel,
  isYou,
  size = "md",
  onOpen,
  onCopy,
}: {
  seat: MatrixSeatInfo;
  label: string;
  levelLabel: string;
  isYou?: boolean;
  size?: "lg" | "md" | "sm";
  onOpen: (addr: string) => void;
  onCopy: (text: string) => void;
}) {
  const status = isYou ? "you" : seatStatus(seat);
  const filled = status !== "empty";
  const [hover, setHover] = useState(false);

  return (
    <div
      className={cn("mx-node", `mx-node-${size}`, `is-${status}`, filled && "is-clickable")}
      role={filled ? "button" : undefined}
      tabIndex={filled ? 0 : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (filled) onOpen(seat.address);
      }}
      onKeyDown={(e) => {
        if (!filled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(seat.address);
        }
      }}
    >
      <div className="mx-node-avatar" aria-hidden>
        {filled ? <User className="mx-node-ico" /> : <span className="mx-node-empty-dot" />}
      </div>
      <div className="mx-node-body">
        <div className="mx-node-name-row">
          <span className="mx-node-name">{label}</span>
          {isYou && <span className="mx-you-tag">You</span>}
        </div>
        <span className={cn("mx-node-level", `tone-${status === "you" ? "active" : status}`)}>
          {levelLabel}
        </span>
      </div>
      {filled && hover && (
        <div className="mx-node-tip" onClick={(e) => e.stopPropagation()}>
          <code>{seat.address}</code>
          <button type="button" className="icon-btn" aria-label="Copy" onClick={() => onCopy(seat.address)}>
            <Copy className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function TreeBoard({
  account,
  packageId,
  data,
  onOpen,
  onCopy,
  compact,
  globalMode,
}: {
  account: string;
  packageId: number;
  data: MatrixTreeData;
  onOpen: (addr: string) => void;
  onCopy: (text: string) => void;
  compact?: boolean;
  globalMode?: boolean;
}) {
  const children = data.children.length ? data.children : emptySeats(3);
  const grandchildren = [0, 1, 2].map((g) =>
    data.grandchildren[g]?.length ? data.grandchildren[g] : emptySeats(3),
  );
  const isMeRoot = data.root.toLowerCase() === account.toLowerCase();
  const rootLabel = isMeRoot ? "You" : shortAddr(data.root);
  const seatTag = (seat: MatrixSeatInfo) => {
    if (!isFilled(seat.address)) return "Open";
    if (globalMode) return `${pkgName(packageId)} · Global`;
    return `${pkgName(packageId)} · ${seat.active ? "Active" : "Inactive"}`;
  };

  return (
    <div className={cn("mx-tree-board", compact && "is-compact")}>
      <div className="mx-level-block">
        <div className="mx-level-nodes mx-level-nodes-1">
          <MemberNode
            seat={{
              address: data.root,
              active: data.active,
              childCount: data.childrenCount,
              downline: data.downline,
            }}
            label={rootLabel}
            levelLabel={
              globalMode
                ? `${pkgName(packageId)} · ${data.globalQualified ? "Qualified" : "Pending"}`
                : `${pkgName(packageId)} · Root`
            }
            isYou={isMeRoot}
            size="lg"
            onOpen={onOpen}
            onCopy={onCopy}
          />
        </div>
      </div>

      <div className="mx-fork mx-fork-3" aria-hidden>
        <span className="mx-fork-stem" />
        <span className="mx-fork-bar" />
        <span className="mx-fork-leg" />
        <span className="mx-fork-leg" />
        <span className="mx-fork-leg" />
      </div>

      <div className="mx-level-block">
        <div className="mx-level-nodes mx-level-nodes-3">
          {children.map((child, idx) => (
            <div key={idx} className="mx-slot">
              <MemberNode
                seat={child}
                label={isFilled(child.address) ? shortAddr(child.address) : "Empty"}
                levelLabel={seatTag(child)}
                isYou={
                  isFilled(child.address) && child.address.toLowerCase() === account.toLowerCase()
                }
                onOpen={onOpen}
                onCopy={onCopy}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mx-fork-row" aria-hidden>
        {[0, 1, 2].map((g) => (
          <div key={g} className="mx-fork mx-fork-3">
            <span className="mx-fork-stem" />
            <span className="mx-fork-bar" />
            <span className="mx-fork-leg" />
            <span className="mx-fork-leg" />
            <span className="mx-fork-leg" />
          </div>
        ))}
      </div>

      <div className="mx-level-block">
        <div className="mx-level-nodes mx-level-nodes-3">
          {grandchildren.map((group, g) => (
            <div key={g} className="mx-slot mx-slot-group">
              {group.map((gc, idx) => (
                <MemberNode
                  key={idx}
                  seat={gc}
                  label={isFilled(gc.address) ? shortAddr(gc.address) : "Empty"}
                  levelLabel={seatTag(gc)}
                  size="sm"
                  isYou={
                    isFilled(gc.address) && gc.address.toLowerCase() === account.toLowerCase()
                  }
                  onOpen={onOpen}
                  onCopy={onCopy}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: "gold" | "green" | "leaf" | "amber";
}) {
  return (
    <div className={cn("mx-kpi", `tone-${tone}`)}>
      <div>
        <div className="mx-kpi-label">{label}</div>
        <div className="mx-kpi-value">{value}</div>
      </div>
      <div className="mx-kpi-icon">{icon}</div>
    </div>
  );
}

function useCenterScroll(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const center = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) {
        el.scrollLeft = 0;
        return;
      }
      el.scrollLeft = max / 2;
    };

    const id1 = requestAnimationFrame(() => {
      center();
      requestAnimationFrame(center);
    });
    const t1 = window.setTimeout(center, 80);
    const t2 = window.setTimeout(center, 250);
    const ro = new ResizeObserver(() => center());
    ro.observe(el);
    const child = el.firstElementChild;
    if (child) ro.observe(child);

    window.addEventListener("orientationchange", center);

    return () => {
      cancelAnimationFrame(id1);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("orientationchange", center);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

export function MatrixTreeView({
  account,
  packageId,
  activePackageId = 0,
  data,
  path,
  loading,
  sponsor,
  joinedLabel,
  matrixEarnedLabel,
  globalEarnedLabel,
  treeMode = "matrix",
  onTreeModeChange,
  onPackageChange,
  onFocus,
  onGoHome,
  onGoUp,
  onPathJump,
  onRefresh,
  onCopy,
  loadSubtree,
  onUpgrade,
  canUpgrade = false,
  upgradeLabel = "Upgrade Package",
  upgradeDisabled = false,
}: MatrixTreeViewProps) {
  const [pkgOpen, setPkgOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState<MatrixTreeData | null>(null);
  const [modalStack, setModalStack] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const isGlobal = treeMode === "global";
  const treeTitle = isGlobal ? "Global Autopool Tree" : "Matrix Tree";
  const treeSubtitle = isGlobal
    ? `Global pool placements · ${pkgName(packageId)}`
    : `3× Autopool matrix · ${pkgName(packageId)}`;
  const earningsLabel = isGlobal ? "Global Earnings" : "Matrix Earnings";
  const earningsValue = isGlobal ? globalEarnedLabel : matrixEarnedLabel;
  const matrixTypeLabel = isGlobal ? "3× Global Autopool" : "3×3 Matrix Autopool";
  const portalReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const scrollRef = useCenterScroll([data.root, data.children, data.grandchildren, loading]);
  const modalScrollRef = useCenterScroll([modalData, modalLoading, modalOpen]);

  const children = data.children.length ? data.children : emptySeats(3);
  const grandchildren = [0, 1, 2].map((g) =>
    data.grandchildren[g]?.length ? data.grandchildren[g] : emptySeats(3),
  );

  const filledL1 = children.filter((c) => isFilled(c.address));
  const filledL2 = grandchildren.flat().filter((c) => isFilled(c.address));
  // Per selected package matrix — exclude root (yourself); Total uses contract downline
  const downlineTotal = Math.max(0, Number(data.downline) || 0);
  const totalMembers = downlineTotal > 0 ? downlineTotal : filledL1.length + filledL2.length;
  const activeMembers =
    filledL1.filter((c) => c.active).length + filledL2.filter((c) => c.active).length;
  const totalVisible = 1 + filledL1.length + filledL2.length;
  const emptyPositions = 1 + 3 + 9 - totalVisible;
  const isMeRoot = data.root.toLowerCase() === account.toLowerCase();
  const canGoUp = isFilled(data.parent);
  const pathLabels = path.length ? path : [data.root || account];
  const pkgLabel = pkgName(packageId);

  const counts = useMemo(
    () => ({
      total: totalMembers,
      active: activeMembers,
      empty: Math.max(0, emptyPositions),
    }),
    [totalMembers, activeMembers, emptyPositions],
  );

  async function openSubtree(addr: string) {
    if (!isFilled(addr)) return;
    setModalOpen(true);
    setModalLoading(true);
    try {
      const tree = await loadSubtree(addr);
      setModalData(tree);
      setModalStack((prev) => {
        if (!prev.length) return [addr];
        const idx = prev.findIndex((a) => a.toLowerCase() === addr.toLowerCase());
        if (idx >= 0) return prev.slice(0, idx + 1);
        return [...prev, addr];
      });
    } catch {
      setModalData(null);
    } finally {
      setModalLoading(false);
    }
  }

  async function jumpModalStack(index: number) {
    const addr = modalStack[index];
    if (!addr) return;
    setModalLoading(true);
    try {
      const tree = await loadSubtree(addr);
      setModalData(tree);
      setModalStack((s) => s.slice(0, index + 1));
    } catch {
      setModalData(null);
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setModalData(null);
    setModalStack([]);
  }

  useEffect(() => {
    if (!modalOpen && !infoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modalOpen) closeModal();
        else if (infoOpen) setInfoOpen(false);
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [modalOpen, infoOpen]);

  const sidePanel = (
    <>
      <div className="mx-side-card">
        <div className="mx-side-user">
          <div className={cn("mx-side-avatar", data.active ? "on" : "off")}>
            <User className="h-7 w-7" />
          </div>
          <div className="mx-side-user-meta">
            <h4>{isMeRoot ? "Your Position" : shortAddr(data.root)}</h4>
            <p className="font-mono text-2xs text-muted">{shortAddr(data.root, 8)}</p>
            <span className="badge badge-gold mt-2">
              {pkgName(packageId)}
              {activePackageId === packageId ? " · Active" : ""}
            </span>
          </div>
        </div>
        <ul className="mx-side-list">
          <li>
            <span>Sponsor</span>
            <strong
              className={cn(canGoUp && "mx-link")}
              role={canGoUp ? "button" : undefined}
              tabIndex={canGoUp ? 0 : undefined}
              onClick={() => canGoUp && onGoUp()}
              onKeyDown={(e) => {
                if (canGoUp && (e.key === "Enter" || e.key === " ")) onGoUp();
              }}
            >
              {shortAddr(sponsor || data.parent)}
            </strong>
          </li>
          <li>
            <span>Joined</span>
            <strong>{joinedLabel || "—"}</strong>
          </li>
          <li>
            <span>Status</span>
            <strong className={data.active ? "text-leaf-400" : "text-danger"}>
              <i className={cn("status-dot", data.active ? "active" : "inactive")} />
              {isGlobal
                ? data.globalQualified
                  ? "Global Qualified"
                  : "Not in Global yet"
                : data.active
                  ? "Active"
                  : "Inactive"}
            </strong>
          </li>
        </ul>
      </div>

      <div className="mx-side-card">
        <h4 className="mx-side-title">{isGlobal ? "Global Autopool Info" : "Matrix Info"}</h4>
        <ul className="mx-side-list">
          <li>
            <span>Tree Type</span>
            <strong>{matrixTypeLabel}</strong>
          </li>
          <li>
            <span>Package</span>
            <strong>
              {pkgName(packageId)}
              {activePackageId === packageId ? " · Active" : ""}
            </strong>
          </li>
          {isGlobal ? (
            <li>
              <span>Entry (3 directs)</span>
              <strong
                className={
                  data.globalQualified ? "text-leaf-400" : "text-solar-400"
                }
              >
                {Math.min(3, data.matrixDirects ?? data.childrenCount)}/3
                {data.globalQualified ? " · Qualified" : " · Pending"}
              </strong>
            </li>
          ) : null}
          <li>
            <span>{isGlobal ? "Global children" : "Children"}</span>
            <strong>{data.childrenCount}/3</strong>
          </li>
          <li>
            <span>{isGlobal ? "Global downline" : "Downline"}</span>
            <strong>{data.downline}</strong>
          </li>
          <li>
            <span>Empty Positions</span>
            <strong>{counts.empty}</strong>
          </li>
          <li>
            <span>{earningsLabel}</span>
            <strong className="text-leaf-400">{earningsValue || "—"}</strong>
          </li>
        </ul>
      </div>

      <div className="mx-side-card">
        <h4 className="mx-side-title">Legend</h4>
        <ul className="mx-legend-list">
          <li>
            <i className="dot active" />
            <div>
              <strong>Active</strong>
              <p>Seat filled &amp; matrix active</p>
            </div>
          </li>
          <li>
            <i className="dot inactive" />
            <div>
              <strong>Inactive</strong>
              <p>Address present, matrix off</p>
            </div>
          </li>
          <li>
            <i className="dot empty" />
            <div>
              <strong>Empty</strong>
              <p>Open slot waiting for fill</p>
            </div>
          </li>
        </ul>
      </div>
    </>
  );

  return (
    <div className={cn("mx-dash", loading && "mx-loading")}>
      <header className="mx-dash-head">
        <div className="mx-dash-brand">
          <span className="mx-dash-brand-ico">
            <Network className="h-5 w-5" />
          </span>
          <div>
            <h2>{treeTitle}</h2>
            <p>{treeSubtitle}</p>
          </div>
        </div>
        <div className="mx-dash-head-actions">
          <button
            className="btn btn-ghost btn-sm mx-info-trigger"
            type="button"
            onClick={() => setInfoOpen(true)}
          >
            <Info className="h-3.5 w-3.5" />
            Info
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onGoHome}>
            <Home className="h-3.5 w-3.5" />
            Home
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onGoUp} disabled={!canGoUp}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Up
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          <div className="mx-pkg-menu">
            <button
              type="button"
              className="mx-pkg-trigger"
              onClick={() => setPkgOpen((v) => !v)}
              aria-expanded={pkgOpen}
            >
              <Layers className="h-4 w-4" />
              {PACKAGE_NAMES[packageId]}
              {activePackageId === packageId ? " · Active" : ""}
              <ChevronDown className="h-4 w-4 opacity-70" />
            </button>
            {pkgOpen && (
              <div className="mx-pkg-dropdown">
                {[1, 2, 3, 4, 5].map((id) => {
                  const owned = activePackageId > 0 && id <= activePackageId;
                  const isActivePkg = id === activePackageId;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={cn(id === packageId && "active", !owned && "disabled")}
                      disabled={!owned && activePackageId > 0}
                      onClick={() => {
                        if (!owned && activePackageId > 0) return;
                        onPackageChange(id);
                        setPkgOpen(false);
                      }}
                    >
                      {PACKAGE_NAMES[id]}
                      {isActivePkg ? " · Active" : owned ? " · Owned" : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      {onTreeModeChange && (
        <div className="mx-mode-toggle" role="tablist" aria-label="Tree type">
          <button
            type="button"
            role="tab"
            aria-selected={!isGlobal}
            className={cn("mx-mode-btn", !isGlobal && "active")}
            onClick={() => onTreeModeChange("matrix")}
          >
            <GitBranch className="h-4 w-4" />
            Matrix Tree
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isGlobal}
            className={cn("mx-mode-btn", isGlobal && "active")}
            onClick={() => onTreeModeChange("global")}
          >
            <Network className="h-4 w-4" />
            Global Autopool
          </button>
        </div>
      )}

      <div className="mx-pkg-tabs" role="tablist" aria-label="Package matrix">
        {[1, 2, 3, 4, 5].map((id) => {
          const owned = activePackageId > 0 && id <= activePackageId;
          const isActivePkg = id === activePackageId;
          const selected = id === packageId;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn("mx-pkg-tab", selected && "active", !owned && "disabled")}
              disabled={!owned && activePackageId > 0}
              onClick={() => {
                if (!owned && activePackageId > 0) return;
                onPackageChange(id);
                setPkgOpen(false);
              }}
            >
              <span>{PACKAGE_NAMES[id]}</span>
              {isActivePkg ? <em>Active</em> : owned ? <em>Owned</em> : null}
            </button>
          );
        })}
      </div>

      <div className="mx-breadcrumb" aria-label="Matrix path">
        {pathLabels.map((addr, i) => {
          const last = i === pathLabels.length - 1;
          return (
            <span key={`${addr}-${i}`} className="mx-crumb">
              {i > 0 && <ChevronRight className="mx-crumb-sep h-3 w-3" />}
              <button
                type="button"
                className={cn("mx-crumb-btn", last && "active")}
                title={last ? "Click to copy ID" : "Go to this position"}
                aria-label={last ? `Copy ID ${addr}` : `Go to ${shortAddr(addr)}`}
                onClick={() => {
                  if (last) onCopy(addr);
                  else onPathJump(i);
                }}
              >
                {i === 0 && addr.toLowerCase() === account.toLowerCase()
                  ? "You"
                  : shortAddr(addr)}
              </button>
            </span>
          );
        })}
      </div>

      <div className="mx-kpi-row">
        <StatCard
          label={isGlobal ? `Global Downline · ${pkgLabel}` : `Total Members · ${pkgLabel}`}
          value={counts.total}
          tone="gold"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label={earningsLabel}
          value={earningsValue || "—"}
          tone="leaf"
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard label="Rank" value={data.ctoRank || "—"} tone="amber" icon={<Layers className="h-5 w-5" />} />
      </div>

      <div className="mx-dash-grid">
        <div className="mx-tree-panel">
          <div className="mx-tree-panel-head">
            <h3>
              {isGlobal ? "Global Autopool View" : "Matrix Tree View"}
              <span className="mx-tree-pkg-tag">{pkgName(packageId)}</span>
            </h3>
            <div className="mx-mini-legend">
              <span>
                <i className="dot active" /> Active
              </span>
              <span>
                <i className="dot inactive" /> Inactive
              </span>
              <span>
                <i className="dot empty" /> Empty
              </span>
            </div>
          </div>

          {!data.active && activePackageId > 0 && packageId === activePackageId && !isGlobal && (
            <div className="mx-tree-empty-hint">
              Your {pkgName(packageId)} matrix seat is not active yet. Buy or refresh after purchase.
            </div>
          )}
          {isGlobal && activePackageId > 0 && data.globalQualified === false && (
            <div className="mx-tree-empty-hint">
              Complete <strong>3 matrix directs</strong> on {pkgName(packageId)} to enter Global
              Autopool ({Math.min(3, data.matrixDirects ?? data.childrenCount)}/3). Qualified members
              from your matrix appear here as they fill their 3 directs.
            </div>
          )}
          {activePackageId === 0 && (
            <div className="mx-tree-empty-hint">
              No active package. Register and buy Starter to open your matrix &amp; global autopool tree.
            </div>
          )}

          <div className="mx-tree-scroll" ref={scrollRef}>
            {loading && (
              <div className="mx-tree-loading">
                <Loader2 className="h-6 w-6 animate-spin text-solar-400" />
                <p>Loading {isGlobal ? "global autopool" : "matrix"} tree…</p>
              </div>
            )}
            <TreeBoard
              account={account}
              packageId={packageId}
              data={data}
              globalMode={isGlobal}
              onOpen={(addr) => void openSubtree(addr)}
              onCopy={onCopy}
            />
          </div>

          <div className="mx-tree-foot">
            <p>
              {isGlobal
                ? "Only members who completed 3 matrix directs are placed in Global Autopool — tree & downline show those users."
                : "Click any filled node to open its downline · Home / Up / breadcrumb navigate main view"}
            </p>
            {onUpgrade && (
              <button
                type="button"
                className={`btn btn-primary mx-upgrade-btn${canUpgrade && !upgradeDisabled ? " btn-blink" : ""}`}
                disabled={upgradeDisabled || (!canUpgrade && activePackageId >= 5)}
                onClick={onUpgrade}
              >
                {upgradeLabel}
                <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <aside className="mx-side mx-side-desktop">{sidePanel}</aside>
      </div>

      {portalReady &&
        infoOpen &&
        createPortal(
          <div className="mx-info-sheet-root" role="dialog" aria-modal="true" aria-label="Position info">
            <button
              type="button"
              className="mx-modal-overlay"
              aria-label="Close"
              onClick={() => setInfoOpen(false)}
            />
            <div className="mx-info-sheet">
              <div className="mx-info-sheet-head">
                <div className="mx-info-sheet-handle" aria-hidden />
                <div className="mx-info-sheet-title-row">
                  <h3>Your Position</h3>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Close info"
                    onClick={() => setInfoOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mx-info-sheet-body">{sidePanel}</div>
            </div>
          </div>,
          document.body,
        )}

      {portalReady &&
        modalOpen &&
        createPortal(
          <div className="mx-modal-root" role="dialog" aria-modal="true" aria-label="Node subtree">
            <button type="button" className="mx-modal-overlay" aria-label="Close" onClick={closeModal} />
            <div className="mx-modal-panel">
              <div className="mx-modal-head">
                <div>
                  <h3>{isGlobal ? "Global Autopool Downline" : "Matrix Downline"}</h3>
                  <p className="font-mono text-sm text-muted">
                    {modalData ? shortAddr(modalData.root, 8) : "Loading…"}
                  </p>
                </div>
                <div className="mx-modal-actions">
                  {modalStack.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={modalLoading}
                      onClick={() => void jumpModalStack(modalStack.length - 2)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Back
                    </button>
                  )}
                  {modalData && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        onFocus(modalData.root);
                        closeModal();
                      }}
                    >
                      Focus main view
                    </button>
                  )}
                  <button type="button" className="icon-btn" aria-label="Close modal" onClick={closeModal}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {modalStack.length > 0 && (
                <div className="mx-breadcrumb mx-modal-crumbs">
                  {modalStack.map((addr, i) => {
                    const last = i === modalStack.length - 1;
                    return (
                      <span key={`${addr}-${i}`} className="mx-crumb">
                        {i > 0 && <ChevronRight className="mx-crumb-sep h-3 w-3" />}
                        <button
                          type="button"
                          className={cn("mx-crumb-btn", last && "active")}
                          disabled={!last && modalLoading}
                          title={last ? "Click to copy ID" : "Go to this position"}
                          aria-label={last ? `Copy ID ${addr}` : `Go to ${shortAddr(addr)}`}
                          onClick={() => {
                            if (last) onCopy(addr);
                            else void jumpModalStack(i);
                          }}
                        >
                          {addr.toLowerCase() === account.toLowerCase() ? "You" : shortAddr(addr)}
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="mx-modal-body">
                {modalLoading && (
                  <div className="mx-modal-loading">
                    <Loader2 className="h-6 w-6 animate-spin text-solar-400" />
                    <p>Loading subtree…</p>
                  </div>
                )}
                {!modalLoading && modalData && (
                  <div className="mx-tree-scroll" ref={modalScrollRef}>
                    <TreeBoard
                      account={account}
                      packageId={packageId}
                      data={modalData}
                      globalMode={isGlobal}
                      compact
                      onOpen={(addr) => void openSubtree(addr)}
                      onCopy={onCopy}
                    />
                  </div>
                )}
                {!modalLoading && !modalData && (
                  <p className="text-muted text-center py-8">Could not load this node&apos;s tree.</p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
