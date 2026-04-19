import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LEGAL_LAST_UPDATED, type LegalDocKey } from "@/lib/legal-meta";
import { fetchConsent, outdatedPolicies, recordConsent } from "@/lib/legal-consent";
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

/**
 * Renders inside authenticated app shells. Compares the user's stored consent
 * against LEGAL_LAST_UPDATED and forces re-acceptance when policies have changed.
 */
export function LegalReconsentDialog() {
  const { user, loading } = useAuth();
  const { t, locale } = useT();
  const [outdated, setOutdated] = useState<LegalDocKey[] | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  // Fetch the user's stored consent once auth resolves.
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const accepted = await fetchConsent(user.id);
        if (cancelled) return;
        const stale = outdatedPolicies(accepted);
        setOutdated(stale);
        setOpen(stale.length > 0);
      } catch {
        // Don't block the app on consent-check failures.
        setOutdated([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

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
    if (!user || !agreed) return;
    setSubmitting(true);
    try {
      await recordConsent(user.id);
      setOpen(false);
      setOutdated([]);
      toast.success(t("legal.reconsent.accepted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save consent");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || !outdated || outdated.length === 0) return null;

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
          {outdated.map((key) => (
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
