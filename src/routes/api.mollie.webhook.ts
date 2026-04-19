// Phase 4 webhook scaffold for Mollie payment events.
// Structure-only: verifies the request, looks up the payment, and records the event.
// When real Mollie keys are wired in, replace the TODO with a Mollie API call to
// fetch the payment status (`mollie.payments.get(id)`) and update accordingly.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/mollie/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Mollie posts application/x-www-form-urlencoded with a single `id` field.
          const ct = request.headers.get("content-type") ?? "";
          let mollieId: string | null = null;
          if (ct.includes("application/json")) {
            const body = (await request.json().catch(() => null)) as { id?: string } | null;
            mollieId = body?.id ?? null;
          } else {
            const form = await request.formData().catch(() => null);
            mollieId = form?.get("id")?.toString() ?? null;
          }

          if (!mollieId) {
            return new Response(JSON.stringify({ error: "missing_id" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // TODO (Phase 4): fetch real payment from Mollie and map status.
          // For now we accept the ping and log it so admins can see traffic landed.
          const { data: payment } = await supabaseAdmin
            .from("payments")
            .select("id, shop_id, status")
            .eq("provider_payment_id", mollieId)
            .maybeSingle();

          await supabaseAdmin.from("activity_log").insert({
            entity: "mollie_webhook",
            action: "received",
            shop_id: payment?.shop_id ?? null,
            metadata: { mollie_id: mollieId, current_status: payment?.status ?? null },
          });

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[mollie/webhook] error:", err);
          // Mollie retries on non-2xx, so only return 500 for genuine failures.
          return new Response(JSON.stringify({ error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
