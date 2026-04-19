import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PASSWORD = "Demo1234!";

// Stable IDs so re-runs are idempotent
const SHOP_INKWELL = "00000000-0000-0000-0000-0000000000a1";
const SHOP_SHARP = "00000000-0000-0000-0000-0000000000a2";

const DEMO_USERS = [
  { email: "super_admin@flowybookings.com", full_name: "Avery Dunn", role: "super_admin" as const, shop_id: null as string | null },
  { email: "owner@inkwell.app", full_name: "Sophia Reyes", role: "shop_owner" as const, shop_id: SHOP_INKWELL },
  { email: "staff@inkwell.app", full_name: "Marcus Chen", role: "staff" as const, shop_id: SHOP_INKWELL },
];

type ShopSeed = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  plan: "trial" | "starter" | "pro" | "premium";
  business_hours: Record<string, { open: string; close: string; closed: boolean }>;
  services: { id: string; name: string; duration: number; price_cents: number; description?: string }[];
  staff: { id: string; full_name: string; email?: string; is_owner?: boolean }[];
  customers: { id: string; full_name: string; email: string; phone: string }[];
};

const SHOPS: ShopSeed[] = [
  {
    id: SHOP_INKWELL,
    name: "Inkwell Demo Studio",
    slug: "inkwell-demo",
    email: "demo@flowybookings.com",
    phone: "020-1234567",
    address: "Keizersgracht 42, Amsterdam",
    plan: "pro",
    business_hours: {
      mon: { open: "10:00", close: "19:00", closed: true },
      tue: { open: "10:00", close: "19:00", closed: false },
      wed: { open: "10:00", close: "19:00", closed: false },
      thu: { open: "10:00", close: "19:00", closed: false },
      fri: { open: "10:00", close: "19:00", closed: false },
      sat: { open: "10:00", close: "17:00", closed: false },
      sun: { open: "10:00", close: "17:00", closed: true },
    },
    services: [
      { id: "00000000-0000-0000-0001-000000000001", name: "Kleine tattoo (max 5cm)", duration: 60, price_cents: 7500 },
      { id: "00000000-0000-0000-0001-000000000002", name: "Medium tattoo (5-15cm)", duration: 120, price_cents: 15000 },
      { id: "00000000-0000-0000-0001-000000000003", name: "Sleeve sessie", duration: 180, price_cents: 25000 },
      { id: "00000000-0000-0000-0001-000000000004", name: "Cover-up consult", duration: 30, price_cents: 0, description: "Gratis intake" },
      { id: "00000000-0000-0000-0001-000000000005", name: "Touch-up", duration: 45, price_cents: 4000 },
    ],
    staff: [
      { id: "00000000-0000-0000-0002-000000000001", full_name: "Sophia Reyes", email: "owner@inkwell.app", is_owner: true },
      { id: "00000000-0000-0000-0002-000000000002", full_name: "Marcus Chen", email: "staff@inkwell.app" },
      { id: "00000000-0000-0000-0002-000000000003", full_name: "Luna de Vries" },
    ],
    customers: [
      { id: "00000000-0000-0000-0003-000000000001", full_name: "Jan de Vries", email: "jan@email.nl", phone: "06-11111111" },
      { id: "00000000-0000-0000-0003-000000000002", full_name: "Emma Bakker", email: "emma@email.nl", phone: "06-22222222" },
      { id: "00000000-0000-0000-0003-000000000003", full_name: "Daan Jansen", email: "daan@email.nl", phone: "06-33333333" },
      { id: "00000000-0000-0000-0003-000000000004", full_name: "Lisa Visser", email: "lisa@email.nl", phone: "06-44444444" },
      { id: "00000000-0000-0000-0003-000000000005", full_name: "Luuk Peters", email: "luuk@email.nl", phone: "06-55555555" },
      { id: "00000000-0000-0000-0003-000000000006", full_name: "Sophie Mulder", email: "sophie@email.nl", phone: "06-66666666" },
      { id: "00000000-0000-0000-0003-000000000007", full_name: "Finn de Groot", email: "finn@email.nl", phone: "06-77777777" },
      { id: "00000000-0000-0000-0003-000000000008", full_name: "Noa Smit", email: "noa@email.nl", phone: "06-88888888" },
    ],
  },
  {
    id: SHOP_SHARP,
    name: "Sharp & Co. Barbershop",
    slug: "sharp-co-demo",
    email: "demo+sharp@flowybookings.com",
    phone: "030-7654321",
    address: "Lange Viestraat 8, Utrecht",
    plan: "starter",
    business_hours: {
      mon: { open: "09:00", close: "18:00", closed: false },
      tue: { open: "09:00", close: "18:00", closed: false },
      wed: { open: "09:00", close: "18:00", closed: false },
      thu: { open: "09:00", close: "18:00", closed: false },
      fri: { open: "09:00", close: "18:00", closed: false },
      sat: { open: "09:00", close: "16:00", closed: false },
      sun: { open: "09:00", close: "16:00", closed: true },
    },
    services: [
      { id: "00000000-0000-0000-0011-000000000001", name: "Heren knipbeurt", duration: 30, price_cents: 2800 },
      { id: "00000000-0000-0000-0011-000000000002", name: "Baard trimmen", duration: 20, price_cents: 1800 },
      { id: "00000000-0000-0000-0011-000000000003", name: "Knipbeurt + baard", duration: 45, price_cents: 4000 },
      { id: "00000000-0000-0000-0011-000000000004", name: "Hot towel shave", duration: 30, price_cents: 2500 },
      { id: "00000000-0000-0000-0011-000000000005", name: "Kids knipbeurt (t/m 12)", duration: 20, price_cents: 1800 },
    ],
    staff: [
      { id: "00000000-0000-0000-0012-000000000001", full_name: "James van Dijk", is_owner: true },
      { id: "00000000-0000-0000-0012-000000000002", full_name: "Youssef Amrani" },
    ],
    customers: [
      { id: "00000000-0000-0000-0013-000000000001", full_name: "Bram Hendriks", email: "bram@email.nl", phone: "06-99999911" },
      { id: "00000000-0000-0000-0013-000000000002", full_name: "Tim Bos", email: "tim@email.nl", phone: "06-99999922" },
      { id: "00000000-0000-0000-0013-000000000003", full_name: "Sven Kuipers", email: "sven@email.nl", phone: "06-99999933" },
      { id: "00000000-0000-0000-0013-000000000004", full_name: "Mees van Loon", email: "mees@email.nl", phone: "06-99999944" },
      { id: "00000000-0000-0000-0013-000000000005", full_name: "Pim Dekker", email: "pim@email.nl", phone: "06-99999955" },
    ],
  },
];

