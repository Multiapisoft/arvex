"use client";

import { Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type MobileNavProps = {
  items: MobileNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  onOpenMenu: () => void;
};

/** Fixed bottom navigation for mobile (primary items + full-menu trigger). */
export function MobileNav({ items, activeId, onNavigate, onOpenMenu }: MobileNavProps) {
  return (
    <nav className="mobile-nav md:hidden" aria-label="Primary">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            data-active={active}
            className="mobile-nav-item"
            onClick={() => onNavigate(item.id)}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button type="button" className="mobile-nav-item" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" aria-hidden />
        <span>Menu</span>
      </button>
    </nav>
  );
}
