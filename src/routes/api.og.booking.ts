// Dynamische OG-image voor /book/confirmation/$bookingId
// Toont: ✓ bevestigd, shopnaam (+logo), dienst, datum & tijd.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchLogoAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2_000_000) return null;
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatDateNl(date: Date): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "long", day: "numeric", month: "long",
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

function formatTimeRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });
  return `${fmt.format(start)} — ${fmt.format(end)}`;
}

function buildSvg(opts: {
  shopName: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  logoDataUri: string | null;
  initial: string;
}) {
  const shopName = escapeXml(truncate(opts.shopName, 36));
  const serviceName = escapeXml(truncate(opts.serviceName, 42));
  const dateLabel = escapeXml(truncate(opts.dateLabel, 38));
  const timeLabel = escapeXml(opts.timeLabel);
  const initial = escapeXml(opts.initial);

  const logoBlock = opts.logoDataUri
    ? `<defs>
         <clipPath id="logoClip">
           <rect x="120" y="120" width="120" height="120" rx="24" />
         </clipPath>
       </defs>
       <rect x="120" y="120" width="120" height="120" rx="24" fill="#1a1f2e" stroke="#2a3142" stroke-width="2" />
       <image href="${opts.logoDataUri}" x="120" y="120" width="120" height="120" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="120" y="120" width="120" height="120" rx="24" fill="url(#logoBg)" />
       <text x="180" y="208" font-family="DM Sans, sans-serif" font-size="64" font-weight="700" fill="white" text-anchor="middle">${initial}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0f1a" />
      <stop offset="100%" stop-color="#141a2b" />
    </linearGradient>
    <linearGradient id="logoBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cff" />
      <stop offset="100%" stop-color="#5b8cff" />
    </linearGradient>
    <linearGradient id="success" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#22d3ee" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="0" y="0" width="1200" height="6" fill="url(#success)" />

  ${logoBlock}

  <!-- Shop -->
  <text x="280" y="170" font-family="DM Sans, sans-serif" font-size="22" fill="#7c5cff" font-weight="600" letter-spacing="2">FLOWYBOOKINGS</text>
  <text x="280" y="220" font-family="DM Sans, sans-serif" font-size="40" font-weight="700" fill="white">${shopName}</text>

  <!-- Confirmed pill -->
  <g>
    <rect x="120" y="290" width="280" height="52" rx="26" fill="rgba(16,185,129,0.15)" stroke="#10b981" stroke-width="2" />
    <circle cx="155" cy="316" r="12" fill="#10b981" />
    <path d="M149 316 L154 321 L162 311" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    <text x="180" y="324" font-family="DM Sans, sans-serif" font-size="20" font-weight="600" fill="#10b981">Boeking bevestigd</text>
  </g>

  <!-- Service -->
  <text x="120" y="400" font-family="DM Sans, sans-serif" font-size="20" fill="#8892a6">Dienst</text>
  <text x="120" y="438" font-family="DM Sans, sans-serif" font-size="36" font-weight="600" fill="white">${serviceName}</text>

  <!-- Date & time -->
  <text x="120" y="500" font-family="DM Sans, sans-serif" font-size="20" fill="#8892a6">Wanneer</text>
  <text x="120" y="538" font-family="DM Sans, sans-serif" font-size="32" font-weight="600" fill="white">${dateLabel}</text>
  <text x="120" y="578" font-family="DM Sans, sans-serif" font-size="26" fill="#a8b2c7">${timeLabel}</text>
</svg>`;
}

export const Route = createFileRoute("/api/og/booking")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const bookingId = url.searchParams.get("id");

        let shopName = "Boeking bevestigd";
        let serviceName = "Je afspraak";
        let dateLabel = "";
        let timeLabel = "";
        let logoUrl: string | null = null;

        if (bookingId) {
          const { data: booking } = await supabaseAdmin
            .from("bookings")
            .select("starts_at, ends_at, shop_id, service_id")
            .eq("id", bookingId)
            .maybeSingle();

          if (booking) {
            const [{ data: shop }, { data: service }] = await Promise.all([
              supabaseAdmin
                .from("shops")
                .select("name, logo_url")
                .eq("id", booking.shop_id)
                .maybeSingle(),
              booking.service_id
                ? supabaseAdmin
                    .from("services")
                    .select("name")
                    .eq("id", booking.service_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
            ]);
            if (shop) {
              shopName = shop.name ?? shopName;
              logoUrl = shop.logo_url ?? null;
            }
            if (service?.name) serviceName = service.name;
            const start = new Date(booking.starts_at);
            const end = new Date(booking.ends_at);
            dateLabel = formatDateNl(start);
            timeLabel = formatTimeRange(start, end);
          }
        }

        const logoDataUri = logoUrl ? await fetchLogoAsDataUri(logoUrl) : null;
        const initial = (shopName.trim().charAt(0) || "F").toUpperCase();

        const svg = buildSvg({ shopName, serviceName, dateLabel, timeLabel, logoDataUri, initial });

        return new Response(svg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
