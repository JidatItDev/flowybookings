// Live booking flow — wired to Supabase.
// Stappen: Winkel → Dienst → Medewerker → Datum/tijd → Gegevens → Overzicht & betaling.
// Echte beschikbaarheid: openingstijden uit shops.business_hours + conflict-check op bookings.
// Mobile-first, donker-thema vriendelijk via design tokens.

import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkle,
  Loader2,
  Beaker,
  CalendarIcon,
  Clock,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl as nlLocale } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { servicesQuery, staffQuery } from "@/lib/queries";
import { publicAppSettingsQuery } from "@/lib/app-settings";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";

type BookSearch = { shop?: string };

export const Route = createFileRoute("/book")({
  validateSearch: (s: Record<string, unknown>): BookSearch => ({
    shop: typeof s.shop === "string" ? s.shop : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Een afspraak boeken — FlowyBookings" },
      { name: "description", content: "Kies een winkel, dienst en tijd. Bevestig in seconden." },
    ],
  }),
  component: BookingFlow,
});

// JSON shape voor shops.business_hours: { mon: { open: "09:00", close: "18:00", closed: false }, ... }
type DayHours = { open?: string; close?: string; closed?: boolean };
type BusinessHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>>;

const DAY_KEYS: Array<keyof BusinessHours> = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const SLOT_MINUTES = 30; // raster van 30 min

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fromMin(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function emailValid(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

function BookingFlow() {
  const navigate = useNavigate();
  const { t } = useT();
  const search = Route.useSearch();
  const presetShopId = search.shop ?? null;

  const stepLabels = presetShopId
    ? [t("book.stepService"), t("book.stepStaff"), t("book.stepDateTime"), t("book.stepDetails"), t("book.stepReview")]
    : [t("book.stepShop"), t("book.stepService"), t("book.stepStaff"), t("book.stepDateTime"), t("book.stepDetails"), t("book.stepReview")];

  const [step, setStep] = useState(0);
  const [shopId, setShopId] = useState<string | null>(presetShopId);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined); // Date object voor kalender
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ name?: boolean; phone?: boolean; email?: boolean }>({});

  useEffect(() => {
    if (presetShopId && shopId !== presetShopId) setShopId(presetShopId);
  }, [presetShopId, shopId]);

  const { data: appSettings } = useQuery(publicAppSettingsQuery());

  // Stap 1: alle actieve shops
  const shopsQ = useQuery({
    queryKey: ["public", "shops", appSettings?.public_booking_on_demo_shops_enabled, appSettings?.seeded_demo_data_visible],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, slug, address, is_demo, business_hours, timezone")
        .eq("status", "active");
      if (error) throw error;
      let rows = data ?? [];
      const hideDemo =
        (appSettings && appSettings.public_booking_on_demo_shops_enabled === false) ||
        (appSettings && appSettings.seeded_demo_data_visible === false);
      if (hideDemo) rows = rows.filter((s) => !s.is_demo);
      return rows;
    },
  });

  const servicesQ = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });
  const staffQ = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId });

  // Preset shop direct ophalen wanneer alleen via URL
  const presetShopQ = useQuery({
    queryKey: ["shop-preset", presetShopId],
    enabled: !!presetShopId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, slug, address, is_demo, business_hours, timezone")
        .eq("id", presetShopId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const selectedShop = shopsQ.data?.find((s) => s.id === shopId) ?? presetShopQ.data ?? null;
  const isDemoShop = !!selectedShop?.is_demo;
  const selectedService = servicesQ.data?.find((s) => s.id === serviceId);
  const selectedStaff = staffQ.data?.find((s) => s.id === staffId);

  // Bestaande bookings voor de gekozen dag (om bezette slots te bepalen)
  const dayKey = date ? format(date, "yyyy-MM-dd") : null;
  const bookingsQ = useQuery({
    queryKey: ["public", "bookings", shopId, dayKey, staffId],
    enabled: !!shopId && !!dayKey,
    queryFn: async () => {
      const dayStart = new Date(`${dayKey}T00:00:00`);
      const dayEnd = new Date(`${dayKey}T23:59:59`);
      let q = supabase
        .from("bookings")
        .select("starts_at, ends_at, staff_id, status")
        .eq("shop_id", shopId!)
        .in("status", ["pending", "confirmed"])
        .gte("starts_at", dayStart.toISOString())
        .lte("starts_at", dayEnd.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Bereken slots voor de gekozen datum
  const slots = useMemo(() => {
    if (!date || !selectedShop || !selectedService) return [];
    const businessHours = (selectedShop.business_hours ?? {}) as BusinessHours;
    const dayKey = DAY_KEYS[date.getDay()];
    const hours = businessHours[dayKey];
    if (!hours || hours.closed || !hours.open || !hours.close) return [];

    const openMin = toMin(hours.open);
    const closeMin = toMin(hours.close);
    const dur = selectedService.duration_minutes;
    const allBookings = bookingsQ.data ?? [];
    const realStaffId = staffId === "any" ? null : staffId;
    const now = new Date();

    const list: Array<{ time: string; available: boolean }> = [];
    for (let m = openMin; m + dur <= closeMin; m += SLOT_MINUTES) {
      const slotStart = new Date(date);
      slotStart.setHours(0, 0, 0, 0);
      slotStart.setMinutes(m);
      const slotEnd = new Date(slotStart.getTime() + dur * 60_000);

      // Verleden slots = niet beschikbaar
      if (slotStart < now) {
        list.push({ time: fromMin(m), available: false });
        continue;
      }

      // Conflict check: overlapt met bestaande booking voor dezelfde staff (of welke staff dan ook indien "any")
      const conflict = allBookings.some((b) => {
        if (realStaffId && b.staff_id !== realStaffId) return false;
        const bStart = new Date(b.starts_at);
        const bEnd = new Date(b.ends_at);
        return bStart < slotEnd && bEnd > slotStart;
      });

      list.push({ time: fromMin(m), available: !conflict });
    }
    return list;
  }, [date, selectedShop, selectedService, staffId, bookingsQ.data]);

  const logicalStep = presetShopId ? step + 1 : step;
  const detailsValid = name.trim().length >= 2 && phone.trim().length >= 6 && emailValid(email);
  const canNext = [
    !!shopId,
    !!serviceId,
    !!staffId,
    !!date && !!time,
    detailsValid,
    true,
  ][logicalStep];

  const back = () => (step > 0 ? setStep(step - 1) : navigate({ to: "/" }));

  const handleSubmit = async () => {
    if (!shopId || !serviceId || !selectedService || !date || !time) return;
    setSubmitting(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const startsAt = new Date(`${dateStr}T${time}:00`);
      const endsAt = new Date(startsAt.getTime() + selectedService.duration_minutes * 60_000);
      const realStaffId = staffId === "any" ? null : staffId;

      if (realStaffId) {
        const { data: conflicts, error: cErr } = await supabase
          .from("bookings")
          .select("id")
          .eq("shop_id", shopId)
          .eq("staff_id", realStaffId)
          .in("status", ["pending", "confirmed"])
          .lt("starts_at", endsAt.toISOString())
          .gt("ends_at", startsAt.toISOString());
        if (cErr) throw cErr;
        if (conflicts && conflicts.length > 0) {
          toast.error(t("book.slotTaken"));
          setSubmitting(false);
          return;
        }
      }

      let customerId: string | null = null;
      const { data: existingCust } = await supabase
        .from("customers").select("id").eq("shop_id", shopId).eq("email", email).maybeSingle();
      if (existingCust) {
        customerId = existingCust.id;
      } else {
        const { data: newCust, error: custErr } = await supabase
          .from("customers")
          .insert({ shop_id: shopId, full_name: name, email, phone })
          .select("id").single();
        if (custErr) throw custErr;
        customerId = newCust.id;
      }

      const isPaid = selectedService.price_cents > 0;
      // Demo shops & paid services: simuleer betaling → status "confirmed"
      // Gratis services: meteen "confirmed"
      // Echte (live) betaalde shops: "pending" tot Mollie webhook bevestigt
      const bookingStatus: "pending" | "confirmed" =
        !isPaid || isDemoShop ? "confirmed" : "pending";

      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .insert({
          shop_id: shopId,
          service_id: serviceId,
          staff_id: realStaffId,
          customer_id: customerId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: bookingStatus,
          price_cents: selectedService.price_cents,
          deposit_cents: selectedService.deposit_cents,
          currency: selectedService.currency,
          notes: note || null,
        })
        .select("id").single();
      if (bErr) throw bErr;

      const amountDue = selectedService.deposit_cents > 0 ? selectedService.deposit_cents : selectedService.price_cents;
      if (amountDue > 0) {
        await supabase.from("payments").insert({
          shop_id: shopId,
          booking_id: booking.id,
          amount_cents: amountDue,
          currency: selectedService.currency,
          status: isDemoShop ? "paid" : "unpaid",
          provider: "mollie",
        });
      }

      fetch('/hooks/booking-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      }).catch((e) => console.warn('confirmation email failed', e));

      navigate({ to: "/book/confirmation/$bookingId", params: { bookingId: booking.id } });
    } catch (err) {
      console.error("Booking failed:", err);
      toast.error(err instanceof Error ? err.message : t("book.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step < stepLabels.length - 1) setStep(step + 1);
    else handleSubmit();
  };

  const priceLabel = (cents: number) =>
    cents === 0 ? t("book.free") : `€${(cents / 100).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold">FlowyBookings</span>
          </Link>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">{t("book.secureBooking")}</p>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {isDemoShop && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary-soft/40 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground">
                <Beaker className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="font-semibold">{t("demo.bannerTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("demo.bannerSub")}</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/signup">{t("demo.startTrial")}</Link>
            </Button>
          </div>
        )}

        <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs sm:mb-8">
          {stepLabels.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                i < step && "bg-success text-success-foreground",
                i === step && "bg-gradient-brand text-primary-foreground shadow-sm",
                i > step && "bg-muted text-muted-foreground",
              )}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden font-medium sm:inline", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
              {i < stepLabels.length - 1 && <span className="hidden h-px w-8 bg-border sm:inline-block" />}
            </li>
          ))}
        </ol>

        {/* Mobiel: samenvatting bovenaan. Desktop: rechts. */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Sidebar — verschijnt eerst op mobiel via order, rechts op desktop */}
          <aside className="order-first rounded-2xl border border-border bg-card p-5 shadow-soft lg:order-last lg:sticky lg:top-6 lg:self-start lg:rounded-3xl lg:p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("book.summary")}</p>
            <div className="mt-3 space-y-2 text-sm">
              <SummaryRow label={t("book.shop")} value={selectedShop?.name ?? "—"} />
              <SummaryRow label={t("book.service")} value={selectedService?.name ?? "—"} />
              <SummaryRow label={t("book.with")} value={staffId === "any" ? t("book.anyAvailable") : selectedStaff?.full_name ?? "—"} />
              <SummaryRow label={t("book.date")} value={date ? format(date, "EEE d MMM", { locale: nlLocale }) : "—"} />
              <SummaryRow label={t("book.time")} value={time ?? "—"} />
            </div>
            {selectedService && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("book.total")}</span>
                  <span className="font-semibold">{priceLabel(selectedService.price_cents)}</span>
                </div>
                {selectedService.deposit_cents > 0 && (
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t("book.deposit")}</span>
                    <span>€{(selectedService.deposit_cents / 100).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
          </aside>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:rounded-3xl sm:p-8">
            {logicalStep === 0 && (
              <Section title={t("book.chooseShop")} subtitle={t("book.chooseShopSub")}>
                {shopsQ.isLoading ? <SkeletonGrid /> : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(shopsQ.data ?? []).map((s) => (
                      <button key={s.id} onClick={() => { setShopId(s.id); setServiceId(null); setStaffId(null); setDate(undefined); setTime(null); }}
                        className={cn("group rounded-2xl border p-4 text-left transition-all",
                          shopId === s.id ? "border-primary bg-primary-soft/40 shadow-soft" : "border-border hover:border-primary/40 hover:bg-muted/40")}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-warm text-sm font-semibold text-pink-foreground">{s.name[0]}</div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{s.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{s.address ?? s.slug}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {logicalStep === 1 && (
              <Section title={t("book.chooseService")} subtitle={t("book.chooseServiceSub")}>
                {servicesQ.isLoading ? <SkeletonGrid /> : (
                  <div className="space-y-2">
                    {(servicesQ.data ?? []).filter((s) => s.is_active).map((s) => (
                      <button key={s.id} onClick={() => { setServiceId(s.id); setTime(null); }}
                        className={cn("flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all",
                          serviceId === s.id ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/40")}>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.duration_minutes} min{s.category ? ` · ${s.category}` : ""}</p>
                        </div>
                        <p className={cn("flex-none text-sm font-semibold", s.price_cents === 0 && "text-success")}>
                          {priceLabel(s.price_cents)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {logicalStep === 2 && (
              <Section title={t("book.chooseStaff")} subtitle={t("book.chooseStaffSub")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button onClick={() => { setStaffId("any"); setTime(null); }}
                    className={cn("rounded-2xl border p-4 text-left",
                      staffId === "any" ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/40")}>
                    <p className="font-medium">{t("book.anyAvailable")}</p>
                    <p className="text-xs text-muted-foreground">{t("book.firstOpenSlot")}</p>
                  </button>
                  {(staffQ.data ?? []).filter((s) => s.is_active).map((s) => (
                    <button key={s.id} onClick={() => { setStaffId(s.id); setTime(null); }}
                      className={cn("rounded-2xl border p-4 text-left",
                        staffId === s.id ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/40")}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-sm font-semibold text-mint-foreground">
                          {s.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <p className="font-medium">{s.full_name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {logicalStep === 3 && (
              <Section title={t("book.pickDate")} subtitle={t("book.pickDateSub")}>
                <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
                  <div className="rounded-2xl border border-border bg-background p-2">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => { setDate(d); setTime(null); }}
                      disabled={(d) => {
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        if (d < today) return true;
                        // Max 90 dagen vooruit
                        const max = new Date(); max.setDate(max.getDate() + 90);
                        if (d > max) return true;
                        // Gesloten dagen uitschakelen
                        const businessHours = (selectedShop?.business_hours ?? {}) as BusinessHours;
                        const hk = DAY_KEYS[d.getDay()];
                        const h = businessHours[hk];
                        if (h && (h.closed || !h.open || !h.close)) return true;
                        return false;
                      }}
                      locale={nlLocale}
                      weekStartsOn={1}
                      className="pointer-events-auto"
                    />
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      {t("book.availableTimes")}
                    </p>
                    {!date ? (
                      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        {t("book.pickDateFirst")}
                      </p>
                    ) : bookingsQ.isLoading ? (
                      <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-muted" />)}
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        {t("book.shopClosed")}
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {slots.map((slot) => {
                          const selected = time === slot.time;
                          return (
                            <button
                              key={slot.time}
                              type="button"
                              onClick={() => slot.available && setTime(slot.time)}
                              disabled={!slot.available}
                              className={cn(
                                "rounded-xl border p-2.5 text-sm transition-colors",
                                slot.available && !selected && "border-border hover:bg-muted/40",
                                slot.available && selected && "border-primary bg-primary-soft/40 font-semibold",
                                !slot.available && "cursor-not-allowed border-dashed border-border bg-muted/30 text-muted-foreground line-through",
                              )}
                              aria-disabled={!slot.available}
                              title={slot.available ? slot.time : t("book.slotBusy")}
                            >
                              {slot.time}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {logicalStep === 4 && (
              <Section title={t("book.yourDetails")} subtitle={t("book.yourDetailsSub")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t("book.fullName") + " *"}
                    value={name}
                    onChange={setName}
                    onBlur={() => setTouched((s) => ({ ...s, name: true }))}
                    placeholder="Jan Janssen"
                    error={touched.name && name.trim().length < 2 ? t("book.errName") : undefined}
                  />
                  <Field
                    label={t("book.phone") + " *"}
                    value={phone}
                    onChange={setPhone}
                    onBlur={() => setTouched((s) => ({ ...s, phone: true }))}
                    placeholder="+31 6 1234 5678"
                    type="tel"
                    error={touched.phone && phone.trim().length < 6 ? t("book.errPhone") : undefined}
                  />
                  <div className="sm:col-span-2">
                    <Field
                      label={t("book.email") + " *"}
                      value={email}
                      onChange={setEmail}
                      onBlur={() => setTouched((s) => ({ ...s, email: true }))}
                      placeholder="jij@voorbeeld.nl"
                      type="email"
                      error={touched.email && !emailValid(email) ? t("book.errEmail") : undefined}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium">{t("book.noteOptional")}</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder={t("book.notePlaceholder")}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </Section>
            )}

            {logicalStep === 5 && (
              <Section title={t("book.reviewConfirm")} subtitle={t("book.reviewSub")}>
                <dl className="space-y-3 text-sm">
                  <Row label={t("book.shop")} value={selectedShop?.name ?? "—"} />
                  <Row label={t("book.service")} value={selectedService?.name ?? "—"} />
                  <Row label={t("book.with")} value={staffId === "any" ? t("book.anyAvailable") : selectedStaff?.full_name ?? "—"} />
                  <Row label={t("book.when")} value={date ? `${format(date, "EEEE d MMMM", { locale: nlLocale })} · ${time ?? "—"}` : "—"} />
                  <Row label={t("book.customerLabel")} value={`${name} · ${phone}`} />
                  {selectedService && (
                    <>
                      <Row label={t("book.durationLabel")} value={`${selectedService.duration_minutes} min`} />
                      <Row label={t("book.price")} value={priceLabel(selectedService.price_cents)} />
                      {selectedService.deposit_cents > 0 && (
                        <Row label={t("book.depositDue")} value={`€${(selectedService.deposit_cents / 100).toFixed(2)}`} />
                      )}
                    </>
                  )}
                </dl>
                <p className={cn(
                  "mt-6 rounded-xl p-3 text-xs",
                  isDemoShop ? "bg-primary-soft/60 text-primary" : selectedService && selectedService.price_cents > 0 ? "bg-mint/40 text-mint-foreground" : "bg-muted text-muted-foreground",
                )}>
                  {isDemoShop
                    ? t("demo.paymentNotice")
                    : selectedService && selectedService.price_cents > 0
                      ? t("book.stripeNotice")
                      : t("book.freeNotice")}
                </p>
              </Section>
            )}

            <div className="mt-8 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={back} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" /> {t("book.back")}
              </Button>
              <Button variant="hero" onClick={next} disabled={!canNext || submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {step === stepLabels.length - 1
                  ? selectedService && selectedService.price_cents > 0
                    ? <>
                        <CreditCard className="h-4 w-4" />
                        {t("book.payIdeal").replace("{amount}", `€${(selectedService.price_cents / 100).toFixed(2)}`)}
                      </>
                    : t("book.confirmFree")
                  : t("book.continue")}
                {!submitting && step !== stepLabels.length - 1 && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}</div>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, onBlur, placeholder, type = "text", error }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        type={type}
        aria-invalid={!!error}
        className={cn(
          "h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2",
          error
            ? "border-destructive/60 focus:border-destructive focus:ring-destructive/20"
            : "border-border focus:border-primary/50 focus:ring-primary/20",
        )}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-border py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
