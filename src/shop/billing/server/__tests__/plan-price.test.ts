import { describe, expect, test, vi, beforeEach } from "vitest";
import { PLAN_PRICE_CENTS } from "@/admin/settings/platform-billing";

const maybeSingle = vi.fn();
const eq = vi.fn();
const select = vi.fn();
const from = vi.fn();
eq.mockReturnValue({ maybeSingle });
select.mockReturnValue({ eq });
from.mockReturnValue({ select });

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => from(...args) },
}));

import { fetchPlanPriceCents } from "@/shop/billing/server/plan-price";

describe("fetchPlanPriceCents", () => {
  beforeEach(() => {
    from.mockClear();
    select.mockClear();
    eq.mockClear();
    maybeSingle.mockReset();
  });

  test("uses the live DB price when the row exists", async () => {
    maybeSingle.mockResolvedValue({ data: { monthly_price_cents: 5900 }, error: null });
    const result = await fetchPlanPriceCents("pro", "monthly");
    expect(result).toBe(5900);
    expect(from).toHaveBeenCalledWith("plan_pricing");
    expect(select).toHaveBeenCalledWith("monthly_price_cents");
    expect(eq).toHaveBeenCalledWith("plan_name", "pro");
  });

  test("a DB price of exactly 0 is honored, not treated as missing (e.g. a promo)", async () => {
    maybeSingle.mockResolvedValue({ data: { monthly_price_cents: 0 }, error: null });
    const result = await fetchPlanPriceCents("premium", "monthly");
    expect(result).toBe(0);
  });

  test("falls back to the hardcoded price when the row is missing", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await fetchPlanPriceCents("starter", "monthly");
    expect(result).toBe(PLAN_PRICE_CENTS.starter);
  });

  test("falls back to the hardcoded price when the query errors", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await fetchPlanPriceCents("premium", "monthly");
    expect(result).toBe(PLAN_PRICE_CENTS.premium);
  });

  test("applies the yearly multiplier on top of the live DB price", async () => {
    maybeSingle.mockResolvedValue({ data: { monthly_price_cents: 5900 }, error: null });
    const result = await fetchPlanPriceCents("pro", "yearly");
    expect(result).toBe(59000);
  });

  test("applies the yearly multiplier on top of the fallback price when the row is missing", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await fetchPlanPriceCents("starter", "yearly");
    expect(result).toBe(PLAN_PRICE_CENTS.starter * 10);
  });
});
