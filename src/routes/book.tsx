import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Sparkle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { services, shops, staff } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book an appointment — Bookly" },
      { name: "description", content: "Choose a shop, service and time. Confirm in seconds." },
    ],
  }),
  component: BookingFlow,
});

const steps = ["Shop", "Service", "Staff", "Date & time", "Your details", "Review"];

function BookingFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [shopId, setShopId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const selectedShop = shops.find((s) => s.id === shopId);
  const selectedService = services.find((s) => s.id === serviceId);
  const selectedStaff = staff.find((s) => s.id === staffId);

  const canNext = [shopId, serviceId, staffId, date && time, name && phone, true][step];

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else navigate({ to: "/book/confirmation" });
  };
  const back = () => (step > 0 ? setStep(step - 1) : navigate({ to: "/" }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold">Bookly</span>
          </Link>
          <p className="text-xs text-muted-foreground">Secure booking · powered by Bookly</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Stepper */}
        <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                  i < step && "bg-success text-success-foreground",
                  i === step && "bg-gradient-brand text-primary-foreground shadow-sm",
                  i > step && "bg-muted text-muted-foreground",
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden font-medium sm:inline",
                  i === step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s}
              </span>
              {i < steps.length - 1 && <span className="hidden h-px w-8 bg-border sm:inline-block" />}
            </li>
          ))}
        </ol>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
            {step === 0 && (
              <Section title="Choose a shop" subtitle="Pick where you'd like to book.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {shops.filter((s) => s.status === "active").map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setShopId(s.id)}
                      className={cn(
                        "group rounded-2xl border p-4 text-left transition-all",
                        shopId === s.id
                          ? "border-primary bg-primary-soft/40 shadow-soft"
                          : "border-border hover:border-primary/40 hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-warm text-sm font-semibold text-pink-foreground">
                          {s.name[0]}
                        </div>
                        <div>
                          <p className="font-semibold">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.type} · {s.city}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {step === 1 && (
              <Section title="Choose a service" subtitle="What can we book for you?">
                <div className="space-y-2">
                  {services.filter((s) => s.active).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setServiceId(s.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all",
                        serviceId === s.id
                          ? "border-primary bg-primary-soft/40"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.category} · {s.duration} min</p>
                      </div>
                      <p className="text-sm font-semibold">€{s.price}</p>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {step === 2 && (
              <Section title="Choose a team member" subtitle="Or pick anyone available.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setStaffId("any")}
                    className={cn(
                      "rounded-2xl border p-4 text-left",
                      staffId === "any" ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <p className="font-medium">Any available</p>
                    <p className="text-xs text-muted-foreground">First open slot</p>
                  </button>
                  {staff.filter((s) => s.active).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStaffId(s.id)}
                      className={cn(
                        "rounded-2xl border p-4 text-left",
                        staffId === s.id ? "border-primary bg-primary-soft/40" : "border-border hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-sm font-semibold text-mint-foreground">
                          {s.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.role}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {step === 3 && (
              <Section title="Pick a date & time" subtitle="Available slots in the next 7 days.">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() + i);
                    const label = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
                    const value = d.toISOString().slice(0, 10);
                    return (
                      <button
                        key={value}
                        onClick={() => setDate(value)}
                        className={cn(
                          "rounded-xl border p-3 text-sm",
                          date === value ? "border-primary bg-primary-soft/40 font-semibold" : "border-border hover:bg-muted/40",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6">
                  <p className="mb-2 text-sm font-medium">Available times</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {["09:00", "10:30", "11:30", "13:00", "14:30", "16:00", "17:30", "18:30"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTime(t)}
                        disabled={!date}
                        className={cn(
                          "rounded-xl border p-2.5 text-sm disabled:opacity-50",
                          time === t ? "border-primary bg-primary-soft/40 font-semibold" : "border-border hover:bg-muted/40",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {step === 4 && (
              <Section title="Your details" subtitle="We'll send your confirmation here.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" value={name} onChange={setName} placeholder="Sophia Reyes" />
                  <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 415 555 0102" />
                  <div className="sm:col-span-2">
                    <Field label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium">Note (optional)</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder="Anything we should know?"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </Section>
            )}

            {step === 5 && (
              <Section title="Review & confirm" subtitle="Almost done — review your booking.">
                <dl className="space-y-3 text-sm">
                  <Row label="Shop" value={selectedShop?.name ?? "—"} />
                  <Row label="Service" value={selectedService?.name ?? "—"} />
                  <Row label="With" value={staffId === "any" ? "Any available" : selectedStaff?.name ?? "—"} />
                  <Row label="When" value={`${date ?? "—"} · ${time ?? "—"}`} />
                  <Row label="Customer" value={`${name} · ${phone}`} />
                  {selectedService && (
                    <>
                      <Row label="Duration" value={`${selectedService.duration} min`} />
                      <Row label="Price" value={`€${selectedService.price}`} />
                      {selectedService.deposit > 0 && (
                        <Row label="Deposit due" value={`€${selectedService.deposit}`} />
                      )}
                    </>
                  )}
                </dl>
                <p className="mt-6 rounded-xl bg-mint/40 p-3 text-xs text-mint-foreground">
                  After confirming you'll be sent to the secure deposit step (Stripe / Mollie).
                </p>
              </Section>
            )}

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" onClick={back}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button variant="hero" onClick={next} disabled={!canNext}>
                {step === steps.length - 1 ? "Confirm booking" : "Continue"} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Summary */}
          <aside className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</p>
            <div className="mt-3 space-y-2 text-sm">
              <SummaryRow label="Shop" value={selectedShop?.name ?? "—"} />
              <SummaryRow label="Service" value={selectedService?.name ?? "—"} />
              <SummaryRow label="With" value={staffId === "any" ? "Any available" : selectedStaff?.name ?? "—"} />
              <SummaryRow label="Date" value={date ?? "—"} />
              <SummaryRow label="Time" value={time ?? "—"} />
            </div>
            {selectedService && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">€{selectedService.price}</span>
                </div>
                {selectedService.deposit > 0 && (
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Deposit</span>
                    <span>€{selectedService.deposit}</span>
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

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      />
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
