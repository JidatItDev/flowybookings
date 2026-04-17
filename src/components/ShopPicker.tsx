// Inline shop badge / picker.
// - Super admin: dropdown to switch between shops
// - Everyone else: read-only display of their shop

import { useAuth } from "@/lib/auth-context";
import { ChevronDown, Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ShopPicker() {
  const { shops, activeShop, setActiveShopId, loading, isSuperAdmin } = useAuth();

  const Inner = (
    <>
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
        <Store className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">
          {loading ? "Loading…" : activeShop?.name ?? "No shop"}
        </p>
        <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
          {activeShop?.plan ?? "—"} plan
        </p>
      </div>
    </>
  );

  // Non-admins: read-only badge
  if (!isSuperAdmin || shops.length <= 1) {
    return (
      <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
        {Inner}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted/50">
        {Inner}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs">Switch shop (admin)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {shops.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => setActiveShopId(s.id)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="font-medium">{s.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.plan} · {s.status}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
