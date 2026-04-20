// Genereert een printbare A5 poster-PDF met QR-code, shopnaam, logo en
// boekingslink. Wordt vanuit de BookingLinkCard aangeroepen.
//
// A5 staand = 148 × 210 mm. We gebruiken jsPDF in mm-eenheden zodat alle
// posities makkelijk te tunen zijn. De QR-code halen we als data-URL op uit
// een verborgen <canvas> die qrcode.react al heeft gerenderd.

import { jsPDF } from "jspdf";

type PosterOptions = {
  shopName: string;
  bookingUrl: string;
  /** Display-vorm zonder protocol, bv. "flowybookings.com/book/inkwell". */
  displayUrl: string;
  /** PNG/JPG data-URL van de QR-code (uit qrcode.react canvas). */
  qrDataUrl: string;
  /** Optioneel logo van de shop (URL of data-URL). */
  logoUrl?: string | null;
  /** Vertaalde teksten — zo blijft de poster meertalig. */
  labels: {
    headline: string;       // bv. "Boek je afspraak online"
    scanHint: string;       // bv. "Scan de QR-code met je telefoon"
    orVisit: string;        // bv. "of ga naar"
    poweredBy: string;      // bv. "Powered by FlowyBookings"
  };
};

const A5 = { width: 148, height: 210 };

/** Laadt een afbeelding als data-URL zodat jsPDF hem kan inbedden. */
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Genereert en triggert de download van de A5 boekingsposter. */
export async function downloadBookingPoster(opts: PosterOptions): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });

  // Achtergrond: zachte off-white met een dunne accentrand.
  doc.setFillColor(252, 250, 247); // warm off-white
  doc.rect(0, 0, A5.width, A5.height, "F");

  // Bovenrand accent
  doc.setFillColor(124, 92, 250); // brand purple (#7C5CFA)
  doc.rect(0, 0, A5.width, 4, "F");

  // ── Logo (optioneel) ──
  let cursorY = 18;
  if (opts.logoUrl) {
    const logoData = await loadImageAsDataUrl(opts.logoUrl);
    if (logoData) {
      try {
        // Logo gecentreerd, max 22mm hoog
        const logoSize = 22;
        doc.addImage(logoData, "PNG", (A5.width - logoSize) / 2, cursorY, logoSize, logoSize, undefined, "FAST");
        cursorY += logoSize + 6;
      } catch {
        /* corrupte image — negeren */
      }
    }
  }

  // ── Shopnaam ──
  doc.setTextColor(20, 20, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const shopName = opts.shopName || "Boek online";
  doc.text(shopName, A5.width / 2, cursorY, { align: "center", maxWidth: A5.width - 20 });
  cursorY += 10;

  // ── Headline ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(80, 80, 95);
  doc.text(opts.labels.headline, A5.width / 2, cursorY, { align: "center", maxWidth: A5.width - 24 });
  cursorY += 10;

  // ── QR-code (centraal, op witte kaart met zachte schaduw-look) ──
  const qrSize = 78; // mm
  const qrX = (A5.width - qrSize) / 2;
  const qrY = cursorY + 4;
  const padding = 6;
  // witte kaart achter QR
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2, 4, 4, "F");
  // zachte border
  doc.setDrawColor(230, 228, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2, 4, 4, "S");
  // QR zelf
  doc.addImage(opts.qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");
  cursorY = qrY + qrSize + padding + 10;

  // ── Scan-hint ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 28);
  doc.text(opts.labels.scanHint, A5.width / 2, cursorY, { align: "center", maxWidth: A5.width - 24 });
  cursorY += 7;

  // ── "of ga naar" + URL ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 125);
  doc.text(opts.labels.orVisit, A5.width / 2, cursorY, { align: "center" });
  cursorY += 5.5;

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(124, 92, 250);
  doc.textWithLink(opts.displayUrl, A5.width / 2, cursorY, {
    align: "center",
    url: opts.bookingUrl,
  });

  // ── Footer ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 160);
  doc.text(opts.labels.poweredBy, A5.width / 2, A5.height - 8, { align: "center" });

  // Bestandsnaam op basis van shopnaam
  const safeName = (opts.shopName || "shop")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "shop";
  doc.save(`boekingsposter-${safeName}.pdf`);
}
