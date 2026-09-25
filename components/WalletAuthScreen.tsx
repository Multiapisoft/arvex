"use client";

import Image from "next/image";
import {
  ArrowUpRight,
  GitBranch,
  HeartHandshake,
  Loader2,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { APP_NAME_FULL, APP_TAGLINE, JOIN_USD, PAYMENT_TOKEN_SYMBOL } from "@/lib/contract";

type LoginProps = {
  mode: "login";
  onConnect: () => void;
  busy?: boolean;
};

type CheckingProps = {
  mode: "checking";
  accountLabel: string;
};

type RegisterProps = {
  mode: "register";
  accountLabel: string;
  sponsorInput: string;
  onSponsorChange: (value: string) => void;
  onRegisterBuy: () => void;
  onDisconnect: () => void;
  busy?: boolean;
};

export type WalletAuthScreenProps = LoginProps | CheckingProps | RegisterProps;

const FEATURES = [
  {
    icon: HeartHandshake,
    title: "One-time $5 help",
    text: `Join once with ${PAYMENT_TOKEN_SYMBOL}. Your small help can change many lives.`,
  },
  {
    icon: GitBranch,
    title: "Global 4×6 Matrix",
    text: "4-ID matrix, 6 levels. L1 complete → $4, L2 → $10, then $25 / $60 / $150 / $375.",
  },
  {
    icon: Users,
    title: "Directs & Virtual IDs",
    text: "Track every direct. Virtual IDs stay linked to your main ID.",
  },
  {
    icon: Trophy,
    title: "Royalty pool",
    text: "20 directs qualify you. Admin splits the pool equally each month.",
  },
] as const;

export function WalletAuthScreen(props: WalletAuthScreenProps) {
  return (
    <div className="wallet-auth">
      <div className="wallet-auth-bg" aria-hidden />
      <div className="wallet-auth-veil" aria-hidden />

      <div className="wallet-auth-grid">
        <section className="wallet-auth-brand">
          <div className="wallet-auth-logo-wrap">
            <span className="wallet-auth-rings" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </span>
            <div className="wallet-auth-logo">
              <Image
                src="/logo.png"
                alt={APP_NAME_FULL}
                width={88}
                height={88}
                priority
                className="wallet-auth-logo-img rounded-full"
              />
            </div>
          </div>

          <h1 className="wallet-auth-title">
            <span className="text-solar-400">AR</span>VEX
          </h1>
          <p className="wallet-auth-sub">{APP_TAGLINE}</p>
          <p className="wallet-auth-desc">
            One-time ${JOIN_USD} helping contribution · Direct · Global Matrix · Royalty. Connect your
            wallet on BNB Smart Chain ({PAYMENT_TOKEN_SYMBOL}).
          </p>

          <ul className="wallet-auth-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="wallet-auth-feature-icon">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="wallet-auth-panel">
          <div className="wallet-auth-card">
            {props.mode === "login" && (
              <>
                <span className="wallet-auth-card-icon">
                  <Wallet className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <h2>Connect Wallet</h2>
                <p className="wallet-auth-card-hint">Use MetaMask or Trust Wallet to continue.</p>
                <button
                  type="button"
                  className="btn btn-primary btn-lg btn-block wallet-auth-cta"
                  onClick={props.onConnect}
                  disabled={props.busy}
                >
                  <Wallet className="h-4 w-4" />
                  Connect Wallet
                </button>
                <p className="wallet-auth-network">
                  Target network: BNB Smart Chain — chainId 56 · {PAYMENT_TOKEN_SYMBOL}
                </p>
              </>
            )}

            {props.mode === "checking" && (
              <>
                <span className="wallet-auth-card-icon">
                  <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.6} />
                </span>
                <h2>Checking account</h2>
                <p className="wallet-auth-card-hint">
                  Reading on-chain registration for{" "}
                  <span className="font-mono text-solar-300">{props.accountLabel}</span>
                </p>
                <p className="wallet-auth-network">New users open Join · Existing users go to Dashboard</p>
              </>
            )}

            {props.mode === "register" && (
              <>
                <span className="wallet-auth-card-icon">
                  <ArrowUpRight className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <h2>Join the Plan</h2>
                <p className="wallet-auth-card-hint">
                  Wallet <span className="font-mono text-solar-300">{props.accountLabel}</span> is new
                  — one-time ${JOIN_USD} {PAYMENT_TOKEN_SYMBOL} helping contribution.
                </p>

                <div className="field w-full text-left">
                  <label className="label" htmlFor="sponsor">
                    Referrer Address
                  </label>
                  <input
                    id="sponsor"
                    className="input input-mono"
                    value={props.sponsorInput}
                    onChange={(e) => props.onSponsorChange(e.target.value.trim())}
                    placeholder="Official root referrer if empty"
                    spellCheck={false}
                    disabled={props.busy}
                  />
                </div>

                <p className="wallet-auth-card-hint !mb-0 text-left text-2xs">
                  Empty referrer joins under the official root. Join opens <strong>2 wallet popups</strong>
                  : (1) Approve ${JOIN_USD} {PAYMENT_TOKEN_SYMBOL}, then (2) Register.
                </p>

                <div className="flex w-full flex-col gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg btn-block wallet-auth-cta"
                    onClick={props.onRegisterBuy}
                    disabled={props.busy}
                  >
                    Join · ${JOIN_USD} {PAYMENT_TOKEN_SYMBOL}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-block text-muted"
                    onClick={props.onDisconnect}
                    disabled={props.busy}
                  >
                    Disconnect wallet
                  </button>
                </div>

                <p className="wallet-auth-network">
                  Target network: BNB Smart Chain — chainId 56 · {PAYMENT_TOKEN_SYMBOL}
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
