"use client";

import Image from "next/image";
import {
  ArrowUpRight,
  Layers,
  Loader2,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

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
  onRegisterOnly: () => void;
  onDisconnect: () => void;
  busy?: boolean;
};

export type WalletAuthScreenProps = LoginProps | CheckingProps | RegisterProps;

const FEATURES = [
  {
    icon: Layers,
    title: "Packages",
    text: "Starter → Crown sequential upgrades on-chain.",
  },
  {
    icon: Users,
    title: "Matrix & Team",
    text: "3× autopool matrix with direct referrals.",
  },
  {
    icon: ShieldCheck,
    title: "Secure Fund",
    text: "Periodic secure-fund cycles with on-chain claims.",
  },
  {
    icon: Trophy,
    title: "CTO Reward",
    text: "Rank rewards from package CTO pools as downline grows.",
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
                alt="Falcone Capital"
                width={88}
                height={88}
                priority
                className="wallet-auth-logo-img rounded-full"
              />
            </div>
          </div>

          <h1 className="wallet-auth-title">
            <span className="text-solar-400">FALCONE</span> CAPITAL
          </h1>
          <p className="wallet-auth-sub">Packages · Matrix · Secure Fund · CTO Reward</p>
          <p className="wallet-auth-desc">
            Connect your wallet to join, upgrade packages, and manage income on
            BNB Smart Chain (USDT).
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
                <p className="wallet-auth-card-hint">
                  Use MetaMask or Trust Wallet to continue.
                </p>
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
                  Target network: BNB Smart Chain — chainId 56 · USDT
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
                <p className="wallet-auth-network">
                  New users open Register · Existing users go to Dashboard
                </p>
              </>
            )}

            {props.mode === "register" && (
              <>
                <span className="wallet-auth-card-icon">
                  <ArrowUpRight className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <h2>Register</h2>
                <p className="wallet-auth-card-hint">
                  Wallet{" "}
                  <span className="font-mono text-solar-300">{props.accountLabel}</span>
                  {" "}is new — complete registration before Dashboard.
                </p>

                <div className="field w-full text-left">
                  <label className="label" htmlFor="sponsor">
                    Sponsor Address
                  </label>
                  <input
                    id="sponsor"
                    className="input input-mono"
                    value={props.sponsorInput}
                    onChange={(e) => props.onSponsorChange(e.target.value.trim())}
                    placeholder="0x… sponsor wallet"
                    spellCheck={false}
                    disabled={props.busy}
                  />
                </div>

                <div className="field w-full text-left">
                  <label className="label">Package</label>
                  <select className="input" value={1} disabled>
                    <option value={1}>Starter — $50</option>
                  </select>
                </div>

                <p className="wallet-auth-card-hint !mb-0 text-left text-2xs">
                  Register &amp; Buy opens <strong>2 MetaMask popups</strong>: (1) Approve{" "}
                  {`$50`} token spend, then (2) Register. Confirm both — do not cancel the first.
                </p>

                <div className="flex w-full flex-col gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg btn-block wallet-auth-cta"
                    onClick={props.onRegisterBuy}
                    disabled={props.busy}
                  >
                    Register &amp; Buy Starter
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-block"
                    onClick={props.onRegisterOnly}
                    disabled={props.busy}
                  >
                    Register Only
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
                  Target network: BNB Smart Chain — chainId 56 · USDT
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
