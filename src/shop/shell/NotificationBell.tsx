// Bell icon with unread badge + dropdown showing the latest in-app notifications.
// Used in the shop topbar. Mobile-app feel: compact, rounded, fast.

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarRange,
  CreditCard,
  Megaphone,
  ShieldAlert,
  Sparkles,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/auth/lib/auth-context";
import { useT } from "@/shared/lib/i18n";
import {
  markAllRead,
  markRead,
  notificationKeys,
  useNotificationsRealtime,
  useShopNotifications,
  type NotificationRow,
  type NotificationType,
} from "@/shop/notifications/notifications";

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  system: Sparkles,
  billing: CreditCard,
  bookings: CalendarRange,
  alerts: ShieldAlert,
  admin: Megaphone,
};

const TYPE_TONES: Record<NotificationType, string> = {
  system: "bg-primary-soft text-primary",
  billing: "bg-peach text-peach-foreground",
  bookings: "bg-mint text-mint-foreground",
  alerts: "bg-destructive/15 text-destructive",
  admin: "bg-pink/30 text-pink-foreground",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function NotificationBell() {
  const { activeShopId } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const { data = [] } = useShopNotifications(activeShopId);
  useNotificationsRealtime(activeShopId);

  const unread = useMemo(() => data.filter((n) => !n.is_read), [data]);
  const recent = data.slice(0, 6);

  const readMut = useMutation({
    mutationFn: (id: string) => markRead(id),
    onSuccess: () => {
      if (activeShopId) qc.invalidateQueries({ queryKey: notificationKeys.list(activeShopId) });
    },
  });
  const allReadMut = useMutation({
    mutationFn: () => markAllRead(activeShopId!),
    onSuccess: () => {
      toast.success(t("inbox.markedAllRead"));
      if (activeShopId) qc.invalidateQueries({ queryKey: notificationKeys.list(activeShopId) });
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("inbox.title")}>
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,360px)] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{t("inbox.title")}</p>
            <p className="text-[11px] text-muted-foreground">
              {unread.length > 0 ? t("inbox.unreadCount", { n: unread.length }) : t("inbox.allRead")}
            </p>
          </div>
          {unread.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              onClick={() => allReadMut.mutate()}
              disabled={allReadMut.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" /> {t("inbox.markAllRead")}
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto border-t border-border">
          {recent.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {t("inbox.empty")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((n) => (
                <NotifRow
                  key={n.id}
                  n={n}
                  onRead={() => !n.is_read && readMut.mutate(n.id)}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border p-2">
          <Link
            to="/shop/notifications"
            className="block rounded-lg px-3 py-2 text-center text-xs font-medium text-primary hover:bg-primary/5"
          >
            {t("inbox.viewAll")}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotifRow({ n, onRead }: { n: NotificationRow; onRead: () => void }) {
  const Icon = TYPE_ICONS[n.type];
  const inner = (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        !n.is_read && "bg-primary/5",
      )}
      onClick={onRead}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", TYPE_TONES[n.type])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("truncate text-sm", !n.is_read ? "font-semibold" : "font-medium")}>{n.title}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
      </div>
      {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
    </div>
  );
  if (n.action_url) {
    return (
      <li>
        <Link to={n.action_url} className="block hover:bg-muted/40">
          {inner}
        </Link>
      </li>
    );
  }
  return <li className="cursor-pointer hover:bg-muted/40">{inner}</li>;
}
