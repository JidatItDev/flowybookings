// Dynamische OG-image voor /book?shop=<id>
// Renders een SVG (1200x630) met shop-logo + naam + branding van FlowyBookings.
// SVG werkt op WhatsApp, Twitter/X, LinkedIn en Slack als preview.

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
    // Limit ~2MB to avoid huge SVGs
    if (buf.byteLength > 2_000_000) return null;
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function buildSvg(opts: { name: string; tagline: string; logoDataUri: string | null; initial: string }) {
  const { name, tagline, logoDataUri, initial } = opts;
  const safeName = escapeXml(name);
  const safeTagline = escapeXml(tagline);
  const safeInitial = escapeXml(initial);

  // Truncate erg lange namen visueel
  const displayName = safeName.length > 38 ? safeName.slice(0, 35) + "…" : safeName;

  const logoBlock = logoDataUri
    ? `<defs>
         <clipPath id="logoClip">
           <rect x="120" y="215" width="200" height="200" rx="32" />
         </clipPath>
       </defs>
       <rect x="120" y="215" width="200" height="200" rx="32" fill="#1a1f2e" stroke="#2a3142" stroke-width="2" />
       <image href="${logoDataUri}" x="120" y="215" width="200" height="200" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="120" y="215" width="200" height="200" rx="32" fill="url(#logoBg)" />
       <text x="220" y="345" font-family="DM Sans, sans-serif" font-size="110" font-weight="700" fill="white" text-anchor="middle">${safeInitial}</text>`;

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
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7c5cff" />
      <stop offset="100%" stop-color="#22d3ee" />
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)" />

  <!-- Subtle accent stripe -->
  <rect x="0" y="0" width="1200" height="6" fill="url(#accent)" />

  <!-- Brand label -->
  <text x="120" y="140" font-family="DM Sans, sans-serif" font-size="26" font-weight="600" fill="#7c5cff" letter-spacing="2">FLOWYBOOKINGS</text>
  <text x="120" y="180" font-family="DM Sans, sans-serif" font-size="22" fill="#8892a6">Online afspraak boeken</text>

  ${logoBlock}

  <!-- Shop name + tagline -->
  <text x="360" y="305" font-family="DM Sans, sans-serif" font-size="60" font-weight="700" fill="white">${displayName}</text>
  <text x="360" y="355" font-family="DM Sans, sans-serif" font-size="28" fill="#a8b2c7">${safeTagline}</text>

  <!-- CTA pill -->
  <rect x="360" y="390" width="280" height="56" rx="28" fill="url(#accent)" />
  <text x="500" y="426" font-family="DM Sans, sans-serif" font-size="22" font-weight="600" fill="#0b0f1a" text-anchor="middle">Boek nu online →</text>

  <!-- Footer -->
  <text x="120" y="580" font-family="DM Sans, sans-serif" font-size="20" fill="#6b7488">Snel · Veilig · 24/7 beschikbaar</text>
</svg>`;
}

export const Route = createFileRoute("/api/og/book")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const shopId = url.searchParams.get("shop");

        let name = "Boek je afspraak";
        let tagline = "Kies een dienst, tijd en bevestig in seconden.";
        let logoUrl: string | null = null;

        if (shopId) {
          const { data } = await supabaseAdmin
            .from("shops")
            .select("name, logo_url, address")
            .eq("id", shopId)
            .eq("status", "active")
            .maybeSingle();
          if (data) {
            name = data.name ?? name;
            tagline = data.address ? `${data.address}` : "Boek direct online";
            logoUrl = data.logo_url ?? null;
          }
        }

        const logoDataUri = logoUrl ? await fetchLogoAsDataUri(logoUrl) : null;
        const initial = (name.trim().charAt(0) || "F").toUpperCase();

        const svg = buildSvg({ name, tagline, logoDataUri, initial });

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
