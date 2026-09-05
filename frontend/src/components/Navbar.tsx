import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Shield, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OrganizationSwitcher } from "@/components/OrganizationSwitcher";
import { QuotaBadge } from "@/components/billing/QuotaWarning";
import { useAuth } from "@/hooks/useAuth";

import { endpoints } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";


const NAV = [
  { to: "/analyze", label: "Analyze" },
  { to: "/history", label: "History" },
  { to: "/osint", label: "OSINT" },
  { to: "/compare", label: "Compare" },
  { to: "/alerts", label: "Alerts" },
] as const;

export function Navbar() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => endpoints.darkwebStats(),
    enabled: !!user,
    retry: 1,
    refetchInterval: 60_000,
  });

  const alerts = useQuery({
    queryKey: ["alerts", "feed"],
    queryFn: () => endpoints.alertFeed(),
    enabled: !!user,
    retry: 0,
    refetchInterval: 60_000,
  });

  const unread = (alerts.data ?? []).filter((a) => !(a.is_read ?? a.read)).length;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setOpen(false);
    navigate({ to: "/login", search: {}, replace: true });
  }

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const statusLabel = health.isError ? "Unreachable" : health.isSuccess ? "Healthy" : "Checking…";

  const NavLinks = ({ onClick, stacked }: { onClick?: () => void; stacked?: boolean }) => (
    <>
      {NAV.map((item) => {
        const active = mounted && pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onClick}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              stacked && "min-h-11 w-full border-b border-border py-3",
              active
                ? "bg-muted-surface font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted-surface/70 hover:text-foreground",
            )}

          >
            {item.label}
            {item.label === "Alerts" && unread > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 font-data text-[10px] font-semibold text-background">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link to="/" className="flex min-h-11 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Shield className="h-4 w-4" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-foreground">MKChain</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <NavLinks />
        </div>

        <div className="flex items-center gap-1.5">
          {!loading && user && (
            <>
              <QuotaBadge />
              <OrganizationSwitcher />
            </>
          )}
          <ThemeToggle className="h-10 w-10 text-muted-foreground hover:text-foreground" />
          {!loading && user ? (

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="hidden h-10 items-center gap-2 rounded-full px-1 pr-2 transition-colors hover:bg-foreground/[0.04] sm:flex"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      health.isError ? "bg-danger" : health.isSuccess ? "pulse-dot bg-success" : "bg-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted-surface font-data text-[11px] font-semibold text-foreground">
                    {initials}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 border-border bg-card">
                <div className="px-2 py-2">
                  <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Signed in as</p>
                  <p className="mt-1 font-data text-xs break-all text-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-2 py-2">
                  <span className="text-xs text-muted-foreground">API status</span>
                  <span className="inline-flex items-center gap-1.5 font-data text-[11px] text-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        health.isError ? "bg-danger" : health.isSuccess ? "bg-success" : "bg-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                    {statusLabel}
                  </span>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/billing" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Billing & Plans
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}


          {!loading && !user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost" size="sm" className="min-h-11">
                <Link to="/login" search={{}}>Login</Link>
              </Button>
              <Button asChild size="sm" className="bg-primary min-h-11 font-medium text-primary-foreground hover:bg-primary/90">
                <Link to="/signup">Get Started</Link>
              </Button>
            </div>
          ) : null}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-11 w-11 md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm border-border bg-card p-6">
              <SheetTitle className="text-brand-gradient text-lg">MKChain</SheetTitle>
              <div className="mt-4 flex flex-col">
                <NavLinks stacked onClick={() => setOpen(false)} />
                <Link
                  to="/billing"
                  onClick={() => setOpen(false)}
                  className="relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors min-h-11 w-full border-b border-border py-3 text-muted-foreground hover:bg-muted-surface/70 hover:text-foreground"
                >
                  <CreditCard className="h-4 w-4" />
                  Billing
                </Link>
              </div>
              <div className="mt-6 flex flex-col gap-2">
                {user ? (
                  <>
                    <p className="font-data text-xs break-all text-muted-foreground">{user.email}</p>
                    <Button variant="outline" className="min-h-11" onClick={signOut}>
                      <LogOut className="h-4 w-4" /> Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
                      <Link to="/login" search={{}}>Login</Link>
                    </Button>
                    <Button asChild className="bg-primary min-h-11 font-medium text-primary-foreground" onClick={() => setOpen(false)}>
                      <Link to="/signup">Get Started</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
