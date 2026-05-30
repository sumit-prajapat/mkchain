"use client";

import { motion } from "framer-motion";
import {
  Shield,
  Search,
  Bell,
  Settings,
  ChevronDown,
  Activity,
  AlertTriangle,
  Wallet,
  Network,
  FileText,
  Users,
  Target,
  BarChart3,
  Globe,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Menu,
  X,
  LogOut,
  Key,
  CreditCard,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserInfo {
  email: string;
  fullName: string | null;
  planId: string;
  planLabel: string;
  planColor: string;
  initials: string;
}

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  user?: UserInfo;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({ isOpen, setIsOpen, user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems = [
    { icon: Activity,      label: "Overview",          href: "/dashboard" },
    { icon: Network,       label: "Transaction Graph",  href: "/dashboard/graph" },
    { icon: Wallet,        label: "Wallet Analysis",    href: "/dashboard/analyze" },
    { icon: AlertTriangle, label: "Threat Alerts",      href: "/dashboard/alerts" },
    { icon: Target,        label: "Investigations",     href: "/dashboard/investigations" },
    { icon: Users,         label: "Entity Database",    href: "/dashboard/entities" },
    { icon: BarChart3,     label: "Reports",            href: "/dashboard/reports" },
    { icon: FileText,      label: "Compliance",         href: "/dashboard/compliance" },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-sidebar border-r border-sidebar-border z-50 transform transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
            <Link href="/" className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center glow-border">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <span className="text-lg font-bold text-sidebar-foreground">
                MK<span className="text-primary">Chain</span>
              </span>
            </Link>
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden p-1 text-muted-foreground hover:text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item, index) => {
              const active = pathname === item.href;
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all ${
                      active
                        ? "bg-sidebar-accent text-primary glow-border"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          {/* Quick links */}
          <div className="px-4 pb-2 space-y-1">
            <Link
              href="/dashboard/api-keys"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
            >
              <Key className="h-4 w-4" />
              API Keys
            </Link>
            <Link
              href="/dashboard/billing"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
            >
              <CreditCard className="h-4 w-4" />
              Billing
            </Link>
          </div>

          {/* User Section */}
          <div className="p-4 border-t border-sidebar-border">
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sidebar-accent cursor-pointer transition-colors"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary shrink-0">
                {user?.initials ?? "MK"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.fullName ?? user?.email ?? "User"}
                </div>
                <div className={`text-xs truncate ${user?.planColor ?? "text-muted-foreground"}`}>
                  {user?.planLabel ?? "Free"} Plan
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
              />
            </div>

            {/* Dropdown */}
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 rounded-md border border-sidebar-border bg-sidebar overflow-hidden"
              >
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function DashboardHeader({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 text-muted-foreground hover:text-primary"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search wallets, transactions, entities..."
              className="w-64 lg:w-96 h-9 pl-10 pr-4 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              /
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="relative p-2 text-muted-foreground hover:text-primary transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive animate-pulse" />
          </button>
          <Link
            href="/settings"
            className="p-2 text-muted-foreground hover:text-primary transition-colors"
          >
            <Settings className="h-5 w-5" />
          </Link>
          <div className="hidden md:flex items-center gap-2 ml-2 px-3 py-1.5 rounded-full bg-accent/20 border border-accent/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
            <span className="text-xs text-accent font-medium">Live</span>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

export function StatCard({
  title, value, change, changeType, icon: Icon, status,
}: {
  title: string;
  value: string;
  change: string;
  changeType: "up" | "down" | "neutral";
  icon: React.ElementType;
  status?: "normal" | "warning" | "critical";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative p-5 rounded-lg border bg-card/50 backdrop-blur-sm ${
        status === "critical"
          ? "border-destructive/50 glow-border"
          : status === "warning"
          ? "border-chart-4/50"
          : "border-border"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${
            status === "critical" ? "text-destructive"
            : status === "warning" ? "text-chart-4"
            : "text-foreground"
          }`}>
            {value}
          </p>
        </div>
        <div className={`p-2 rounded-lg ${
          status === "critical" ? "bg-destructive/10"
          : status === "warning" ? "bg-chart-4/10"
          : "bg-primary/10"
        }`}>
          <Icon className={`h-5 w-5 ${
            status === "critical" ? "text-destructive"
            : status === "warning" ? "text-chart-4"
            : "text-primary"
          }`} />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3">
        {changeType === "up" ? (
          <ArrowUpRight className="h-4 w-4 text-accent" />
        ) : changeType === "down" ? (
          <ArrowDownRight className="h-4 w-4 text-destructive" />
        ) : null}
        <span className={`text-xs ${
          changeType === "up" ? "text-accent"
          : changeType === "down" ? "text-destructive"
          : "text-muted-foreground"
        }`}>
          {change}
        </span>
        <span className="text-xs text-muted-foreground">vs last 24h</span>
      </div>
    </motion.div>
  );
}

// ─── ThreatFeed ───────────────────────────────────────────────────────────────

export function ThreatFeed() {
  const threats = [
    { id: 1, type: "OFAC Sanction Hit",    address: "0x8f3c...b2e9", risk: "critical", time: "2 min ago",  amount: "$142,500" },
    { id: 2, type: "Mixer Interaction",    address: "bc1q...x7k2",   risk: "high",     time: "5 min ago",  amount: "$89,200" },
    { id: 3, type: "Suspicious Pattern",   address: "0x2a1f...c8d3", risk: "medium",   time: "12 min ago", amount: "$23,000" },
    { id: 4, type: "High-Risk Exchange",   address: "0x9e4b...a1f7", risk: "medium",   time: "18 min ago", amount: "$567,800" },
    { id: 5, type: "Darknet Market",       address: "bc1q...m3n8",   risk: "critical", time: "24 min ago", amount: "$34,100" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card/50 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <h3 className="font-semibold text-foreground">Live Threat Feed</h3>
        </div>
        <span className="text-xs text-muted-foreground">Auto-refresh: 30s</span>
      </div>
      <div className="divide-y divide-border">
        {threats.map((threat, index) => (
          <motion.div
            key={threat.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 hover:bg-secondary/30 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    threat.risk === "critical" ? "bg-destructive/20 text-destructive"
                    : threat.risk === "high" ? "bg-destructive/10 text-destructive/80"
                    : "bg-chart-4/20 text-chart-4"
                  }`}>
                    {threat.risk.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-foreground">{threat.type}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs text-primary font-mono">{threat.address}</code>
                  <span className="text-xs text-muted-foreground">{threat.amount}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {threat.time}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="p-3 border-t border-border">
        <Link href="/dashboard/alerts" className="block w-full text-center text-sm text-primary hover:text-primary/80 transition-colors">
          View All Alerts
        </Link>
      </div>
    </motion.div>
  );
}

// ─── TransactionChart ─────────────────────────────────────────────────────────

export function TransactionChart() {
  const data = [
    { time: "00:00", volume: 2400 },
    { time: "04:00", volume: 1398 },
    { time: "08:00", volume: 9800 },
    { time: "12:00", volume: 3908 },
    { time: "16:00", volume: 4800 },
    { time: "20:00", volume: 3800 },
    { time: "Now",   volume: 4300 },
  ];
  const maxVolume = Math.max(...data.map((d) => d.volume));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-5"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-foreground">Transaction Volume</h3>
          <p className="text-sm text-muted-foreground">Last 24 hours</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-3 h-3 rounded bg-primary" />
          <span className="text-muted-foreground">Volume ($M)</span>
        </div>
      </div>
      <div className="h-48 flex items-end justify-between gap-2">
        {data.map((item, index) => (
          <div key={index} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex flex-col items-center gap-1 h-40 justify-end">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(item.volume / maxVolume) * 100}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="w-full bg-primary/60 rounded-t relative group"
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border border-border px-2 py-1 rounded text-xs whitespace-nowrap">
                  ${(item.volume / 1000).toFixed(1)}M
                </div>
              </motion.div>
            </div>
            <span className="text-xs text-muted-foreground">{item.time}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── NetworkGraph ─────────────────────────────────────────────────────────────

export function NetworkGraph() {
  const nodes = [
    { id: 1, x: 50, y: 50, size: 20, type: "exchange",   label: "Binance" },
    { id: 2, x: 30, y: 30, size: 15, type: "wallet",     label: "0x8f3c..." },
    { id: 3, x: 70, y: 35, size: 12, type: "suspicious", label: "Mixer" },
    { id: 4, x: 25, y: 60, size: 10, type: "wallet",     label: "0x2a1f..." },
    { id: 5, x: 75, y: 65, size: 18, type: "sanctioned", label: "OFAC" },
    { id: 6, x: 50, y: 80, size: 14, type: "wallet",     label: "0x9e4b..." },
  ];
  const edges = [
    { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 5 },
    { from: 1, to: 4 }, { from: 4, to: 6 }, { from: 6, to: 5 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Transaction Network</h3>
          <p className="text-sm text-muted-foreground">Active investigation</p>
        </div>
        <Link href="/dashboard/graph" className="text-sm text-primary hover:text-primary/80 transition-colors">
          Expand →
        </Link>
      </div>
      <div className="relative h-64 bg-secondary/20 rounded-lg overflow-hidden">
        <svg className="absolute inset-0 w-full h-full">
          {edges.map((edge, index) => {
            const from = nodes.find((n) => n.id === edge.from)!;
            const to   = nodes.find((n) => n.id === edge.to)!;
            return (
              <motion.line
                key={index}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.3 }}
                transition={{ duration: 1, delay: index * 0.1 }}
                x1={`${from.x}%`} y1={`${from.y}%`}
                x2={`${to.x}%`}   y2={`${to.y}%`}
                stroke="var(--primary)" strokeWidth="1"
              />
            );
          })}
        </svg>
        {nodes.map((node, index) => (
          <motion.div
            key={node.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform ${
              node.type === "sanctioned" ? "bg-destructive/80 pulse-glow"
              : node.type === "suspicious" ? "bg-chart-4/80"
              : node.type === "exchange"   ? "bg-primary/80"
              : "bg-accent/80"
            }`}
            style={{ left: `${node.x}%`, top: `${node.y}%`, width: node.size * 2, height: node.size * 2 }}
          >
            <span className="text-xs text-white font-mono">{node.label.slice(0, 2)}</span>
          </motion.div>
        ))}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 text-xs">
          {[
            { color: "bg-primary",     label: "Exchange" },
            { color: "bg-destructive", label: "Sanctioned" },
            { color: "bg-chart-4",     label: "Suspicious" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1 bg-background/80 px-2 py-1 rounded">
              <div className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── RecentInvestigations ─────────────────────────────────────────────────────

export function RecentInvestigations() {
  const investigations = [
    { id: "INV-2024-001", name: "Tornado Cash Flow Analysis",   status: "active",  progress: 75, assignee: "JD" },
    { id: "INV-2024-002", name: "Ransomware Payment Trace",     status: "active",  progress: 45, assignee: "SM" },
    { id: "INV-2024-003", name: "Exchange Hack Attribution",    status: "pending", progress: 20, assignee: "AK" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card/50 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Active Investigations</h3>
        </div>
        <Link href="/dashboard/investigations" className="text-sm text-primary hover:text-primary/80 transition-colors">
          View All
        </Link>
      </div>
      <div className="divide-y divide-border">
        {investigations.map((inv, index) => (
          <motion.div
            key={inv.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 hover:bg-secondary/30 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground font-mono">{inv.id}</code>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    inv.status === "active" ? "bg-accent/20 text-accent" : "bg-chart-4/20 text-chart-4"
                  }`}>
                    {inv.status}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground mt-1 truncate">{inv.name}</p>
                <div className="mt-2">
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${inv.progress}%` }}
                      transition={{ duration: 1, delay: index * 0.2 }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground mt-1">{inv.progress}% complete</span>
                </div>
              </div>
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                {inv.assignee}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── GlobalCoverage ───────────────────────────────────────────────────────────

export function GlobalCoverage() {
  const regions = [
    { name: "North America", transactions: "1.2M", risk: 12 },
    { name: "Europe",        transactions: "890K", risk: 8  },
    { name: "Asia Pacific",  transactions: "2.1M", risk: 23 },
    { name: "Middle East",   transactions: "340K", risk: 15 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Globe className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Global Coverage</h3>
      </div>
      <div className="space-y-3">
        {regions.map((region, index) => (
          <motion.div
            key={region.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-3 rounded bg-secondary/30"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{region.name}</p>
              <p className="text-xs text-muted-foreground">{region.transactions} txns/day</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${
                region.risk > 15 ? "text-destructive"
                : region.risk > 10 ? "text-chart-4"
                : "text-accent"
              }`}>
                {region.risk}%
              </p>
              <p className="text-xs text-muted-foreground">risk score</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
