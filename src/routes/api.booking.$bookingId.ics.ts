// Genereert een .ics calendar-bestand voor een booking.
// Compatible met Google Calendar, Apple Calendar en Outlook.
// Inclusief locatie en VALARM herinnering 24u van tevoren.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Escape ICS text per RFC 5545: backslash, comma, semicolon, newline.
function escapeIcs(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 line folding: max 75 octets per line, continuation starts with single space.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + 75);
    out.push(i === 0 ? chunk : " " + chunk);
    i += 75;
  }
  return out.join("\r\n");
}

// Format Date as UTC ICS timestamp: YYYYMMDDTHHMMSSZ
function toIcsUtc(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

export const Route = createFileRoute("/api/booking/$bookingId/ics")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const bookingId = params.bookingId;
        if (!bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
          return new Response("Invalid booking id", { status: 400 });
        }

        const { data: booking, error } = await supabaseAdmin
          .from("bookings")
          .select("id, starts_at, ends_at, shop_id, service_id, created_at")
          .eq("id", bookingId)
          .maybeSingle();

        if (error || !booking) {
          return new Response("Booking not found", { status: 404 });
        }

        const [{ data: shop }, { data: service }] = await Promise.all([
          supabaseAdmin
            .from("shops")
            .select("name, address, phone")
            .eq("id", booking.shop_id)
            .maybeSingle(),
          booking.service_id
            ? supabaseAdmin
                .from("services")
                .select("name")
                .eq("id", booking.service_id)
                .maybeSingle()
            : Promise.resolve({ data: null as { name: string } | null }),
        ]);

        const shopName = shop?.name ?? "Afspraak";
        const serviceName = service?.name ?? "Afspraak";
        const summary = `${serviceName} bij ${shopName}`;
        const location = shop?.address ?? shopName;
        const descriptionParts = [
          `Dienst: ${serviceName}`,
          `Locatie: ${shopName}`,
          shop?.address ? `Adres: ${shop.address}` : null,
          shop?.phone ? `Telefoon: ${shop.phone}` : null,
          `Boekingsnummer: ${booking.id}`,
        ].filter(Boolean) as string[];
        const description = descriptionParts.join("\n");

        const dtStart = toIcsUtc(new Date(booking.starts_at));
        const dtEnd = toIcsUtc(new Date(booking.ends_at));
        const dtStamp = toIcsUtc(new Date());
        const uid = `${booking.id}@flowybookings`;

        const lines = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//FlowyBookings//Booking//NL",
          "CALSCALE:GREGORIAN",
          "METHOD:PUBLISH",
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${dtStamp}`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          `SUMMARY:${escapeIcs(summary)}`,
          `DESCRIPTION:${escapeIcs(description)}`,
          `LOCATION:${escapeIcs(location)}`,
          "STATUS:CONFIRMED",
          "TRANSP:OPAQUE",
          // Herinnering 24u van tevoren
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeIcs("Herinnering: " + summary)}`,
          "TRIGGER:-PT24H",
          "END:VALARM",
          "END:VEVENT",
          "END:VCALENDAR",
        ];

        const ics = lines.map(foldLine).join("\r\n") + "\r\n";

        return new Response(ics, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="afspraak-${booking.id.slice(0, 8)}.ics"`,
            "Cache-Control": "private, no-cache",
          },
        });
      },
    },
  },
});
