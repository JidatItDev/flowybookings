import { useState } from "react";
import { Copy, Check, QrCode, Share2, MessageCircle, Instagram, Download, FileText } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { getBookingUrl, getBookingUrlDisplay } from "@/lib/booking-url";
import { downloadBookingPoster } from "@/lib/booking-poster";

type Props = {
  /** Shop slug — wordt gebruikt om de boekings-URL op te bouwen. */
  slug: string | null | undefined;
  /** Optionele shop-naam voor het deelbericht. */
  shopName?: string | null;
  /** Optionele logo-URL van de shop (voor de printbare poster). */
  logoUrl?: string | null;
  /** Compacte variant zonder kop/intro — voor in /shop/settings. */
  compact?: boolean;
};

/**
 * Toont de publieke boekingslink van een shop met kopieer-, deel- en QR-acties.
 * Wordt gebruikt op het shop-dashboard én in /shop/settings.
 */
export function BookingLinkCard({ slug, shopName, logoUrl, compact = false }: Props) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [posterLoading, setPosterLoading] = useState(false);

  const canonicalUrl = getBookingUrl(slug, true); // altijd de productie-URL voor delen
  const displayUrl = getBookingUrlDisplay(slug);

  const copy = async () => {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setCopied(true);
      toast.success(t("bookingLink.copied"));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("bookingLink.copyFailed"));
    }
  };

  const shareWhatsApp = () => {
    if (!slug) return;
    const msg = shopName
      ? t("bookingLink.shareMsg", { shop: shopName, url: canonicalUrl })
      : canonicalUrl;
    const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  };

  const shareInstagram = async () => {
    if (!slug) return;
    // Instagram heeft geen open URL-share API; we kopiëren de link
    // en sturen de gebruiker naar Instagram.
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      toast.success(t("bookingLink.igCopied"));
    } catch {
      /* negeren */
    }
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  };

  const shareNative = async () => {
    if (!slug) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shopName ? t("bookingLink.shareTitle", { shop: shopName }) : "Boek een afspraak",
          text: shopName ? t("bookingLink.shareMsg", { shop: shopName, url: canonicalUrl }) : undefined,
          url: canonicalUrl,
        });
      } catch {
        /* gebruiker annuleerde — niets doen */
      }
    } else {
      void copy();
    }
  };

  const downloadQR = () => {
    const canvas = document.getElementById("booking-qr") as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `boekingslink-${slug ?? "shop"}.png`;
    link.href = url;
    link.click();
  };

  const downloadPoster = async () => {
    if (!slug) return;
    const canvas = document.getElementById("booking-qr") as HTMLCanvasElement | null;
    if (!canvas) {
      toast.error(t("bookingLink.posterError"));
      return;
    }
    setPosterLoading(true);
    try {
      const qrDataUrl = canvas.toDataURL("image/png");
      await downloadBookingPoster({
        shopName: shopName ?? "",
        bookingUrl: canonicalUrl,
        displayUrl,
        qrDataUrl,
        logoUrl: logoUrl ?? null,
        labels: {
          headline: t("bookingLink.posterHeadline"),
          scanHint: t("bookingLink.posterScanHint"),
          orVisit: t("bookingLink.posterOrVisit"),
          poweredBy: t("bookingLink.posterPoweredBy"),
        },
      });
      toast.success(t("bookingLink.posterReady"));
    } catch {
      toast.error(t("bookingLink.posterError"));
    } finally {
      setPosterLoading(false);
    }
  };

  if (!slug) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-4 text-center text-sm text-muted-foreground">
        {t("bookingLink.noSlug")}
      </div>
    );
  }

  return (
    <div className={compact ? "" : "rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6"}>
      {!compact && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold sm:text-base">{t("bookingLink.title")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("bookingLink.subtitle")}</p>
          </div>
          <span className="flex-none rounded-full bg-mint px-2.5 py-1 text-[11px] font-medium text-mint-foreground">
            {t("bookingLink.live")}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground sm:text-sm" aria-label={t("bookingLink.label")}>
            🔗
          </span>
          <Input
            readOnly
            value={displayUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="h-8 border-0 bg-transparent p-0 font-mono text-xs shadow-none focus-visible:ring-0 sm:text-sm"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copy} className="flex-none">
          {copied ? <Check className="h-4 w-4 text-success-foreground" /> : <Copy className="h-4 w-4" />}
          {copied ? t("bookingLink.copiedShort") : t("bookingLink.copy")}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={shareWhatsApp}>
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={shareInstagram}>
          <Instagram className="h-4 w-4" /> Instagram
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={shareNative}>
          <Share2 className="h-4 w-4" /> {t("bookingLink.shareMore")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setQrOpen(true)}>
          <QrCode className="h-4 w-4" /> {t("bookingLink.qr")}
        </Button>
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("bookingLink.qrTitle")}</DialogTitle>
            <DialogDescription>{t("bookingLink.qrDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="rounded-2xl border border-border bg-white p-4">
              <QRCodeCanvas
                id="booking-qr"
                value={canonicalUrl}
                size={220}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-center text-xs font-mono text-muted-foreground break-all">{displayUrl}</p>
            <p className="text-center text-xs font-mono text-muted-foreground break-all">{displayUrl}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadQR}>
                <Download className="h-4 w-4" /> {t("bookingLink.qrDownload")}
              </Button>
              <Button type="button" variant="default" size="sm" onClick={downloadPoster} disabled={posterLoading}>
                <FileText className="h-4 w-4" />
                {posterLoading ? t("bookingLink.posterLoading") : t("bookingLink.posterDownload")}
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">{t("bookingLink.posterHint")}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
