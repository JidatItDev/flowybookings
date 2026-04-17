import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Store,
  Users,
  CalendarRange,
  CreditCard,
  Layers,
  LifeBuoy,
  ScrollText,
  Settings,
  Menu,
  X,
  ShieldCheck,
  Bell,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RequireSuperAdmin } from "@/components/RouteGuard";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const nav: NavItem[] = [
  { to: "/beheer/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/beheer/dashboard/shops", label: "Shops", icon: Store },
  { to: "/beheer/dashboard/users", label: "Users", icon: Users },
  { to: "/beheer/dashboard/bookings", label: "Bookings", icon: CalendarRange },
  { to: "/beheer/dashboard/payments", label: "Payments", icon: CreditCard },
  { to: "/beheer/dashboard/plans", label: "Plans", icon: Layers },
  { to: "/beheer/dashboard/support", label: "Support", icon: LifeBuoy },
  { to: "/beheer/dashboard/logs", label: "Audit logs", icon: ScrollText },
  { to: "/beheer/dashboard/settings", label: "Settings", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSuperAdmin>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </RequireSuperAdmin>
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Header />
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
        <div className="m-3 rounded-2xl border border-sidebar-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-success-foreground">
            <ShieldCheck className="h-4 w-4" />
            Platform healthy
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            All systems operational · 99.98% uptime
          </p>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-sidebar">
            <Header onClose={() => setOpen(false)} />
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
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
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
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
              SUPER ADMIN
            </span>
            <span className="hidden text-sm text-muted-foreground sm:inline">Bookly platform</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </Button>
            <Link
              to="/shop"
              className="hidden rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Switch to Shop →
            </Link>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-warm text-xs font-semibold text-pink-foreground">
                {(user?.email ?? "?")[0].toUpperCase()}
              </div>
              <div className="hidden text-xs leading-tight sm:block">
                <p className="font-medium">{user?.email}</p>
                <p className="text-muted-foreground">Platform owner</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {user?.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between gap-2 px-5">
      <Link to="/" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
          <ShieldCheck className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-base font-semibold tracking-tight">Bookly Admin</span>
      </Link>
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
