import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, FileText, Shield, RotateCcw, ChevronRight } from "lucide-react";
import { SupportLayout, CompanyFootnote } from "@/components/SupportLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — FlowyBookings" },
      { name: "description", content: "Help, FAQ, contact, and legal information for FlowyBookings." },
      { property: "og:title", content: "Support — FlowyBookings" },
      { property: "og:description", content: "Help, FAQ, contact, and legal information for FlowyBookings." },
    ],
  }),
  component: SupportPage,
});

const FAQ = [
  {
    q: "How do I receive payments?",
    a: "Payments are processed through Mollie and paid directly to your connected account.",
  },
  {
    q: "How do I connect Mollie?",
    a: "Go to your dashboard → Payments → Connect Mollie and follow the steps.",
  },
  {
    q: "When do I get paid?",
    a: "Payouts are handled by Mollie and depend on your account settings.",
  },
  {
    q: "Can customers cancel bookings?",
    a: "Yes, depending on your cancellation policy set by the shop.",
  },
  {
    q: "How do refunds work?",
    a: "Refunds are handled by the shop. FlowyBookings does not process refunds directly.",
  },
];

const LEGAL = [
  { to: "/legal/privacy", label: "Privacy Policy", icon: Shield },
  { to: "/legal/terms", label: "Terms & Conditions", icon: FileText },
  { to: "/legal/refunds", label: "Refund Policy", icon: RotateCcw },
] as const;

function SupportPage() {
  return (
    <SupportLayout title="Support" subtitle="Help, information, and policies">
      <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-border/60 last:border-b-0">
              <AccordionTrigger className="px-3 text-left text-sm font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="px-3 text-sm text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Contact us</h2>
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
          Legal
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
                <span className="flex-1 font-medium">{l.label}</span>
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
