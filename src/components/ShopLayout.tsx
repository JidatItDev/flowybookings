import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Sparkles,
  UserCog,
  CreditCard,
  BarChart3,
  Bell,
  Settings,
  Menu,
  X,
  Sparkle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const nav: NavItem[] = [
  { to: "/shop", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/shop/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/shop/customers", label: "Customers", icon: Users },
  { to: "/shop/services", label: "Services", icon: Sparkles },
  { to: "/shop/staff", label: "Staff", icon: UserCog },
  { to: "/shop/payments", label: "Payments", icon: CreditCard },
  { to: "/shop/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/shop/notifications", label: "Notifications", icon: Bell },
  { to: "/shop/settings", label: "Settings", icon: Settings },
];

export function ShopLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarHeader />
        <nav className="flex-1 space-y-1 px-3 pb-6">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-72 flex-col bg-sidebar">
            <SidebarHeader onClose={() => setOpen(false)} />
            <nav className="flex-1 space-y-1 px-3 pb-6">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to, item.exact);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <SidebarFooter />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden flex-1 items-center md:flex">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search bookings, customers…"
                className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm shadow-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </Button>
            <Link
              to="/admin"
              className="hidden rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Switch to Admin →
            </Link>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-primary-foreground">
                IS
              </div>
              <div className="hidden text-xs leading-tight sm:block">
                <p className="font-medium">Inkwell Studio</p>
                <p className="text-muted-foreground">Pro plan</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarHeader({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between gap-2 px-5">
      <Link to="/" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
          <Sparkle className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-base font-semibold tracking-tight">Bookly</span>
      </Link>
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="m-3 rounded-2xl bg-gradient-brand p-4 text-primary-foreground shadow-glow">
      <p className="text-sm font-semibold">Upgrade to Premium</p>
      <p className="mt-1 text-xs opacity-90">
        Unlock multi-location, API access and priority support.
      </p>
      <button className="mt-3 w-full rounded-lg bg-background/15 px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-background/25">
        See plans
      </button>
    </div>
  );
}
