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
  Beaker,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RequireSuperAdmin } from "@/components/RouteGuard";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard; exact?: boolean };

const nav: NavItem[] = [
  { to: "/beheer/dashboard", labelKey: "adminNav.overview", icon: LayoutDashboard, exact: true },
  { to: "/beheer/dashboard/shops", labelKey: "adminNav.shops", icon: Store },
  { to: "/beheer/dashboard/users", labelKey: "adminNav.users", icon: Users },
  { to: "/beheer/dashboard/bookings", labelKey: "adminNav.bookings", icon: CalendarRange },
  { to: "/beheer/dashboard/payments", labelKey: "adminNav.payments", icon: CreditCard },
  { to: "/beheer/dashboard/plans", labelKey: "adminNav.plans", icon: Layers },
  { to: "/beheer/dashboard/support", labelKey: "adminNav.support", icon: LifeBuoy },
  { to: "/beheer/dashboard/logs", labelKey: "adminNav.auditLogs", icon: ScrollText },
  { to: "/beheer/dashboard/demo", labelKey: "adminNav.demo", icon: Beaker },
  { to: "/beheer/dashboard/settings", labelKey: "adminNav.settings", icon: Settings },
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
  const { t } = useT();
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
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 rounded-2xl border border-sidebar-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-success-foreground">
            <ShieldCheck className="h-4 w-4" />
            {t("adminNav.platformHealthy")}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("adminNav.allSystems")}</p>
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
                    {t(item.labelKey)}
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
            aria-label={t("a11y.openMenu")}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
              {t("adminNav.superAdmin")}
            </span>
            <span className="hidden text-sm text-muted-foreground sm:inline">{t("adminNav.platform")}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" aria-label={t("shopNav.notifications")}>
              <Bell className="h-5 w-5" />
            </Button>
            <Link
              to="/shop"
              className="hidden rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              {t("adminNav.switchToShop")}
            </Link>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-warm text-xs font-semibold text-pink-foreground">
                {(user?.email ?? "?")[0].toUpperCase()}
              </div>
              <div className="hidden text-xs leading-tight sm:block">
                <p className="font-medium">{user?.email}</p>
                <p className="text-muted-foreground">{t("adminNav.platformOwner")}</p>
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
                  <LogOut className="h-4 w-4" /> {t("auth.signOut")}
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
  const { t } = useT();
  return (
    <div className="flex h-16 items-center justify-between gap-2 px-5">
      <Link to="/" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
          <ShieldCheck className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-base font-semibold tracking-tight">FlowyBookings Admin</span>
      </Link>
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("a11y.closeMenu")}>
          <X className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
