"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MobileNav, type MobileNavItem } from "./MobileNav";

export type ShellNavItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
};

type AppShellProps = {
  title: string;
  subtitle?: string;
  navItems: ShellNavItem[];
  primaryNavItems?: MobileNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  headerRight?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
};

export function AppShell({
  title,
  subtitle = "BSC Testnet · USDC · Together We Help, Together We Grow",
  navItems,
  primaryNavItems,
  activeId,
  onNavigate,
  headerRight,
  contentClassName,
  children,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-1.5">
      <span className="logo-ripple">
        <Image
          src="/logo.png"
          alt="Multi Core"
          width={40}
          height={40}
          priority
          className="rounded-full drop-shadow-[0_0_10px_rgba(255,179,71,0.35)]"
        />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-base font-bold tracking-brand">
          <span className="text-solar-400">MULTI</span> CORE
        </span>
        <span className="mt-1 text-2xs tracking-label text-muted">{subtitle}</span>
      </span>
    </Link>
  );

  const nav = (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="nav-link w-full text-left"
            data-active={activeId === item.id}
            onClick={() => {
              onNavigate(item.id);
              setNavOpen(false);
            }}
          >
            {Icon && <Icon className="nav-icon" aria-hidden />}
            {item.label}
          </button>
        );
      })}
      {/* <Link href="/admin/login" className="nav-link mt-2" onClick={() => setNavOpen(false)}>
        Admin Panel
      </Link> */}
    </nav>
  );

  const bottomItems =
    primaryNavItems ??
    navItems
      .filter((item): item is ShellNavItem & { icon: LucideIcon } => Boolean(item.icon))
      .slice(0, 4)
      .map((item) => ({ id: item.id, label: item.label, icon: item.icon }));

  return (
    <div className="app-shell">
      <aside className="sidebar hidden md:flex">
        {brand}
        <div className="mt-6 flex-1 overflow-y-auto">{nav}</div>
        <p className="mt-4 px-1.5 text-2xs text-muted-foreground">BNB Testnet · chainId 97 · USDC</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="icon-btn md:hidden"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="topbar-logo md:hidden">
              <span className="topbar-logo-rings" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <Image
                src="/logo.png"
                alt="Multi Core"
                width={40}
                height={40}
                className="topbar-logo-img rounded-full"
              />
            </span>
            <h1 className="hidden truncate text-lg font-semibold text-foreground md:block">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-2">{headerRight}</div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-8">
          <div className={cn("mx-auto w-full", contentClassName)}>{children}</div>
        </main>
      </div>

      {bottomItems.length > 0 && (
        <MobileNav
          items={bottomItems}
          activeId={activeId}
          onNavigate={onNavigate}
          onOpenMenu={() => setNavOpen(true)}
        />
      )}

      {navOpen && (
        <>
          <button
            type="button"
            className="dialog-overlay z-50 md:hidden"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          />
          <div className="drawer-panel drawer-left z-[60] md:hidden">
            <div className="mb-4 flex items-center justify-between gap-2">
              {brand}
              <button type="button" className="icon-btn" onClick={() => setNavOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
          </div>
        </>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="stat">
      <div className={cn("stat-value", accent && "text-gradient-gold")}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
