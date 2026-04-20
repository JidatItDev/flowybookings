import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LEGAL_LAST_UPDATED, CURRENT_POLICY_VERSION, type LegalDocKey } from "@/lib/legal-meta";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const DOC_LINKS: Record<LegalDocKey, "/legal/privacy" | "/legal/terms" | "/legal/refunds"> = {
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  refunds: "/legal/refunds",
};

const DOC_KEYS = Object.keys(LEGAL_LAST_UPDATED) as LegalDocKey[];

/**
 * Renders inside authenticated shop shells. Compares the active shop's stored
 * policy version against CURRENT_POLICY_VERSION and forces re-acceptance when
 * the published version is newer. Super admins never see this dialog.
 */
export function LegalReconsentDialog() {
  const { user, loading, isSuperAdmin, activeShop, refreshShops } = useAuth();
  const { t, locale } = useT();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  // Decide visibility from auth + active shop. Super admins are always skipped.
  useEffect(() => {
    if (loading || !user) { setOpen(false); return; }
    if (isSuperAdmin) { setOpen(false); return; }
    if (!activeShop) { setOpen(false); return; }

    const accepted = (activeShop as unknown as { policy_accepted_at: string | null; policy_version: string | null });
    const acceptedAt = accepted.policy_accepted_at;
    const acceptedVersion = accepted.policy_version;
    const stale = !acceptedAt || !acceptedVersion || acceptedVersion < CURRENT_POLICY_VERSION;
    setOpen(stale);
  }, [user, loading, isSuperAdmin, activeShop]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [locale],
  );

  const handleAccept = async () => {
    if (!user || !agreed || !activeShop) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("shops")
        .update({
          policy_accepted_at: new Date().toISOString(),
          policy_version: CURRENT_POLICY_VERSION,
        })
        .eq("id", activeShop.id);
      if (error) throw error;
      setOpen(false);
      refreshShops();
      toast.success(t("legal.reconsent.accepted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save consent");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || isSuperAdmin || !activeShop || !open) return null;

  return (
    <Dialog open={open} onOpenChange={() => { /* not dismissible until accepted */ }}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>{t("legal.reconsent.title")}</DialogTitle>
          <DialogDescription>{t("legal.reconsent.body")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          {DOC_KEYS.map((key) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <Link
                to={DOC_LINKS[key]}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                {t(`legal.reconsent.doc.${key}`)}
              </Link>
              <span className="text-xs text-muted-foreground">
                {dateFormatter.format(new Date(LEGAL_LAST_UPDATED[key]))}
              </span>
            </li>
          ))}
        </ul>

        <label className="mt-2 flex items-start gap-2.5 text-sm text-muted-foreground">
          <Checkbox
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            className="mt-0.5"
            aria-label={t("legal.reconsent.agreeAria")}
          />
          <span>{t("legal.reconsent.agree")}</span>
        </label>

        <DialogFooter>
          <Button onClick={handleAccept} disabled={!agreed || submitting} className="w-full">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("legal.reconsent.accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
