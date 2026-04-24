import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Cell = boolean | string | { type: "addon"; price: string } | { type: "soon" };
type Row = { labelKey: string; values: [Cell, Cell, Cell, Cell] };
type Group = { categoryKey: string; rows: Row[] };

const PLANS = ["Trial", "Starter", "Pro", "Premium"] as const;

function CellContent({ value }: { value: Cell }) {
  const { t } = useT();
  if (value === true) {
    return <Check className="mx-auto h-5 w-5 text-success-foreground" aria-label={t("pricing.compare.val.included")} />;
  }
  if (value === false) {
    return <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label={t("pricing.compare.val.notIncluded")} />;
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
  return <span className="text-xs italic text-muted-foreground">{t("pricing.compare.val.soon")}</span>;
}

export function PricingComparisonTable() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const groups: Group[] = useMemo(() => {
    const unl = t("pricing.compare.val.unlimited");
    const noFee = t("pricing.compare.val.noFee");
    const starterFee = t("pricing.compare.val.starterFee");
    const proFee = t("pricing.compare.val.proFee");
    return [
      {
        categoryKey: "pricing.compare.cat.basic",
        rows: [
          { labelKey: "pricing.compare.row.bookingPage", values: [true, true, true, true] },
          { labelKey: "pricing.compare.row.calendar", values: [true, true, true, true] },
          { labelKey: "pricing.compare.row.customers", values: [true, true, true, true] },
          { labelKey: "pricing.compare.row.mollie", values: [true, true, true, true] },
          { labelKey: "pricing.compare.row.emailReminders", values: [true, true, true, true] },
        ],
      },
      {
        categoryKey: "pricing.compare.cat.limits",
        rows: [
          { labelKey: "pricing.compare.row.bookingsPerMonth", values: ["30", unl, unl, unl] },
          { labelKey: "pricing.compare.row.staff", values: ["1", "3", "10", unl] },
          { labelKey: "pricing.compare.row.bookingFee", values: [noFee, starterFee, proFee, noFee] },
        ],
      },
      {
        categoryKey: "pricing.compare.cat.communication",
        rows: [
          { labelKey: "pricing.compare.row.smsReminders", values: [false, "100/m", "300/m", "1000/m"] },
          { labelKey: "pricing.compare.row.whatsapp", values: [false, false, "200/m", "500/m"] },
          { labelKey: "pricing.compare.row.marketingEmails", values: [false, "50/m", "200/m", unl] },
        ],
      },
      {
        categoryKey: "pricing.compare.cat.advanced",
        rows: [
          { labelKey: "pricing.compare.row.analytics", values: [false, false, true, true] },
          { labelKey: "pricing.compare.row.branding", values: [false, false, true, true] },
          { labelKey: "pricing.compare.row.reviews", values: [false, false, { type: "addon", price: "+€9" }, true] },
          { labelKey: "pricing.compare.row.waitlist", values: [false, false, { type: "addon", price: "+€9" }, true] },
        ],
      },
      {
        categoryKey: "pricing.compare.cat.enterprise",
        rows: [
          { labelKey: "pricing.compare.row.multiLocation", values: [false, false, false, { type: "addon", price: "+€29/loc" }] },
          { labelKey: "pricing.compare.row.whiteLabel", values: [false, false, false, { type: "addon", price: "+€49" }] },
          { labelKey: "pricing.compare.row.api", values: [false, false, false, true] },
          { labelKey: "pricing.compare.row.stripe", values: [false, false, false, { type: "soon" }] },
        ],
      },
      {
        categoryKey: "pricing.compare.cat.support",
        rows: [
          { labelKey: "pricing.compare.row.emailSupport", values: [true, true, true, true] },
          { labelKey: "pricing.compare.row.chatSupport", values: [false, true, true, true] },
          { labelKey: "pricing.compare.row.phoneSupport", values: [false, false, true, true] },
          { labelKey: "pricing.compare.row.accountManager", values: [false, false, false, true] },
        ],
      },
    ];
  }, [t]);

  return (
    <div className="mx-auto mt-10 max-w-6xl">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-muted"
        >
          {open ? t("pricing.compare.toggle.hide") : t("pricing.compare.toggle.show")}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <p className="border-b border-border bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground sm:hidden">
            {t("pricing.compare.swipeHint")}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border">
                  <th
                    className="sticky left-0 z-20 min-w-[180px] bg-card px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:min-w-[220px]"
                    scope="col"
                  >
                    {t("pricing.compare.feature")}
                  </th>
                  {PLANS.map((plan) => {
                    const isPro = plan === "Pro";
                    return (
                      <th
                        key={plan}
                        scope="col"
                        className={cn(
                          "px-3 py-4 text-center text-sm font-semibold",
                          isPro ? "bg-primary/10 text-primary" : "text-foreground"
                        )}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span>{plan}</span>
                          {isPro && (
                            <span className="rounded-full bg-gradient-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                              {t("pricing.mostPopular")}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={`cat-${group.categoryKey}`}>
                    <tr className="bg-muted/40">
                      <td
                        colSpan={5}
                        className="sticky left-0 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {t(group.categoryKey)}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr
                        key={`${group.categoryKey}-${row.labelKey}`}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-sm font-medium text-foreground"
                        >
                          {t(row.labelKey)}
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
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
            {t("pricing.compare.addonsNote")}
          </div>
        </div>
      )}
    </div>
  );
}
