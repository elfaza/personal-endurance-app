"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  Mountain,
  RefreshCw,
  Settings2,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTraining } from "./providers";
import { Button } from "./ui/button";
import { dateLabel, localDate } from "@/lib/dates";
const nav = [
  {
    href: "/dashboard",
    label: "Overview",
    mobile: "Home",
    icon: LayoutDashboard,
  },
  {
    href: "/calendar",
    label: "Training calendar",
    mobile: "Calendar",
    icon: CalendarDays,
  },
  {
    href: "/activities",
    label: "Activities",
    mobile: "Activities",
    icon: Activity,
  },
  {
    href: "/analytics",
    label: "Analytics",
    mobile: "Analytics",
    icon: BarChart3,
  },
  { href: "/settings", label: "Settings", mobile: "Settings", icon: Settings2 },
];
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, error, loading, offline, syncing, sync, refresh } =
    useTraining();
  const page = nav.find((n) => pathname.startsWith(n.href));
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand-icon">
            <Mountain size={25} strokeWidth={2} />
          </span>
          <span>
            personal<span className="brand-sub">ENDURANCE</span>
          </span>
        </Link>
        <div className="nav-label">YOUR TRAINING SPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`nav-item ${pathname.startsWith(n.href) ? "active" : ""}`}
            >
              <n.icon size={19} />
              {n.label}
              {pathname.startsWith(n.href) ? (
                <span className="nav-dot" />
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="eyebrow">THE LONG GAME</span>
            <Mountain size={45} strokeWidth={0.7} />
            <p>
              Small steps.
              <br />
              Stronger you.
            </p>
            <Link href="/analytics">
              See your progress <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="profile">
            <span className="avatar">PE</span>
            <div>
              <strong>Personal athlete</strong>
              <span>Running & cycling</span>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            Your training <ChevronRight size={13} />
            <span>{page?.label ?? "Activity details"}</span>
          </div>
          <div className="topbar-right">
            <span className="today-date">
              {dateLabel(localDate(), {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className={`sync-indicator ${offline ? "is-offline" : ""}`}>
              <span />
              {offline
                ? "Offline"
                : data?.mode === "demo"
                  ? "Demo workspace"
                  : "Connected"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void sync()}
              disabled={offline || syncing || loading}
            >
              <RefreshCw size={14} className={syncing ? "spin" : ""} />
              <span>{syncing ? "Syncing…" : "Sync now"}</span>
            </Button>
          </div>
        </header>
        <main id="main">
          <div className="mode-banner">
            {offline ? (
              <>
                <WifiOff size={14} /> Offline · previously loaded data is
                available for reading. Editing resumes when connected.
              </>
            ) : data?.mode === "demo" ? (
              <>
                <span className="demo-dot" /> DEMO WORKSPACE{" "}
                <span className="banner-divider" /> Sample training data.
                {data.configured.readOnly
                  ? " Read-only hosted preview. Connect Google Sheets to save training across devices."
                  : " Changes are saved locally on this server."}
                <Link href="/settings">
                  Connect your accounts <ArrowUpRight size={13} />
                </Link>
              </>
            ) : data && !data.configured.initialized ? (
              <>
                <span className="demo-dot" /> Set up your training workspace in
                Settings before adding workouts.
                <Link href="/settings">
                  Set up Sheets <ArrowUpRight size={13} />
                </Link>
              </>
            ) : (
              <>
                <ShieldCheck size={14} /> Private training workspace ·
                Asia/Jakarta · metric
              </>
            )}
          </div>
          {pathname !== "/settings/google" && error ? (
            <div className="error-state" role="alert">
              <strong>We couldn’t load your training.</strong>
              <p>{error.message}</p>
              <Button variant="outline" onClick={() => void refresh()}>
                Try again
              </Button>
              <Link href="/settings/google">Connection settings</Link>
            </div>
          ) : null}
          {loading && pathname !== "/settings/google" ? (
            <div className="loading-grid" aria-label="Loading training">
              <div className="skeleton skeleton-hero" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton skeleton-card" />
              ))}
            </div>
          ) : (
            children
          )}
          <footer className="page-footer">
            <span>PERSONAL ENDURANCE</span>
            <span>Built for the journey. Every session counts.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map((n) => (
          <Link
            href={n.href}
            key={n.href}
            className={pathname.startsWith(n.href) ? "active" : ""}
          >
            <n.icon size={20} />
            <span>{n.mobile}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
