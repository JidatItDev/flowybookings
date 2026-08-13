import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";

export type LocaleValue = "nl" | "en";
const COOKIE_NAME = "flowybookings_lang";
const ONE_YEAR = 60 * 60 * 24 * 365;

function normalize(v: string | undefined | null): LocaleValue | null {
  return v === "nl" || v === "en" ? v : null;
}

export const getLocaleCookie = createServerFn({ method: "GET" }).handler(
  async (): Promise<LocaleValue | null> => {
    return normalize(getCookie(COOKIE_NAME));
  },
);

export const setLocaleCookie = createServerFn({ method: "POST" })
  .inputValidator((data: { locale: LocaleValue }) => {
    const loc = normalize(data?.locale);
    if (!loc) throw new Error("Invalid locale");
    return { locale: loc };
  })
  .handler(async ({ data }) => {
    setCookie(COOKIE_NAME, data.locale, {
      path: "/",
      maxAge: ONE_YEAR,
      sameSite: "lax",
      secure: true,
      httpOnly: false, // readable by client too — purely a UI preference
    });
    return { ok: true };
  });
