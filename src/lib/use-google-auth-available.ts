import { useEffect, useState } from "react";

/**
 * Geeft terug of de Google OAuth-knop getoond moet worden.
 * Verbergt de knop wanneer een eerdere poging een config-fout opleverde
 * (zie GoogleSignInButton). Tijdens de eerste render geven we `null` terug
 * zodat we geen flash krijgen voordat localStorage gelezen is.
 */

const UNAVAILABLE_KEY = "fb.googleAuthUnavailable";

export function useGoogleAuthAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setAvailable(false);
      return;
    }
    try {
      setAvailable(window.localStorage.getItem(UNAVAILABLE_KEY) !== "1");
    } catch {
      setAvailable(true);
    }
  }, []);

  return available;
}
