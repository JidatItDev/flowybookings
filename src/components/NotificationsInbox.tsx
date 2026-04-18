// Full inbox view used on /shop/notifications (Inbox tab).
// Mobile-app style: compact rounded cards, swipe-friendly hit targets.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarRange,
  CheckCheck,
  CreditCard,
  Megaphone,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  deleteNotification,
  markAllRead,
  markRead,
  notificationKeys,
  useShopNotifications,
  type NotificationRow,
  type NotificationType,
} from "@/lib/notifications";

const TYPES: NotificationType[] = ["system", "billing", "bookings", "alerts", "admin"];

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

export function NotificationsInbox({ shopId }: { shopId: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const { data = [], isLoading } = useShopNotifications(shopId);
  const [filter, setFilter] = useState<"all" | "unread" | NotificationType>("all");

  const filtered = data.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.is_read;
    return n.type === filter;
  });
  const unreadCount = data.filter((n) => !n.is_read).length;

  const readMut = useMutation({
    mutationFn: (id: string) => markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.list(shopId) }),
  });
  const allReadMut = useMutation({
    mutationFn: () => markAllRead(shopId),
    onSuccess: () => {
      toast.success(t("inbox.markedAllRead"));
      qc.invalidateQueries({ queryKey: notificationKeys.list(shopId) });
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.list(shopId) }),
  });

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{t("inbox.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0 ? t("inbox.unreadCount", { n: unreadCount }) : t("inbox.allRead")}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={() => allReadMut.mutate()} disabled={allReadMut.isPending}>
            <CheckCheck className="h-4 w-4" /> {t("inbox.markAllRead")}
          </Button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 py-3 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          {t("inbox.filter.all")}
        </Chip>
        <Chip active={filter === "unread"} onClick={() => setFilter("unread")}>
          {t("inbox.filter.unread")} {unreadCount > 0 && <span className="ml-1 text-[10px]">{unreadCount}</span>}
        </Chip>
        {TYPES.map((tp) => (
          <Chip key={tp} active={filter === tp} onClick={() => setFilter(tp)}>
            {t(`inbox.type.${tp}`)}
          </Chip>
        ))}
      </div>

      <div className="divide-y divide-border">
        {isLoading ? (
          <div className="h-32 animate-pulse" />
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">{t("inbox.empty")}</div>
        ) : (
          filtered.map((n) => (
            <Row
              key={n.id}
              n={n}
              onRead={() => !n.is_read && readMut.mutate(n.id)}
              onDelete={() => deleteMut.mutate(n.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Row({
  n,
  onRead,
  onDelete,
}: {
  n: NotificationRow;
  onRead: () => void;
  onDelete: () => void;
}) {
  const Icon = TYPE_ICONS[n.type];
  const body = (
    <div className={cn("flex gap-3 px-4 py-3 sm:px-6 sm:py-4", !n.is_read && "bg-primary/5")}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TYPE_TONES[n.type])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("truncate text-sm", !n.is_read ? "font-semibold" : "font-medium")}>{n.title}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        className="self-start rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
  if (n.action_url) {
    return (
      <Link to={n.action_url} onClick={onRead} className="block hover:bg-muted/40">
        {body}
      </Link>
    );
  }
  return (
    <div role="button" tabIndex={0} onClick={onRead} className="cursor-pointer hover:bg-muted/40">
      {body}
    </div>
  );
}
