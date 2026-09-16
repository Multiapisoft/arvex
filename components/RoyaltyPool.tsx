"use client";

import { Trophy, Users } from "lucide-react";
import { EXPLORER_BASE, ROYALTY_DIRECTS } from "@/lib/contract";
import { explorerAddress, fmtUsd, shortAddr } from "@/lib/format";

export type RoyaltyMemberRow = {
  address: string;
  directs: number;
  inPool: boolean;
  blocked: boolean;
  mainId: bigint;
  earnedRoyalty: bigint;
  withdrawn: bigint;
};

type Props = {
  pool: bigint;
  epoch: bigint;
  memberCount: number;
  members: RoyaltyMemberRow[];
  loading?: boolean;
  decimals: number;
  youQualified: boolean;
  yourDirects: number;
  youAddress?: string;
};

export function RoyaltyPool({
  pool,
  epoch,
  memberCount,
  members,
  loading,
  decimals,
  youQualified,
  yourDirects,
  youAddress,
}: Props) {
  const need = Math.max(0, ROYALTY_DIRECTS - yourDirects);
  const progress = Math.min(100, (yourDirects / ROYALTY_DIRECTS) * 100);
  const perMember = memberCount > 0 ? pool / BigInt(memberCount) : 0n;

  return (
    <section className="mx-dash">
      <div className="mx-dash-head">
        <div className="mx-dash-brand">
          <span className="mx-dash-brand-ico">
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <h2>Royalty pool</h2>
            <p>$0.25 per paid ID. Equal monthly split for wallets with {ROYALTY_DIRECTS} directs.</p>
          </div>
        </div>
        <span className={youQualified ? "badge badge-green" : "badge badge-gold"}>
          {youQualified ? "You are qualified" : `${yourDirects}/${ROYALTY_DIRECTS} directs`}
        </span>
      </div>

      <div className="mx-kpi-row">
        <div className="mx-kpi tone-leaf">
          <div>
            <div className="mx-kpi-label">Current pool</div>
            <div className="mx-kpi-value">{fmtUsd(pool, decimals)}</div>
          </div>
          <span className="mx-kpi-icon">
            <Trophy className="h-5 w-5" />
          </span>
        </div>
        <div className="mx-kpi tone-green">
          <div>
            <div className="mx-kpi-label">Qualified members</div>
            <div className="mx-kpi-value">{memberCount}</div>
          </div>
          <span className="mx-kpi-icon">
            <Users className="h-5 w-5" />
          </span>
        </div>
        <div className="mx-kpi tone-gold">
          <div>
            <div className="mx-kpi-label">Est. per member</div>
            <div className="mx-kpi-value">{fmtUsd(perMember, decimals)}</div>
          </div>
        </div>
        <div className="mx-kpi tone-amber">
          <div>
            <div className="mx-kpi-label">Epoch</div>
            <div className="mx-kpi-value">{epoch.toString()}</div>
          </div>
        </div>
      </div>

      <div className="mx-tree-panel">
        <div className="mx-tree-panel-head">
          <h3>Your qualification</h3>
        </div>
        <div className="mc-level-bar mb-2">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-muted">
          {youQualified
            ? "You are in this month’s royalty list."
            : `Need ${need} more direct${need === 1 ? "" : "s"} to enter.`}
        </p>
      </div>

      <div className="mx-tree-panel">
        <div className="mx-tree-panel-head">
          <h3>All royalty members ({memberCount})</h3>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading royalty members…</p>
        ) : members.length === 0 ? (
          <p className="mx-tree-empty-hint">No royalty members yet. Give {ROYALTY_DIRECTS} directs to enter.</p>
        ) : (
          <div className="team-table-wrap">
            <table className="data-table team-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Wallet</th>
                  <th>Main ID</th>
                  <th>Directs</th>
                  <th>Royalty earned</th>
                  <th>Withdrawn</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr
                    key={m.address}
                    className={
                      youAddress && m.address.toLowerCase() === youAddress.toLowerCase() ? "royalty-you" : undefined
                    }
                  >
                    <td>{i + 1}</td>
                    <td className="font-mono">
                      <a href={explorerAddress(m.address, EXPLORER_BASE)} target="_blank" rel="noopener noreferrer">
                        {shortAddr(m.address, 6)}
                      </a>
                    </td>
                    <td>{m.mainId > 0n ? `#${m.mainId.toString()}` : "—"}</td>
                    <td>{m.directs}</td>
                    <td>{fmtUsd(m.earnedRoyalty, decimals)}</td>
                    <td>{fmtUsd(m.withdrawn, decimals)}</td>
                    <td>
                      {m.blocked ? (
                        <span className="badge badge-danger">Blocked</span>
                      ) : m.inPool ? (
                        <span className="badge badge-green">In pool</span>
                      ) : (
                        <span className="text-muted">Out</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
