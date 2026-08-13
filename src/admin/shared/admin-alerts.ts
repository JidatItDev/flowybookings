// Helpers voor high-priority admin alerts: korte chime + browser-notificatie.
// Wordt enkel client-side aangeroepen vanuit de admin LiveEventFeed.

const PERMISSION_REQUESTED_KEY = "admin-alerts:notification-permission-requested"

/**
 * Vraag eenmalig om Notification.permission. Slaat in localStorage op dat we
 * het al gevraagd hebben, zodat we de admin niet blijven lastigvallen.
 */
export function ensureNotificationPermission(): void {
  if (typeof window === "undefined") return
  if (!("Notification" in window)) return
  if (Notification.permission !== "default") return
  try {
    if (localStorage.getItem(PERMISSION_REQUESTED_KEY)) return
    localStorage.setItem(PERMISSION_REQUESTED_KEY, "1")
  } catch {
    // localStorage kan geblokkeerd zijn; toch proberen te vragen.
  }
  // Niet awaiten — fire & forget.
  void Notification.requestPermission().catch(() => {})
}

/**
 * Speel een korte, subtiele "ping" via WebAudio. Geen externe assets nodig.
 * Werkt ook bij gesloten/inactieve tab zolang de pagina nog leeft.
 */
export function playChime(): void {
  if (typeof window === "undefined") return
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  try {
    const ctx = new Ctor()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.5)
    osc.onended = () => {
      void ctx.close().catch(() => {})
    }
  } catch {
    // Audio kan geweigerd worden vóór een user gesture; stil falen.
  }
}

/**
 * Toon een native browser-notificatie. Vereist eerder verleende permission.
 */
export function showBrowserNotification(title: string, body: string): void {
  if (typeof window === "undefined") return
  if (!("Notification" in window)) return
  if (Notification.permission !== "granted") return
  try {
    const n = new Notification(title, {
      body,
      tag: "flowy-admin-alert",
      icon: "/favicon.ico",
      silent: true, // we spelen zelf al een chime
    })
    // Klik = focus de tab.
    n.onclick = () => {
      try {
        window.focus()
        n.close()
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}
