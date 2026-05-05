import { useState } from "react";
import { Loader2 } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Single Google OAuth entrypoint using Lovable managed auth.
 *
 * Stability fixes:
 * - Pin the OAuth flow to ONE canonical host (www.flowybookings.com) so the
 *   `state` cookie set before the broker hop is readable on the same host
 *   when the user returns. Apex ↔ www mismatch was the root cause of the
 *   raw "State verification failed" page on oauth.lovable.app.
 * - Clear any stale Supabase session before starting (prevents duplicate /
 *   loop sessions on retry).
 * - On failure we redirect back to /login?auth_error=1 so the branded error
 *   state is shown instead of a toast with raw provider text.
 */

const CANONICAL_HOST = "www.flowybookings.com";

function buildLoginRedirect(redirect?: string): string {
  if (typeof window === "undefined") return "/login";
  const origin = window.location.origin;
  // Force canonical www host on production so the OAuth state cookie is
  // written + read on the same origin. Preview / lovable.app domains and
  // localhost are left untouched.
  const isProd = /(^|\.)flowybookings\.com$/i.test(window.location.hostname);
  const baseOrigin = isProd ? `https://${CANONICAL_HOST}` : origin;
  const url = new URL(`${baseOrigin}/login`);
  if (redirect) url.searchParams.set("redirect", redirect);
  return url.toString();
}

export function GoogleSignInButton({ redirect }: { redirect?: string }) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      // If we're on the apex (flowybookings.com) bounce to the canonical www
      // host BEFORE starting OAuth — the package uses window.location.origin
      // as the broker target host, so we need to be on www first to keep the
      // state cookie scoped consistently.
      if (
        typeof window !== "undefined" &&
        /^flowybookings\.com$/i.test(window.location.hostname)
      ) {
        const target = new URL(`https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}`);
        window.location.replace(target.toString());
        return;
      }

      // Clear any stale local session so a retry never collides with a
      // half-finished previous attempt.
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }

      const redirectUri = buildLoginRedirect(redirect);

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectUri,
        extraParams: { prompt: "select_account" },
      });

      if (result.redirected) return;
      if (result.error) throw result.error;
      setLoading(false);
    } catch {
      // Never surface raw OAuth/provider error text to the user. Hand off to
      // the branded error state on /login.
      const url = new URL(buildLoginRedirect(redirect));
      url.searchParams.set("auth_error", "1");
      window.location.replace(url.toString());
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.12A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.46.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
          />
        </svg>
      )}
      {t("auth.continueWithGoogle")}
    </Button>
  );
}
