"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  Copy,
  GitBranch,
  Layers,
  Lock,
  RefreshCw,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";
import { ZeroAddress, isAddress } from "ethers";
import { EXPLORER_BASE, LEVEL_IDS, LEVEL_INCOME_USD, REQUIRED_DIRECTS, VIRTUAL_ON_COMPLETE } from "@/lib/contract";
import { explorerAddress, fmtUsd, shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MatrixChild = {
  id: bigint;
  owner: string;
  isVirtual: boolean;
};

export type MatrixOverviewData = {
  filled: number[];
  capacity: number[];
  completed: boolean[];
  earned: bigint[];
  pending: bigint[];
  qualified: boolean[];
  held: bigint[];
};

type PositionOption = {
  id: bigint;
  isVirtual: boolean;
};

type Props = {
  positionId: bigint;
  isVirtual: boolean;
  mainId: bigint;
  owner: string;
  account: string;
  decimals: number;
  overview: MatrixOverviewData | null;
  slots: MatrixChild[];
  grandchildren: MatrixChild[][];
  levelUsers: MatrixChild[];
  levelFilled: number;
  levelCapacity: number;
  levelOffset: number;
  viewLevel: number;
  path?: bigint[];
  positions?: PositionOption[];
  onViewLevel: (level: number) => void;
  onPage: (nextOffset: number) => void;
  onSelectId?: (id: bigint) => void;
  onBack?: () => void;
  loading?: boolean;
  onRefresh: () => void;
  onOpenChild: (id: bigint) => void;
};

function filledAddr(addr: string) {
  return Boolean(addr && addr !== ZeroAddress && isAddress(addr));
}

function isFilledChild(child?: MatrixChild) {
  return Boolean(child && child.id > 0n && filledAddr(child.owner));
}

function emptyChild(): MatrixChild {
  return { id: 0n, owner: "", isVirtual: false };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function MatrixNode({
  child,
  size = "md",
  isRoot,
  slotLabel,
  onOpen,
}: {
  child: MatrixChild;
  size?: "lg" | "md" | "sm";
  isRoot?: boolean;
  slotLabel: string;
  onOpen: (id: bigint) => void;
}) {
  const filled = isFilledChild(child);
  const status = isRoot ? "you" : !filled ? "empty" : child.isVirtual ? "virtual" : "paid";
  const [hover, setHover] = useState(false);
  const title = filled ? `#${child.id.toString()}` : "Empty";
  const subtitle = isRoot
    ? child.isVirtual
      ? "Virtual ID"
      : "Main ID"
    : filled
      ? child.isVirtual
        ? "Virtual"
        : "Paid"
      : slotLabel;

  return (
    <div
      className={cn("mx-node", `mx-node-${size}`, `is-${status}`, filled && !isRoot && "is-clickable")}
      role={filled && !isRoot ? "button" : undefined}
      tabIndex={filled && !isRoot ? 0 : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (filled && !isRoot) onOpen(child.id);
      }}
      onKeyDown={(e) => {
        if (!filled || isRoot) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(child.id);
        }
      }}
    >
      <div className="mx-node-avatar" aria-hidden>
        {filled ? child.isVirtual ? <Sparkles className="mx-node-ico" /> : <User className="mx-node-ico" /> : <span className="mx-node-empty-dot" />}
      </div>
      <div className="mx-node-body">
        <div className="mx-node-name-row">
          <span className="mx-node-name">{title}</span>
          {isRoot && <span className="mx-you-tag">You</span>}
        </div>
        <span className={cn("mx-node-level", `tone-${status === "you" ? "active" : status}`)}>
          {subtitle}
        </span>
        {filled && size !== "sm" && <span className="mx-node-addr">{shortAddr(child.owner, 4)}</span>}
      </div>
      {filled && hover && (
        <div className="mx-node-tip" onClick={(e) => e.stopPropagation()}>
          <code>
            #{child.id.toString()} · {shortAddr(child.owner, 6)}
          </code>
          <button type="button" className="icon-btn" aria-label="Copy wallet" onClick={() => void copyText(child.owner)}>
            <Copy className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function Fork4() {
  return (
    <div className="mx-fork mx-fork-4" aria-hidden>
      <span className="mx-fork-stem" />
      <span className="mx-fork-bar" />
      <span className="mx-fork-leg" />
      <span className="mx-fork-leg" />
      <span className="mx-fork-leg" />
      <span className="mx-fork-leg" />
    </div>
  );
}

export function MatrixBoard({
  positionId,
  isVirtual,
  mainId,
  owner,
  account,
  decimals,
  overview,
  slots,
  grandchildren = [],
  levelUsers = [],
  levelFilled = 0,
  levelCapacity = 0,
  levelOffset = 0,
  viewLevel,
  path = [],
  positions = [],
  onViewLevel,
  onPage,
  onSelectId,
  onBack,
  loading,
  onRefresh,
  onOpenChild,
}: Props) {
  const pageSize = 64;
  const canPrev = levelOffset > 0;
  const canNext = levelOffset + pageSize < levelCapacity;
  const l1 = [0, 1, 2, 3].map((i) => slots[i] ?? emptyChild());
  const l2 = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => grandchildren[i]?.[j] ?? emptyChild()));
  const l1Filled = l1.filter(isFilledChild).length;
  const l2Filled = l2.flat().filter(isFilledChild).length;
  const paidLevels = overview?.completed.filter(Boolean).length ?? 0;
  const earnedTotal = overview?.earned.reduce((a, b) => a + b, 0n) ?? 0n;
  const pendingTotal = overview?.pending.reduce((a, b) => a + b, 0n) ?? 0n;
  const heldTotal = overview?.held?.reduce((a, b) => a + b, 0n) ?? 0n;
  const idOptions = positions.length ? positions : [{ id: positionId, isVirtual }];

  return (
    <div className={cn("mx-dash", loading && "mx-loading")}>
      <div className="mx-dash-head">
        <div className="mx-dash-brand">
          <span className="mx-dash-brand-ico">
            <GitBranch className="h-5 w-5" />
          </span>
          <div>
            <h2>Global 4×6 Matrix</h2>
            <p>
              ID #{positionId.toString() || "—"} · {isVirtual ? "Virtual" : "Main"}
              {isVirtual ? ` · linked to #${mainId.toString()}` : ""} · {shortAddr(owner || account, 6)}
            </p>
          </div>
        </div>
        <div className="mx-dash-head-actions">
          {path.length > 1 && onBack && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}
          {onSelectId && (
            <select
              className="input"
              value={positionId.toString()}
              onChange={(e) => onSelectId(BigInt(e.target.value))}
            >
              {idOptions.map((p) => (
                <option key={p.id.toString()} value={p.id.toString()}>
                  #{p.id.toString()} {p.isVirtual ? "· virtual" : "· main"}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mx-kpi-row">
        <div className="mx-kpi tone-leaf">
          <div>
            <div className="mx-kpi-label">Level 1</div>
            <div className="mx-kpi-value">
              {l1Filled}/4
            </div>
          </div>
          <span className="mx-kpi-icon">
            <Layers className="h-5 w-5" />
          </span>
        </div>
        <div className="mx-kpi tone-green">
          <div>
            <div className="mx-kpi-label">Level 2</div>
            <div className="mx-kpi-value">{l2Filled}/16</div>
          </div>
          <span className="mx-kpi-icon">
            <GitBranch className="h-5 w-5" />
          </span>
        </div>
        <div className="mx-kpi tone-gold">
          <div>
            <div className="mx-kpi-label">Matrix earned</div>
            <div className="mx-kpi-value">{fmtUsd(earnedTotal, decimals)}</div>
          </div>
          <span className="mx-kpi-icon">
            <Wallet className="h-5 w-5" />
          </span>
        </div>
        <div className="mx-kpi tone-amber">
          <div>
            <div className="mx-kpi-label">Levels paid</div>
            <div className="mx-kpi-value">{paidLevels}/6</div>
          </div>
          <span className="mx-kpi-icon">
            <CheckCircle2 className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="mc-level-strip">
        {LEVEL_IDS.map((cap, i) => {
          const filled = overview?.filled[i] ?? 0;
          const done = overview?.completed[i] ?? false;
          const qualified = overview?.qualified[i] ?? true;
          const pct = Math.min(100, (filled / cap) * 100);
          const active = viewLevel === i + 1;
          return (
            <button
              key={cap}
              type="button"
              className={cn("mc-level-card", active && "is-active", done && "is-paid", !qualified && "is-locked")}
              onClick={() => onViewLevel(i + 1)}
            >
              <div className="mc-level-card-top">
                <span>L{i + 1}</span>
                <strong>${LEVEL_INCOME_USD[i]}</strong>
              </div>
              <div className="mc-level-bar">
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="mc-level-card-meta">
                <span>
                  {filled}/{cap}
                </span>
                {done ? (
                  <em>Paid</em>
                ) : !qualified ? (
                  <em>
                    <Lock className="inline h-3 w-3" /> {REQUIRED_DIRECTS[i]} directs
                  </em>
                ) : VIRTUAL_ON_COMPLETE[i] > 0 ? (
                  <em>+{VIRTUAL_ON_COMPLETE[i]} virtual</em>
                ) : (
                  <em>Open</em>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mx-dash-grid">
        <div className="mx-tree-panel">
          <div className="mx-tree-panel-head">
            <h3>Live tree</h3>
            <div className="mx-mini-legend">
              <span>
                <i className="dot mx-dot-paid" /> Paid
              </span>
              <span>
                <i className="dot mx-dot-virtual" /> Virtual
              </span>
              <span>
                <i className="dot empty" /> Empty
              </span>
            </div>
          </div>

          {path.length > 1 && (
            <div className="mx-breadcrumb mb-3">
              {path.map((id, i) => (
                <span key={`${id.toString()}-${i}`} className="mx-crumb">
                  {i > 0 && <span className="mx-crumb-sep">/</span>}
                  <button
                    type="button"
                    className={cn("mx-crumb-btn", i === path.length - 1 && "active")}
                    onClick={() => onSelectId?.(id)}
                  >
                    #{id.toString()}
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mx-tree-scroll">
            {loading && (
              <div className="mx-tree-loading">
                <RefreshCw className="h-6 w-6 animate-spin text-solar-400" />
                <p>Loading matrix…</p>
              </div>
            )}
            <div className="mx-tree-board mx-tree-board-4">
              <div className="mx-level-block">
                <span className="mx-lvl-badge">Root</span>
                <div className="mx-level-nodes mx-level-nodes-1">
                  <MatrixNode
                    isRoot
                    size="lg"
                    slotLabel="You"
                    child={{ id: positionId, owner, isVirtual }}
                    onOpen={onOpenChild}
                  />
                </div>
              </div>

              <Fork4 />

              <div className="mx-level-block">
                <span className="mx-lvl-badge">Level 1</span>
                <div className="mx-level-nodes mx-level-nodes-4">
                  {l1.map((child, i) => (
                    <div key={i} className="mx-slot">
                      <MatrixNode slotLabel={`Slot ${i + 1}`} child={child} onOpen={onOpenChild} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mx-fork-row mx-fork-row-4" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="mx-branch-stem" />
                ))}
              </div>

              <div className="mx-level-block">
                <span className="mx-lvl-badge">Level 2</span>
                <div className="mx-level-nodes mx-level-nodes-4">
                  {l2.map((group, i) => (
                    <div key={i} className="mx-slot">
                      <div className="mx-slot-group-4">
                        {group.map((gc, j) => (
                          <MatrixNode
                            key={j}
                            size="sm"
                            slotLabel={`S${j + 1}`}
                            child={gc}
                            onOpen={onOpenChild}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="mx-side mx-side-desktop">
          <div className="mx-side-card">
            <div className="mx-side-user">
              <span className={cn("mx-side-avatar", isFilledChild({ id: positionId, owner, isVirtual }) ? "on" : "off")}>
                {isVirtual ? <Sparkles className="h-6 w-6" /> : <User className="h-6 w-6" />}
              </span>
              <div>
                <h4>#{positionId.toString() || "—"}</h4>
                <p className="text-sm text-muted">{shortAddr(owner || account, 8)}</p>
              </div>
            </div>
            <ul className="mx-side-list">
              <li>
                <span>Type</span>
                <strong>{isVirtual ? "Virtual ID" : "Main ID"}</strong>
              </li>
              {isVirtual && (
                <li>
                  <span>Linked main</span>
                  <strong>#{mainId.toString()}</strong>
                </li>
              )}
              <li>
                <span>Wallet</span>
                <strong>
                  <a href={explorerAddress(owner || account, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
                    {shortAddr(owner || account, 6)}
                  </a>
                </strong>
              </li>
              <li>
                <span>Held until complete</span>
                <strong>{fmtUsd(heldTotal, decimals)}</strong>
              </li>
              <li>
                <span>Pending unlock</span>
                <strong>{fmtUsd(pendingTotal, decimals)}</strong>
              </li>
            </ul>
          </div>

          <div className="mx-side-card">
            <h3 className="mx-side-title">Level income</h3>
            <ul className="mx-side-list">
              {LEVEL_IDS.map((cap, i) => (
                <li key={cap}>
                  <span>
                    L{i + 1} · {cap} IDs
                  </span>
                  <strong>
                    ${LEVEL_INCOME_USD[i]}
                    {overview?.completed[i]
                      ? " · paid"
                      : overview?.held?.[i] && overview.held[i] > 0n
                        ? ` · held ${fmtUsd(overview.held[i], decimals)}`
                        : ""}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <section className="mx-tree-panel">
        <div className="mx-tree-panel-head">
          <h3>
            All users · Level {viewLevel}{" "}
            <span className="text-muted">
              ({levelFilled}/{levelCapacity})
            </span>
          </h3>
          <div className="flex flex-wrap gap-1">
            {LEVEL_IDS.map((_, i) => (
              <button
                key={i}
                type="button"
                className={cn("btn btn-sm", viewLevel === i + 1 ? "btn-primary" : "btn-ghost")}
                onClick={() => onViewLevel(i + 1)}
              >
                L{i + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="team-table-wrap">
          <table className="data-table team-data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ID</th>
                <th>Wallet</th>
                <th>Type</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {levelUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    No IDs on this page yet.
                  </td>
                </tr>
              ) : (
                levelUsers.map((row, i) => {
                  const filled = isFilledChild(row);
                  return (
                    <tr key={`${row.id.toString()}-${i}`}>
                      <td>{levelOffset + i + 1}</td>
                      <td className="font-mono">#{row.id.toString()}</td>
                      <td className="font-mono">
                        {filled ? (
                          <a href={explorerAddress(row.owner, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
                            {shortAddr(row.owner, 6)}
                          </a>
                        ) : (
                          "Empty"
                        )}
                      </td>
                      <td>
                        {!filled ? (
                          <span className="text-muted">Open</span>
                        ) : row.isVirtual ? (
                          <span className="badge badge-green">Virtual</span>
                        ) : (
                          <span className="badge badge-gold">Paid</span>
                        )}
                      </td>
                      <td>
                        {filled && (
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => onOpenChild(row.id)}>
                            Open tree
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={!canPrev || loading}
            onClick={() => onPage(Math.max(0, levelOffset - 64))}
          >
            Prev
          </button>
          <span className="text-2xs text-muted">
            {levelCapacity === 0 ? "0 of 0" : `${levelOffset + 1}–${Math.min(levelCapacity, levelOffset + pageSize)} of ${levelCapacity}`}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={!canNext || loading}
            onClick={() => onPage(levelOffset + 64)}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
