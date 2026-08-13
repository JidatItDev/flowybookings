// Admin-only bell: shows count of activity_log entries since the admin's
// last "seen" timestamp (profiles.admin_last_seen_activity_at). Clicking
// resets the timestamp and links to the dashboard's live event feed.

import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/lib/auth-context";
import { useT } from "@/shared/lib/i18n";
import {
  adminUnreadActivityQuery,
  markAdminActivitySeen,
} from "@/admin/dashboard/admin-dashboard-extras";

export function AdminNotificationBell() {
  const { user, isSuperAdmin } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const userId = user?.id ?? null;
  const { data } = useQuery(adminUnreadActivityQuery(userId));
  const count = data?.count ?? 0;

  // Realtime: live unread-teller wanneer nieuwe activity_log binnenkomt.
  // Alleen voor super-admins (RLS staat alleen hen toe te lezen).
  useEffect(() => {
    if (!isSuperAdmin || !userId) return;
    const channel = supabase
      .channel(`admin-bell-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        () => qc.invalidateQueries({ queryKey: ["admin", "unread-activity"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSuperAdmin, userId, qc]);

  const markSeen = useMutation({
    mutationFn: async () => {
      if (userId) await markAdminActivitySeen(userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "unread-activity"] });
    },
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      asChild
      aria-label={t("adminBell.aria")}
      onClick={() => markSeen.mutate()}
    >
      <Link to="/beheer/dashboard">
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
