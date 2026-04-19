// Live booking flow — wired to Supabase.
// Persists customer + booking + unpaid payment row in one transaction-like sequence,
// with a server-side overlap check to prevent double-booking the same staff member.

import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Sparkle, Loader2, Beaker } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

const TIME_SLOTS = ["09:00", "10:30", "11:30", "13:00", "14:30", "16:00", "17:30", "18:30"];

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
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Keep shopId in sync if URL changes
  useEffect(() => {
    if (presetShopId && shopId !== presetShopId) setShopId(presetShopId);
  }, [presetShopId, shopId]);

  // Public app settings (demo mode toggles)
  const { data: appSettings } = useQuery(publicAppSettingsQuery());

  // Fetch active shops directly (no shop_id needed)
  const shopsQ = useQuery({
    queryKey: ["public", "shops", appSettings?.public_booking_on_demo_shops_enabled, appSettings?.seeded_demo_data_visible],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shops").select("id, name, slug, address, is_demo").eq("status", "active");
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

  // When preselected, fetch the single shop directly so summary works without the full list.
  const presetShopQ = useQuery({
    queryKey: ["shop-preset", presetShopId],
    enabled: !!presetShopId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shops").select("id, name, slug, address, is_demo").eq("id", presetShopId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const selectedShop = shopsQ.data?.find((s) => s.id === shopId) ?? presetShopQ.data ?? null;
  const isDemoShop = !!selectedShop?.is_demo;
  const selectedService = servicesQ.data?.find((s) => s.id === serviceId);
  const selectedStaff = staffQ.data?.find((s) => s.id === staffId);

  // Logical-step index (0..5). When preset, we hide step 0 (shop) by mapping visible step n to logical n+1.
  const logicalStep = presetShopId ? step + 1 : step;
  const canNext = [shopId, serviceId, staffId, date && time, name && phone && email, true][logicalStep];

  const back = () => (step > 0 ? setStep(step - 1) : navigate({ to: "/" }));

  const handleSubmit = async () => {
    if (!shopId || !serviceId || !selectedService || !date || !time) return;
    setSubmitting(true);
    try {
      const startsAt = new Date(`${date}T${time}:00`);
      const endsAt = new Date(startsAt.getTime() + selectedService.duration_minutes * 60_000);
      const realStaffId = staffId === "any" ? null : staffId;

      // Slot conflict check (only if a specific staff is chosen)
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

      // Upsert customer (by email within shop)
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

      // Insert booking
      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .insert({
          shop_id: shopId,
          service_id: serviceId,
          staff_id: realStaffId,
          customer_id: customerId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: "pending",
          price_cents: selectedService.price_cents,
          deposit_cents: selectedService.deposit_cents,
          currency: selectedService.currency,
          notes: note || null,
        })
        .select("id").single();
      if (bErr) throw bErr;

      // Insert unpaid payment stub (Mollie Connect-ready)
      const amountDue = selectedService.deposit_cents > 0 ? selectedService.deposit_cents : selectedService.price_cents;
      await supabase.from("payments").insert({
        shop_id: shopId,
        booking_id: booking.id,
        amount_cents: amountDue,
        currency: selectedService.currency,
        status: "unpaid",
        provider: "mollie",
      });

      // Fire-and-forget: send confirmation email (respects shop automation toggle)
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

  const dates = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return { value: d.toISOString().slice(0, 10), label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) };
  }), []);

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

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs">
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

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
            {step === 0 && (
              <Section title={t("book.chooseShop")} subtitle={t("book.chooseShopSub")}>
                {shopsQ.isLoading ? <SkeletonGrid /> : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(shopsQ.data ?? []).map((s) => (
                      <button key={s.id} onClick={() => setShopId(s.id)}
                        className={cn("group rounded-2xl border p-4 text-left transition-all",
                          shopId === s.id ? "border-primary bg-primary-soft/40 shadow-soft" : "border-border hover:border-primary/40 hover:bg-muted/40")}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-warm text-sm font-semibold text-pink-foreground">{s.name[0]}</div>
                          <div>
                            <p className="font-semibold">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.address ?? s.slug}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {step === 1 && (
              <Section title={t("book.chooseService")} subtitle={t("book.chooseServiceSub")}>
                {servicesQ.isLoading ? <SkeletonGrid /> : (
                  <div className="space-y-2">
                    {(servicesQ.data ?? []).filter((s) => s.is_active).map((s) => (
                      <button key={s.id} onClick={() => setServiceId(s.id)}
                        className={cn("flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all",
                          serviceId === s.id ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/40")}>
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.category ?? "—"} · {s.duration_minutes} min</p>
                        </div>
                        <p className="text-sm font-semibold">€{(s.price_cents / 100).toFixed(2)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {step === 2 && (
              <Section title={t("book.chooseStaff")} subtitle={t("book.chooseStaffSub")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button onClick={() => setStaffId("any")}
                    className={cn("rounded-2xl border p-4 text-left",
                      staffId === "any" ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/40")}>
                    <p className="font-medium">{t("book.anyAvailable")}</p>
                    <p className="text-xs text-muted-foreground">{t("book.firstOpenSlot")}</p>
                  </button>
                  {(staffQ.data ?? []).filter((s) => s.is_active).map((s) => (
                    <button key={s.id} onClick={() => setStaffId(s.id)}
                      className={cn("rounded-2xl border p-4 text-left",
                        staffId === s.id ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/40")}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-sm font-semibold text-mint-foreground">
                          {s.full_name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <p className="font-medium">{s.full_name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {step === 3 && (
              <Section title={t("book.pickDate")} subtitle={t("book.pickDateSub")}>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                  {dates.map((d) => (
                    <button key={d.value} onClick={() => setDate(d.value)}
                      className={cn("rounded-xl border p-3 text-sm",
                        date === d.value ? "border-primary bg-primary-soft/40 font-semibold" : "border-border hover:bg-muted/40")}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="mt-6">
                  <p className="mb-2 text-sm font-medium">{t("book.availableTimes")}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {TIME_SLOTS.map((tm) => (
                      <button key={tm} onClick={() => setTime(tm)} disabled={!date}
                        className={cn("rounded-xl border p-2.5 text-sm disabled:opacity-50",
                          time === tm ? "border-primary bg-primary-soft/40 font-semibold" : "border-border hover:bg-muted/40")}>
                        {tm}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {step === 4 && (
              <Section title={t("book.yourDetails")} subtitle={t("book.yourDetailsSub")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("book.fullName")} value={name} onChange={setName} placeholder="Sophia Reyes" />
                  <Field label={t("book.phone")} value={phone} onChange={setPhone} placeholder="+31 6 1234 5678" />
                  <div className="sm:col-span-2">
                    <Field label={t("book.email")} value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium">{t("book.noteOptional")}</label>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                      placeholder={t("book.notePlaceholder")}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>
              </Section>
            )}

            {step === 5 && (
              <Section title={t("book.reviewConfirm")} subtitle={t("book.reviewSub")}>
                <dl className="space-y-3 text-sm">
                  <Row label={t("book.shop")} value={selectedShop?.name ?? "—"} />
                  <Row label={t("book.service")} value={selectedService?.name ?? "—"} />
                  <Row label={t("book.with")} value={staffId === "any" ? t("book.anyAvailable") : selectedStaff?.full_name ?? "—"} />
                  <Row label={t("book.when")} value={`${date ?? "—"} · ${time ?? "—"}`} />
                  <Row label={t("book.customerLabel")} value={`${name} · ${phone}`} />
                  {selectedService && (
                    <>
                      <Row label={t("book.durationLabel")} value={`${selectedService.duration_minutes} min`} />
                      <Row label={t("book.price")} value={`€${(selectedService.price_cents / 100).toFixed(2)}`} />
                      {selectedService.deposit_cents > 0 && (
                        <Row label={t("book.depositDue")} value={`€${(selectedService.deposit_cents / 100).toFixed(2)}`} />
                      )}
                    </>
                  )}
                </dl>
                <p className="mt-6 rounded-xl bg-mint/40 p-3 text-xs text-mint-foreground">{t("book.stripeNotice")}</p>
              </Section>
            )}

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={back} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" /> {t("book.back")}
              </Button>
              <Button variant="hero" onClick={next} disabled={!canNext || submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {step === stepLabels.length - 1 ? t("book.confirmBooking") : t("book.continue")}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <aside className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("book.summary")}</p>
            <div className="mt-3 space-y-2 text-sm">
              <SummaryRow label={t("book.shop")} value={selectedShop?.name ?? "—"} />
              <SummaryRow label={t("book.service")} value={selectedService?.name ?? "—"} />
              <SummaryRow label={t("book.with")} value={staffId === "any" ? t("book.anyAvailable") : selectedStaff?.full_name ?? "—"} />
              <SummaryRow label={t("book.date")} value={date ?? "—"} />
              <SummaryRow label={t("book.time")} value={time ?? "—"} />
            </div>
            {selectedService && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("book.total")}</span>
                  <span className="font-semibold">€{(selectedService.price_cents / 100).toFixed(2)}</span>
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

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
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
