import { Link } from "@tanstack/react-router";
import { Mail, FileText, Shield, RotateCcw, ChevronRight } from "lucide-react";
import { SupportLayout, CompanyFootnote } from "@/site/support/SupportLayout";
import { useT } from "@/shared/lib/i18n";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_KEYS = ["payments", "connect", "payouts", "cancel", "refunds"] as const;

const LEGAL = [
  { to: "/legal/privacy", labelKey: "support.legal.privacy", icon: Shield },
  { to: "/legal/terms", labelKey: "support.legal.terms", icon: FileText },
  { to: "/legal/refunds", labelKey: "support.legal.refunds", icon: RotateCcw },
] as const;

export function SupportPage() {
  const { t } = useT();
  return (
    <SupportLayout title={t("support.title")} subtitle={t("support.subtitle")}>
      <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
        <Accordion type="single" collapsible className="w-full">
          {FAQ_KEYS.map((key, i) => (
            <AccordionItem key={key} value={`item-${i}`} className="border-border/60 last:border-b-0">
              <AccordionTrigger className="px-3 text-left text-sm font-medium">
                {t(`support.faq.${key}.q`)}
              </AccordionTrigger>
              <AccordionContent className="px-3 text-sm text-muted-foreground">
                {t(`support.faq.${key}.a`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t("support.contact")}</h2>
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          <a href="mailto:support@flowybookings.com" className="block text-primary hover:underline">
            support@flowybookings.com
          </a>
          <a href="mailto:info@flowybookings.com" className="block text-primary hover:underline">
            info@flowybookings.com
          </a>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("support.legal")}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {LEGAL.map((l, idx) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-muted/60 ${
                  idx < LEGAL.length - 1 ? "border-b border-border/60" : ""
                }`}
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 font-medium">{t(l.labelKey)}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </section>

      <CompanyFootnote />
    </SupportLayout>
  );
}
