// Helpers for tracking which version of each legal policy a user accepted.
import { supabase } from "@/integrations/supabase/client";
import { LEGAL_LAST_UPDATED, type LegalDocKey } from "@/lib/legal-meta";

export type LegalConsent = Partial<Record<LegalDocKey, string>>;

/** Build a consent snapshot pinned to the currently-published policy versions. */
export function currentConsentSnapshot(): LegalConsent {
  return { ...LEGAL_LAST_UPDATED };
}

/** Returns the list of policies that have a newer published version than what the user accepted. */
export function outdatedPolicies(accepted: LegalConsent | null | undefined): LegalDocKey[] {
  const acc = accepted ?? {};
  return (Object.keys(LEGAL_LAST_UPDATED) as LegalDocKey[]).filter((key) => {
    const current = LEGAL_LAST_UPDATED[key];
    const userAccepted = acc[key];
    if (!userAccepted) return true;
    return userAccepted < current;
  });
}

/** Persist the current legal versions onto the user's profile. */
export async function recordConsent(userId: string): Promise<void> {
  const snapshot = currentConsentSnapshot();
  const { error } = await supabase
    .from("profiles")
    .update({ legal_consent: snapshot })
    .eq("id", userId);
  if (error) throw error;
}

/** Fetch the current consent JSON for a user (returns {} if none). */
export async function fetchConsent(userId: string): Promise<LegalConsent> {
  const { data, error } = await supabase
    .from("profiles")
    .select("legal_consent")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return ((data?.legal_consent as LegalConsent) ?? {}) as LegalConsent;
}
