// Reusable "staff cannot access this" placeholder for owner-only pages.
import { Lock } from "lucide-react";
import { useT } from "@/lib/i18n";

export function StaffBlocked() {
  const { t } = useT();
  return (
    <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
      <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 text-base font-semibold">{t("perm.staffNoAccessTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("perm.staffNoAccessDesc")}</p>
    </div>
  );
}
