import { Link } from "@tanstack/react-router";
import { ArrowRight, Link2Off, Lock, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { PublicBookingBlockReason } from "@/lib/public-booking-shop";

type Props = {
  reason: PublicBookingBlockReason;
  shopName?: string | null;
};

export function PublicBookingLinkError({ reason, shopName }: Props) {
  const { t } = useT();

  const icon =
    reason === "not_found" ? (
      <Link2Off className="h-8 w-8 text-muted-foreground" />
    ) : reason === "inactive" ? (
      <Store className="h-8 w-8 text-muted-foreground" />
    ) : (
      <Lock className="h-8 w-8 text-destructive" />
    );

  const title =
    reason === "not_found"
      ? t("book.linkNotFound")
      : reason === "inactive"
        ? t("book.shopInactive")
        : t("book.shopUnavailable");

  const subtitle =
    reason === "not_found"
      ? t("book.linkNotFoundSub")
      : reason === "inactive"
        ? shopName
          ? t("book.shopInactiveSub", { shop: shopName })
          : t("book.shopInactiveSubGeneric")
        : shopName
          ? t("book.shopUnavailableSub", { shop: shopName })
          : t("book.shopUnavailableSub");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elevated sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="hero">
            <Link to="/">
              {t("book.backHome")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
