import { useState } from "react";
import { ChevronDown, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Cell = boolean | string | { type: "addon"; price: string } | { type: "soon" };

type Row = { label: string; values: [Cell, Cell, Cell, Cell] };
type Group = { category: string; rows: Row[] };

const GROUPS: Group[] = [
  {
    category: "Basis",
    rows: [
      { label: "Online boekingspagina", values: [true, true, true, true] },
      { label: "Kalender & afspraken", values: [true, true, true, true] },
      { label: "Klantendatabase", values: [true, true, true, true] },
      { label: "Mollie koppeling", values: [true, true, true, true] },
      { label: "E-mail herinneringen", values: [true, true, true, true] },
    ],
  },
  {
    category: "Limieten",
    rows: [
      { label: "Boekingen per maand", values: ["30", "∞", "∞", "∞"] },
      { label: "Medewerkers", values: ["1", "3", "10", "∞"] },
      { label: "Platform fee", values: ["0%", "1,5%", "1,0%", "0,5%"] },
    ],
  },
  {
    category: "Communicatie",
    rows: [
      { label: "SMS herinneringen", values: [false, "100/m", "300/m", "1000/m"] },
      { label: "WhatsApp herinneringen", values: [false, false, "200/m", "500/m"] },
      { label: "Marketing e-mails", values: [false, "50/m", "200/m", "∞"] },
    ],
  },
  {
    category: "Geavanceerd",
    rows: [
      { label: "Geavanceerde statistieken", values: [false, false, true, true] },
      { label: "Eigen branding", values: [false, false, true, true] },
      { label: "Google Reviews", values: [false, false, { type: "addon", price: "+€9" }, true] },
      { label: "Wachtlijst", values: [false, false, { type: "addon", price: "+€9" }, true] },
    ],
  },
  {
    category: "Enterprise",
    rows: [
      { label: "Multi-locatie", values: [false, false, false, { type: "addon", price: "+€29/loc" }] },
      { label: "White-label", values: [false, false, false, { type: "addon", price: "+€49" }] },
      { label: "API access", values: [false, false, false, true] },
      { label: "Stripe (internationaal)", values: [false, false, false, { type: "soon" }] },
    ],
  },
  {
    category: "Support",
    rows: [
      { label: "E-mail support", values: [true, true, true, true] },
      { label: "Chat support", values: [false, true, true, true] },
      { label: "Telefoon support", values: [false, false, true, true] },
      { label: "Account manager", values: [false, false, false, true] },
    ],
  },
];

const PLANS = ["Trial", "Starter", "Pro", "Premium"] as const;

function CellContent({ value }: { value: Cell }) {
  if (value === true) {
    return <Check className="mx-auto h-5 w-5 text-success-foreground" aria-label="Inbegrepen" />;
  }
  if (value === false) {
    return <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Niet inbegrepen" />;
  }
  if (typeof value === "string") {
    return <span className="font-bold text-foreground">{value}</span>;
  }
  if (value.type === "addon") {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
        {value.price}
      </span>
    );
  }
  return <span className="text-xs italic text-muted-foreground">Binnenkort</span>;
}

export function PricingComparisonTable() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto mt-10 max-w-6xl">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-muted"
        >
          {open ? "Verberg vergelijking" : "Vergelijk alle functies"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          {/* Mobile note */}
          <p className="border-b border-border bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground sm:hidden">
            Veeg horizontaal om alle plannen te zien
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <th
                    className="sticky left-0 z-20 min-w-[180px] bg-card px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:min-w-[220px]"
                    scope="col"
                  >
                    Functie
                  </th>
                  {PLANS.map((plan) => {
                    const isPro = plan === "Pro";
                    return (
                      <th
                        key={plan}
                        scope="col"
                        className={cn(
                          "px-3 py-4 text-center text-sm font-semibold",
                          isPro
                            ? "bg-primary/10 text-primary"
                            : "text-foreground"
                        )}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span>{plan}</span>
                          {isPro && (
                            <span className="rounded-full bg-gradient-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                              Meest populair
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => (
                  <>
                    <tr key={`cat-${group.category}`} className="bg-muted/40">
                      <td
                        colSpan={5}
                        className="sticky left-0 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {group.category}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr
                        key={`${group.category}-${row.label}`}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-sm font-medium text-foreground"
                        >
                          {row.label}
                        </th>
                        {row.values.map((v, i) => (
                          <td
                            key={i}
                            className={cn(
                              "px-3 py-3 text-center",
                              PLANS[i] === "Pro" && "bg-primary/5"
                            )}
                          >
                            <CellContent value={v} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
            Add-ons (paarse badges) zijn binnenkort los bij te boeken bovenop je abonnement.
          </div>
        </div>
      )}
    </div>
  );
}
