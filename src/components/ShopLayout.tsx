import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
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
  LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShopPicker } from "@/components/ShopPicker";
import { RequireShopAccess } from "@/components/RouteGuard";
import { LegalReconsentDialog } from "@/components/LegalReconsentDialog";
import { TrialBanner } from "@/components/TrialBanner";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { usePendingBilling } from "@/lib/use-pending-billing";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LogOut, Settings as SettingsIcon, LifeBuoy as LifeBuoyIcon } from "lucide-react";

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard; exact?: boolean; ownerOnly?: boolean };

const nav: NavItem[] = [
  { to: "/shop", labelKey: "shopNav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/shop/calendar", labelKey: "shopNav.calendar", icon: CalendarDays },
  { to: "/shop/customers", labelKey: "shopNav.customers", icon: Users },
  { to: "/shop/services", labelKey: "shopNav.services", icon: Sparkles, ownerOnly: true },
  { to: "/shop/staff", labelKey: "shopNav.staff", icon: UserCog, ownerOnly: true },
  { to: "/shop/payments", labelKey: "shopNav.payments", icon: CreditCard, ownerOnly: true },
  { to: "/shop/analytics", labelKey: "shopNav.analytics", icon: BarChart3 },
  { to: "/shop/notifications", labelKey: "shopNav.notifications", icon: Bell, ownerOnly: true },
  { to: "/shop/settings", labelKey: "shopNav.settings", icon: Settings, ownerOnly: true },
  { to: "/support", labelKey: "shopNav.support", icon: LifeBuoy },
];

export function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireShopAccess>
      <ShopLayoutInner>{children}</ShopLayoutInner>
    </RequireShopAccess>
  );
}

