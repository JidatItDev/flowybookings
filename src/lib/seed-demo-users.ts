// Server function to seed three demo users with fixed credentials.
// Idempotent — safe to call multiple times. Triggered from /login page button.

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SEED_SHOP_ID = "00000000-0000-0000-0000-0000000000a1";
const PASSWORD = "Demo1234!";

type SeedUser = {
  email: string;
  full_name: string;
  role: "super_admin" | "shop_owner" | "staff";
};

const DEMO_USERS: SeedUser[] = [
  { email: "super_admin@bookly.app", full_name: "Avery Dunn", role: "super_admin" },
  { email: "owner@inkwell.app", full_name: "Sophia Reyes", role: "shop_owner" },
  { email: "staff@inkwell.app", full_name: "Marco Bianchi", role: "staff" },
];

export const seedDemoUsers = createServerFn({ method: "POST" }).handler(async () => {
  const results: Array<{ email: string; userId: string; created: boolean }> = [];

  for (const u of DEMO_USERS) {
    // Find or create the auth user
    let userId: string | undefined;
    let created = false;

    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const found = existing?.users.find((x) => x.email === u.email);

    if (found) {
      userId = found.id;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (error) throw new Error(`Failed to create ${u.email}: ${error.message}`);
      userId = data.user?.id;
      created = true;
    }
    if (!userId) throw new Error(`No user id for ${u.email}`);

    // Ensure profile row exists (the trigger handles new users; for existing, upsert)
    await supabaseAdmin.from("profiles").upsert(
      { id: userId, email: u.email, full_name: u.full_name },
      { onConflict: "id" },
    );

    // Assign role
    if (u.role === "super_admin") {
      await supabaseAdmin.rpc("assign_super_admin", { _user_id: userId });
    } else if (u.role === "shop_owner") {
      await supabaseAdmin.rpc("assign_shop_owner", {
        _user_id: userId,
        _shop_id: SEED_SHOP_ID,
      });
    } else if (u.role === "staff") {
      await supabaseAdmin.rpc("assign_shop_staff", {
        _user_id: userId,
        _shop_id: SEED_SHOP_ID,
      });
    }

    results.push({ email: u.email, userId, created });
  }

  return { ok: true, results, password: PASSWORD };
});
