import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Standard Supabase Auth Google OAuth sign-in button.
 *
 * Requires Google provider to be enabled in Lovable Cloud → Authentication →
 * Providers → Google. After the user authorises, Supabase redirects back to
 * `${origin}/login`, where the auth-context picks up the session and
 * `LoginPage` performs the role-based redirect.
 *
 * Account linking note: Supabase automatically links a Google identity to an
 * existing email/password user when their email matches and is verified. No
 * extra logic is required on the client.
 */
export function GoogleSignInButton({ redirect }: { redirect?: string }) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      // Send the user back to /login so the LoginPage redirect effect can
      // route them to /shop, /beheer/dashboard, or the original `redirect`.
      const url = new URL(`${window.location.origin}/login`);
      if (redirect) url.searchParams.set("redirect", redirect);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: url.toString(),
          queryParams: { access_type: "offline", prompt: "select_account" },
        },
      });
      if (error) throw error;
      // Browser will redirect to Google — nothing else to do.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Common case: provider not yet enabled in the dashboard.
      if (msg.toLowerCase().includes("provider is not enabled")) {
        toast.error(t("auth.googleNotEnabled"));
      } else {
        toast.error(msg);
      }
      setLoading(false);
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
