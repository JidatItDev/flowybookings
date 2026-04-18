// /beheer/dashboard/messages — admin broadcast composer + recent broadcasts.
// Sends in-app notifications to one shop, multiple, or all shops.

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { adminShopsQuery } from "@/lib/admin-queries";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { NotificationType } from "@/lib/notifications";

export const Route = createFileRoute("/beheer/dashboard/messages")({
  head: () => ({ meta: [{ title: "Messaging — FlowyBookings admin" }] }),
  component: AdminMessagesPage,
});

const TYPES: NotificationType[] = ["admin", "system", "billing", "alerts"];

function AdminMessagesPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: shops = [] } = useQuery(adminShopsQuery());

  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<NotificationType>("admin");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionUrl, setActionUrl] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !message.trim()) throw new Error(t("adminMessages.required"));
      const { data, error } = await supabase.rpc("admin_broadcast_notification", {
        _title: title.trim(),
        _message: message.trim(),
        _type: type,
        _action_url: actionUrl.trim() || undefined,
        _shop_ids: scope === "all" ? undefined : Array.from(selected),
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(t("adminMessages.sentToast", { n: count }));
      setTitle("");
      setMessage("");
      setActionUrl("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["adminRecentBroadcasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recent = useQuery({
    queryKey: ["adminRecentBroadcasts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, shop_id, type, title, message, is_read, created_at, created_by")
        .not("created_by", "is", null)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; type: string; message: string; created_at: string; recipients: number; read: number }>();
    (recent.data ?? []).forEach((n) => {
      const k = `${n.title}|${n.message}|${n.created_at.slice(0, 16)}`;
      const cur = map.get(k);
      if (cur) {
        cur.recipients += 1;
        if (n.is_read) cur.read += 1;
      } else {
        map.set(k, {
          title: n.title,
          type: n.type,
          message: n.message,
          created_at: n.created_at,
          recipients: 1,
          read: n.is_read ? 1 : 0,
        });
      }
    });
    return Array.from(map.values()).slice(0, 12);
  }, [recent.data]);

  const toggleShop = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <AdminLayout>
      <PageHeader title={t("adminMessages.title")} description={t("adminMessages.description")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">{t("adminMessages.composer")}</h2>
          </div>
          <div className="grid gap-4">
            <div>
              <Label className="text-xs">{t("adminMessages.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as NotificationType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      {t(`inbox.type.${tp}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("adminMessages.title")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("adminMessages.message")}</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={1000} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("adminMessages.actionUrl")}</Label>
              <Input value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="/shop/upgrade" className="mt-1" />
            </div>

            <div>
              <Label className="text-xs">{t("adminMessages.recipients")}</Label>
              <div className="mt-1 inline-flex rounded-full border border-border bg-card p-1">
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-medium",
                    scope === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {t("adminMessages.allShops", { n: shops.length })}
                </button>
                <button
                  type="button"
                  onClick={() => setScope("selected")}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-medium",
                    scope === "selected" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {t("adminMessages.selectShops")}
                </button>
              </div>
              {scope === "selected" && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border">
                  {shops.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("adminMessages.noShops")}</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {shops.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={() => toggleShop(s.id)}
                            id={`shop-${s.id}`}
                          />
                          <label htmlFor={`shop-${s.id}`} className="flex-1 cursor-pointer text-sm">
                            {s.name}
                            <span className="ml-2 text-xs text-muted-foreground">{s.plan}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                variant="hero"
                disabled={send.isPending || (scope === "selected" && selected.size === 0)}
                onClick={() => send.mutate()}
              >
                <Send className="h-4 w-4" />
                {send.isPending ? t("adminMessages.sending") : t("adminMessages.send")}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-base font-semibold">{t("adminMessages.recent")}</h2>
            <p className="text-xs text-muted-foreground">{t("adminMessages.recentSub")}</p>
          </div>
          <div className="divide-y divide-border">
            {grouped.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t("adminMessages.noBroadcasts")}</p>
            ) : (
              grouped.map((g, i) => (
                <div key={i} className="px-4 py-3 sm:px-6">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{g.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(g.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{g.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("adminMessages.deliveredTo", { n: g.recipients })} · {t("adminMessages.readBy", { n: g.read })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