// Booking plan: offsets in days from "today", time, status, customer index, service index, staff index
type BookingPlan = { dayOffset: number; hour: number; minute: number; status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show"; cust: number; svc: number; staff: number };

const BOOKINGS_INKWELL: BookingPlan[] = [
  { dayOffset: -7, hour: 11, minute: 0, status: "completed", cust: 0, svc: 0, staff: 0 },
  { dayOffset: -5, hour: 14, minute: 0, status: "completed", cust: 1, svc: 1, staff: 1 },
  { dayOffset: -3, hour: 10, minute: 0, status: "completed", cust: 2, svc: 4, staff: 2 },
  { dayOffset: -1, hour: 16, minute: 0, status: "completed", cust: 3, svc: 0, staff: 0 },
  { dayOffset: 1, hour: 11, minute: 0, status: "confirmed", cust: 4, svc: 2, staff: 0 },
  { dayOffset: 2, hour: 14, minute: 30, status: "confirmed", cust: 5, svc: 1, staff: 1 },
  { dayOffset: 3, hour: 10, minute: 0, status: "pending", cust: 6, svc: 3, staff: 0 },
  { dayOffset: 4, hour: 15, minute: 0, status: "confirmed", cust: 7, svc: 0, staff: 2 },
  { dayOffset: 7, hour: 11, minute: 0, status: "pending", cust: 0, svc: 1, staff: 1 },
  { dayOffset: 8, hour: 13, minute: 0, status: "confirmed", cust: 1, svc: 4, staff: 2 },
];

const BOOKINGS_SHARP: BookingPlan[] = [
  { dayOffset: -4, hour: 10, minute: 0, status: "completed", cust: 0, svc: 0, staff: 0 },
  { dayOffset: -2, hour: 14, minute: 0, status: "completed", cust: 1, svc: 2, staff: 1 },
  { dayOffset: 1, hour: 9, minute: 30, status: "confirmed", cust: 2, svc: 0, staff: 0 },
  { dayOffset: 2, hour: 11, minute: 0, status: "confirmed", cust: 3, svc: 3, staff: 1 },
  { dayOffset: 3, hour: 15, minute: 0, status: "pending", cust: 4, svc: 4, staff: 0 },
  { dayOffset: 5, hour: 10, minute: 0, status: "confirmed", cust: 0, svc: 1, staff: 1 },
];

function nextDate(offsetDays: number, hour: number, minute: number) {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

async function seedShop(supabaseAdmin: any, shop: ShopSeed, ownerId: string, bookings: BookingPlan[]) {
  // Upsert shop
  await supabaseAdmin.from("shops").upsert({
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    email: shop.email,
    phone: shop.phone,
    address: shop.address,
    owner_id: ownerId,
    status: "active",
    plan: shop.plan,
    is_demo: true,
    timezone: "Europe/Amsterdam",
    business_hours: shop.business_hours,
  }, { onConflict: "id" });

  // Services
  for (const s of shop.services) {
    await supabaseAdmin.from("services").upsert({
      id: s.id,
      shop_id: shop.id,
      name: s.name,
      duration_minutes: s.duration,
      price_cents: s.price_cents,
      description: s.description ?? null,
      is_active: true,
      currency: "EUR",
    }, { onConflict: "id" });
  }

  // Staff
  for (const st of shop.staff) {
    await supabaseAdmin.from("staff").upsert({
      id: st.id,
      shop_id: shop.id,
      full_name: st.full_name,
      email: st.email ?? null,
      is_active: true,
    }, { onConflict: "id" });
  }

  // Link all staff to all services
  for (const st of shop.staff) {
    for (const s of shop.services) {
      await supabaseAdmin.from("staff_services").upsert(
        { staff_id: st.id, service_id: s.id },
        { onConflict: "staff_id,service_id", ignoreDuplicates: true },
      );
    }
  }

  // Customers
  for (const c of shop.customers) {
    await supabaseAdmin.from("customers").upsert({
      id: c.id,
      shop_id: shop.id,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
    }, { onConflict: "id" });
  }

  // Wipe existing demo bookings for clean re-seed
  await supabaseAdmin.from("bookings").delete().eq("shop_id", shop.id);

  // Bookings
  for (const b of bookings) {
    const svc = shop.services[b.svc];
    const staff = shop.staff[b.staff];
    const cust = shop.customers[b.cust];
    const start = nextDate(b.dayOffset, b.hour, b.minute);
    const end = new Date(start.getTime() + svc.duration * 60_000);
    await supabaseAdmin.from("bookings").insert({
      shop_id: shop.id,
      customer_id: cust.id,
      service_id: svc.id,
      staff_id: staff.id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: b.status,
      price_cents: svc.price_cents,
      currency: "EUR",
    });
  }
}

Deno.serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const results: Array<{ email: string; userId: string; created: boolean }> = [];
    const userByEmail: Record<string, string> = {};

    // Step 1: create/find auth users + profiles + roles
    for (const u of DEMO_USERS) {
      let userId: string | undefined;
      let created = false;

      const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = existing?.users.find((x: any) => x.email === u.email);

      if (found) {
        userId = found.id;
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: PASSWORD,
          email_confirm: true,
        });
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
      userByEmail[u.email] = userId;

      await supabaseAdmin.from("profiles").upsert(
        { id: userId, email: u.email, full_name: u.full_name },
        { onConflict: "id" },
      );

      results.push({ email: u.email, userId, created });
    }

    // Step 2: seed shops with the Inkwell owner as owner of both demo shops
    const inkwellOwnerId = userByEmail["owner@inkwell.app"];
    await seedShop(supabaseAdmin, SHOPS[0], inkwellOwnerId, BOOKINGS_INKWELL);
    await seedShop(supabaseAdmin, SHOPS[1], inkwellOwnerId, BOOKINGS_SHARP);

    // Step 3: roles
    const superAdminId = userByEmail["super_admin@flowybookings.com"];
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: superAdminId, role: "super_admin", shop_id: null },
      { onConflict: "user_id,role,shop_id", ignoreDuplicates: true },
    );

    await supabaseAdmin.from("user_roles").upsert(
      { user_id: inkwellOwnerId, role: "shop_owner", shop_id: SHOP_INKWELL },
      { onConflict: "user_id,role,shop_id", ignoreDuplicates: true },
    );
    // Also give the owner access to Sharp shop so they can switch between demo shops
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: inkwellOwnerId, role: "shop_owner", shop_id: SHOP_SHARP },
      { onConflict: "user_id,role,shop_id", ignoreDuplicates: true },
    );

    const staffId = userByEmail["staff@inkwell.app"];
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: staffId, role: "staff", shop_id: SHOP_INKWELL },
      { onConflict: "user_id,role,shop_id", ignoreDuplicates: true },
    );
    // Link staff auth user to the Marcus Chen staff row in Inkwell
    await supabaseAdmin.from("staff").update({ user_id: staffId })
      .eq("id", "00000000-0000-0000-0002-000000000002");
    // Link owner auth user to the Sophia Reyes staff row
    await supabaseAdmin.from("staff").update({ user_id: inkwellOwnerId })
      .eq("id", "00000000-0000-0000-0002-000000000001");

    return new Response(JSON.stringify({ ok: true, results, password: PASSWORD, shops: [SHOP_INKWELL, SHOP_SHARP] }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
