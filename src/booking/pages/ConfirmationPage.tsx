// Dynamic confirmation page — fetches the freshly created booking from Supabase by id.

import { Link, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Calendar, MapPin, ArrowRight, Loader2, LayoutDashboard, Sparkles, CalendarPlus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/shared/lib/i18n";
import { formatInShopTz, resolveShopTimezone } from "@/shared/lib/shop-timezone";

const Route = getRouteApi("/book/confirmation/$bookingId");

export function ConfirmationPage() {
  const { bookingId } = Route.useParams();
  const { t } = useT();

  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-confirmation", bookingId],
    queryFn: async () => {
      const { data: rows, error: bErr } = await supabase.rpc("get_public_booking_confirmation", {
        _booking_id: bookingId,
      });
      if (bErr) throw bErr;
      const booking = rows?.[0];
      if (!booking) return null;

      const [{ data: shop }, { data: service }, { data: staff }] = await Promise.all([
        supabase.from("shops").select("name, slug, address, is_demo, timezone").eq("id", booking.shop_id).maybeSingle(),
        booking.service_id
          ? supabase.from("services").select("name").eq("id", booking.service_id).maybeSingle()
          : Promise.resolve({ data: null }),
        booking.staff_id
          ? supabase.from("staff").select("full_name").eq("id", booking.staff_id).maybeSingle()
          : Promise.resolve({ data: null as { full_name: string } | null }),
      ]);
      return { booking, shop, service, staff };
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-hero">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.booking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">{t("book.notFound")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("book.notFoundSub")}</p>
          <Button asChild variant="hero" className="mt-6">
            <Link to="/">{t("book.backHome")} <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    );
  }

  const { booking, shop, service, staff } = data;
  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const shopTz = resolveShopTimezone((shop as { timezone?: string | null } | null)?.timezone);
  const dateLabel = formatInShopTz(startsAt, shopTz, "EEEE d MMMM");
  const timeLabel = `${formatInShopTz(startsAt, shopTz, "HH:mm")} — ${formatInShopTz(endsAt, shopTz, "HH:mm")}`;
  const staffLabel = staff?.full_name ?? "Wordt toegewezen door de salon";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-gradient-hero px-4 py-16">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-elevated sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mint">
          <CheckCircle2 className="h-8 w-8 text-mint-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{t("book.youreBooked")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("book.confirmationSentSub")}</p>

        <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-left text-sm">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-primary" />
            <div>
              <p className="font-medium">{service?.name ?? t("book.service")}</p>
              <p className="text-xs text-muted-foreground">{dateLabel} · {timeLabel}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <User className="h-4 w-4 text-primary" />
            <div>
              <p className="font-medium">{staffLabel}</p>
              <p className="text-xs text-muted-foreground">{staff ? "Je medewerker" : "De salon wijst zo snel mogelijk een medewerker toe"}</p>
            </div>
          </div>
          {shop && (
            <div className="mt-3 flex items-center gap-3">
              <MapPin className="h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">{shop.name}</p>
                <p className="text-xs text-muted-foreground">{shop.address ?? "—"}</p>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between rounded-lg bg-background px-3 py-2 text-xs">
            <span className="text-muted-foreground">{t("book.price")}</span>
            <span className="font-semibold">€{(booking.price_cents / 100).toFixed(2)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-background px-3 py-2 text-xs">
            <span className="text-muted-foreground">{t("book.bookingRef")}</span>
            <span className="font-mono">{booking.id.slice(0, 8)}</span>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="hero">
            <a href={`/api/booking/${booking.id}/ics`} download>
              <CalendarPlus className="h-4 w-4" /> {t("book.addToCalendar")}
            </a>
          </Button>
          {shop?.slug ? (
            <Button asChild variant="outline">
              <Link to="/book/$slug" params={{ slug: shop.slug }}>
                {t("book.bookAnother")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/">{t("book.backHome")}</Link>
          </Button>
        </div>

        {shop?.is_demo && (
          <div className="mt-8 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary-soft/60 to-pink/40 p-5 text-left">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-brand text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{t("demo.convertTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("demo.convertSub")}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="hero" className="flex-1">
                <Link to="/signup">{t("demo.startTrialCta")} <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to="/shop"><LayoutDashboard className="h-4 w-4" /> {t("demo.viewDashboard")}</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// regenerated