function ShopLayoutInner({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { shops, loading, shopsLoading, user, signOut, isSuperAdmin, isShopOwner, isStaff, activeShop } = useAuth();
  const { t } = useT();
  const isStaffOnly = isStaff && !isShopOwner && !isSuperAdmin;
  const visibleNav = nav.filter((n) => !n.ownerOnly || !isStaffOnly);
  const needsOnboarding = !loading && !shopsLoading && shops.length === 0 && !isSuperAdmin;
  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    user?.email ||
    "";
  const initials = (displayName || "?").trim().charAt(0).toUpperCase();
  const pendingBilling = usePendingBilling();
  const planText = (() => {
    // Optimistic: while a Mollie upgrade is in flight, show "ACTIVATIE…" instead
    // of stale TRIAL. Auto-clears once activeShop.plan matches the requested plan.
    if (
      pendingBilling &&
      activeShop?.id === pendingBilling.shopId &&
      activeShop?.plan !== pendingBilling.plan
    ) {
      return t("billing.activatingShort");
    }
    const p = activeShop?.plan ?? "trial";
    if (p === "trial") return "TRIAL";
    if (p === "starter") return "STARTER";
    if (p === "pro") return "PRO";
    if (p === "premium") return "PREMIUM";
    return p.toUpperCase();
  })();

  // Legacy accounts (or users who lost their only shop) land on /shop with
  // an empty context. Send them to the dedicated onboarding route so the
  // URL reflects state and refreshes/share-links keep working.
  useEffect(() => {
    if (needsOnboarding && location.pathname !== "/shop/onboarding") {
      navigate({ to: "/shop/onboarding", replace: true });
    }
  }, [needsOnboarding, location.pathname, navigate]);

  if (loading || shopsLoading) {
    return null;
  }

  if (needsOnboarding) {
    return null;
  }

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <ImpersonationBanner />
      <div className="flex min-h-0 w-full flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarHeader />
        <nav className="flex-1 space-y-1 px-3 pb-6">
          {visibleNav.map((item) => {
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
        {!isStaffOnly && <SidebarFooter />}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-72 flex-col bg-sidebar">
            <SidebarHeader onClose={() => setOpen(false)} />
            <nav className="flex-1 space-y-1 px-3 pb-6">
              {visibleNav.map((item) => {
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
            <SidebarFooter />
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
          <div className="hidden flex-1 items-center md:flex">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder={t("shopNav.searchPlaceholder")}
                className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm shadow-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell />
            {isSuperAdmin && (
              <Link
                to="/beheer/dashboard"
                className="hidden rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                {t("shopNav.switchToAdmin")}
              </Link>
            )}
            <div className="w-56">
              <ShopPicker />
            </div>
            <AccountMenu
              displayName={displayName}
              initials={initials}
              shopName={activeShop?.name ?? null}
              planText={planText}
              isStaffOnly={isStaffOnly}
              onNavigate={(to) => navigate({ to })}
              onSignOut={async () => {
                await signOut();
                if (typeof window !== "undefined") {
                  window.location.assign("/");
                }
              }}
            />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <TrialBanner />
          {children}
        </main>
      </div>
      </div>
      <LegalReconsentDialog />
    </div>
  );
}

function SidebarHeader({ onClose }: { onClose?: () => void }) {
  const { t } = useT();
  return (
    <div className="flex h-16 items-center justify-between gap-2 px-5">
      <Link to="/" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
          <Sparkle className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-base font-semibold tracking-tight">FlowyBookings</span>
      </Link>
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("a11y.closeMenu")}>
          <X className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

function SidebarFooter() {
  const { t } = useT();
  return (
    <div className="m-3 rounded-2xl bg-gradient-brand p-4 text-primary-foreground shadow-glow">
      <p className="text-sm font-semibold">{t("shopNav.upgradePremium")}</p>
      <p className="mt-1 text-xs opacity-90">{t("shopNav.upgradeSub")}</p>
      <Link
        to="/shop/upgrade"
        className="mt-3 block w-full rounded-lg bg-background/15 px-3 py-1.5 text-center text-xs font-medium backdrop-blur hover:bg-background/25"
      >
        {t("shopNav.seePlans")}
      </Link>
    </div>
  );
}

type AccountMenuProps = {
  displayName: string;
  initials: string;
  shopName: string | null;
  planText: string;
  isStaffOnly: boolean;
  onNavigate: (to: string) => void;
  onSignOut: () => void | Promise<void>;
};

function AccountMenu(props: AccountMenuProps) {
  const isMobile = useIsMobile();
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const items: Array<{ key: string; label: string; icon: typeof LayoutDashboard; to: string }> = [
    { key: "dashboard", label: t("shopNav.dashboard"), icon: LayoutDashboard, to: "/shop" },
  ];
  if (!props.isStaffOnly) {
    items.push({ key: "settings", label: t("shopNav.settings"), icon: SettingsIcon, to: "/shop/settings" });
    items.push({ key: "subscription", label: t("shopNav.subscription"), icon: CreditCard, to: "/shop/billing" });
  }
  items.push({ key: "support", label: t("shopNav.support"), icon: LifeBuoyIcon, to: "/support" });

  const Trigger = (
    <button
      type="button"
      aria-label={t("account.menuLabel")}
      onClick={() => setOpen((v) => !v)}
      className="flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 py-1 text-xs font-medium transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-warm text-xs font-semibold text-pink-foreground">
        {props.initials}
      </span>
      <span className="hidden max-w-[140px] truncate sm:inline">
        {props.shopName ?? props.displayName}
      </span>
      <span className="hidden rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline">
        {props.planText}
      </span>
    </button>
  );

  if (isMobile) {
    return (
      <>
        {Trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[92dvh] overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom,0px)]"
          >
            <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted" aria-hidden="true" />
            <SheetHeader className="px-5 pb-3 pt-2 text-left">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-warm text-base font-semibold text-pink-foreground">
                  {props.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-base">
                    {props.shopName ?? props.displayName}
                  </SheetTitle>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{props.displayName}</span>
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {props.planText}
                    </span>
                  </p>
                </div>
              </div>
            </SheetHeader>
            <div className="border-t border-border px-3 py-2">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      props.onNavigate(item.to);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-border px-3 py-2 pb-4">
              <button
                type="button"
                onClick={async () => {
                  setOpen(false);
                  await props.onSignOut();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-5 w-5" />
                {t("auth.signOut")}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{Trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
            {t("auth.signedInAs")}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{props.displayName}</span>
          {props.shopName && (
            <span className="text-xs text-muted-foreground">
              {props.shopName} · <span className="font-semibold text-primary">{props.planText}</span>
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.key} onClick={() => props.onNavigate(item.to)}>
              <Icon className="h-4 w-4" /> {item.label}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => props.onSignOut()}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" /> {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
