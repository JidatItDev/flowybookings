import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SEED_SHOP_ID = "00000000-0000-0000-0000-0000000000a1";
const PASSWORD = "Demo1234!";

const DEMO_USERS = [
  { email: "super_admin@bookly.app", full_name: "Avery Dunn", role: "super_admin" as const },
  { email: "owner@inkwell.app", full_name: "Sophia Reyes", role: "shop_owner" as const },
  { email: "staff@inkwell.app", full_name: "Marco Bianchi", role: "staff" as const },
];

Deno.serve(async (_req) => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const results: Array<{ email: string; userId: string; created: boolean }> = [];

  for (const u of DEMO_USERS) {
    let userId: string | undefined;
    let created = false;

    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing?.users.find((x: any) => x.email === u.email);

    if (found) {
      userId = found.id;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (error) return new Response(JSON.stringify({ error: `Failed to create ${u.email}: ${error.message}` }), { status: 500 });
      userId = data.user?.id;
      created = true;
    }
    if (!userId) return new Response(JSON.stringify({ error: `No user id for ${u.email}` }), { status: 500 });

    await supabaseAdmin.from("profiles").upsert(
      { id: userId, email: u.email, full_name: u.full_name },
      { onConflict: "id" },
    );

    if (u.role === "super_admin") {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userId, role: "super_admin", shop_id: null },
        { onConflict: "user_id,role,shop_id", ignoreDuplicates: true },
      );
    } else if (u.role === "shop_owner") {
      // Ensure the demo shop exists
      const { data: shopExists } = await supabaseAdmin.from("shops").select("id").eq("id", SEED_SHOP_ID).maybeSingle();
      if (!shopExists) {
        await supabaseAdmin.from("shops").insert({
          id: SEED_SHOP_ID,
          name: "Inkwell Tattoo Studio",
          slug: "inkwell-tattoo",
          owner_id: userId,
          status: "active",
        });
      } else {
        await supabaseAdmin.from("shops").update({ owner_id: userId, status: "active" }).eq("id", SEED_SHOP_ID);
      }
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userId, role: "shop_owner", shop_id: SEED_SHOP_ID },
        { onConflict: "user_id,role,shop_id", ignoreDuplicates: true },
      );
    } else if (u.role === "staff") {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userId, role: "staff", shop_id: SEED_SHOP_ID },
        { onConflict: "user_id,role,shop_id", ignoreDuplicates: true },
      );
    }

    results.push({ email: u.email, userId, created });
  }

  return new Response(JSON.stringify({ ok: true, results, password: PASSWORD }), {
    headers: { "Content-Type": "application/json" },
  });
});
