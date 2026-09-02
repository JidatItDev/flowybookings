import { describe, expect, test } from "vitest";
import { safeEqualStrings, verifyWebhookToken } from "@/shared/lib/webhook-auth";

describe("safeEqualStrings", () => {
  test("equal strings", () => {
    expect(safeEqualStrings("abc123", "abc123")).toBe(true);
  });
  test("different strings, same length", () => {
    expect(safeEqualStrings("abc123", "abc124")).toBe(false);
  });
  test("different length", () => {
    expect(safeEqualStrings("abc", "abcd")).toBe(false);
  });
  test("both empty", () => {
    expect(safeEqualStrings("", "")).toBe(true);
  });
});

describe("verifyWebhookToken", () => {
  test("no secret configured — check disabled, always passes", () => {
    expect(verifyWebhookToken(null, undefined)).toBe(true);
    expect(verifyWebhookToken("anything", "")).toBe(true);
  });
  test("secret configured, matching token", () => {
    expect(verifyWebhookToken("s3cr3t", "s3cr3t")).toBe(true);
  });
  test("secret configured, mismatched token", () => {
    expect(verifyWebhookToken("wrong", "s3cr3t")).toBe(false);
  });
  test("secret configured, no token provided", () => {
    expect(verifyWebhookToken(null, "s3cr3t")).toBe(false);
    expect(verifyWebhookToken(undefined, "s3cr3t")).toBe(false);
  });
});
