// Dynamic confirmation page — fetches the freshly created booking from Supabase by id.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Calendar, MapPin, ArrowRight, Loader2, LayoutDashboard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/book/confirmation/$bookingId")({
  head: () => ({
    meta: [
      { title: "Boeking bevestigd — FlowyBookings" },
      { name: "description", content: "Je afspraak is bevestigd." },
    ],
  }),
  component: ConfirmationPage,
});

function ConfirmationPage() {
  const { bookingId } = Route.useParams();
  const { t } = useT();

  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-confirmation", bookingId],
    queryFn: async () => {
      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("id, starts_at, ends_at, status, price_cents, deposit_cents, currency, shop_id, service_id")
        .eq("id", bookingId).maybeSingle();
      if (bErr) throw bErr;
      if (!booking) return null;

      const [{ data: shop }, { data: service }] = await Promise.all([
        supabase.from("shops").select("name, address").eq("id", booking.shop_id).maybeSingle(),
        booking.service_id
          ? supabase.from("services").select("name").eq("id", booking.service_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return { booking, shop, service };
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
            <Link to="/book">{t("book.bookAnother")} <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    );
  }

  const { booking, shop, service } = data;
  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const dateLabel = startsAt.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = `${startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} — ${endsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

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
            <Link to="/book">{t("book.bookAnother")} <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">{t("book.backHome")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
// regenerated
