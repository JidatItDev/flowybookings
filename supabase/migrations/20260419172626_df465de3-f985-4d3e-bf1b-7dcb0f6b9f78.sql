-- Second demo shop: Barbershop
-- Use existing super_admin as owner so RLS owner_id is real
DO $$
DECLARE
  v_owner uuid;
  v_shop  uuid := '00000000-0000-0000-0000-0000000000b2';
  v_marco uuid;
  v_diego uuid;
  v_svc_cut uuid;
  v_svc_beard uuid;
  v_svc_combo uuid;
  v_svc_kids uuid;
  v_cust1 uuid;
  v_cust2 uuid;
  v_cust3 uuid;
  v_cust4 uuid;
  v_cust5 uuid;
  v_cust6 uuid;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- Pick any super admin (or fall back to existing demo shop owner)
  SELECT user_id INTO v_owner
    FROM public.user_roles WHERE role = 'super_admin' LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT owner_id INTO v_owner FROM public.shops
      WHERE id = '00000000-0000-0000-0000-0000000000a1';
  END IF;
  IF v_owner IS NULL THEN
    RAISE NOTICE 'No owner found, skipping barbershop seed';
    RETURN;
  END IF;

  -- Insert shop (idempotent)
  INSERT INTO public.shops (id, name, slug, owner_id, status, is_demo, address, phone, email, plan)
  VALUES (v_shop, 'Sharp & Co. Barbershop', 'sharp-co-barbershop', v_owner, 'active', true,
          'Prinsengracht 244, Amsterdam', '+31 20 555 0199', 'hello@sharp-co.demo', 'pro')
  ON CONFLICT (id) DO UPDATE SET status = 'active', is_demo = true, owner_id = EXCLUDED.owner_id;

  -- Services
  INSERT INTO public.services (shop_id, name, description, category, duration_minutes, price_cents, currency, is_active)
  VALUES
    (v_shop, 'Classic Haircut', 'Wash, cut & style — finished with a hot towel.', 'Hair', 30, 2800, 'EUR', true),
    (v_shop, 'Beard Trim',      'Precision trim, line-up and beard oil.',         'Beard', 20, 1800, 'EUR', true),
    (v_shop, 'Cut + Beard Combo','Full grooming experience — cut & beard.',        'Combo', 45, 4200, 'EUR', true),
    (v_shop, 'Kids Cut',        'Quick and friendly cut for under 12s.',          'Hair', 25, 2200, 'EUR', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_svc_cut   FROM public.services WHERE shop_id = v_shop AND name = 'Classic Haircut' LIMIT 1;
  SELECT id INTO v_svc_beard FROM public.services WHERE shop_id = v_shop AND name = 'Beard Trim' LIMIT 1;
  SELECT id INTO v_svc_combo FROM public.services WHERE shop_id = v_shop AND name = 'Cut + Beard Combo' LIMIT 1;
  SELECT id INTO v_svc_kids  FROM public.services WHERE shop_id = v_shop AND name = 'Kids Cut' LIMIT 1;

  -- Staff
  INSERT INTO public.staff (shop_id, full_name, email, is_active)
  VALUES
    (v_shop, 'Marco van Dijk', 'marco@sharp-co.demo', true),
    (v_shop, 'Diego Romero',   'diego@sharp-co.demo', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_marco FROM public.staff WHERE shop_id = v_shop AND full_name = 'Marco van Dijk' LIMIT 1;
  SELECT id INTO v_diego FROM public.staff WHERE shop_id = v_shop AND full_name = 'Diego Romero' LIMIT 1;

  -- Customers
  INSERT INTO public.customers (shop_id, full_name, email, phone)
  VALUES
    (v_shop, 'Lucas Jansen',  'lucas@example.com',  '+31 6 1100 0001'),
    (v_shop, 'Noah de Vries', 'noah@example.com',   '+31 6 1100 0002'),
    (v_shop, 'Liam Smit',     'liam@example.com',   '+31 6 1100 0003'),
    (v_shop, 'Sem Bakker',    'sem@example.com',    '+31 6 1100 0004'),
    (v_shop, 'Daan Visser',   'daan@example.com',   '+31 6 1100 0005'),
    (v_shop, 'Finn Mulder',   'finn@example.com',   '+31 6 1100 0006')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_cust1 FROM public.customers WHERE shop_id = v_shop AND email = 'lucas@example.com' LIMIT 1;
  SELECT id INTO v_cust2 FROM public.customers WHERE shop_id = v_shop AND email = 'noah@example.com'  LIMIT 1;
  SELECT id INTO v_cust3 FROM public.customers WHERE shop_id = v_shop AND email = 'liam@example.com'  LIMIT 1;
  SELECT id INTO v_cust4 FROM public.customers WHERE shop_id = v_shop AND email = 'sem@example.com'   LIMIT 1;
  SELECT id INTO v_cust5 FROM public.customers WHERE shop_id = v_shop AND email = 'daan@example.com'  LIMIT 1;
  SELECT id INTO v_cust6 FROM public.customers WHERE shop_id = v_shop AND email = 'finn@example.com'  LIMIT 1;

  -- Wipe existing demo bookings for this shop only, then re-seed (keeps it idempotent and "fresh")
  DELETE FROM public.bookings WHERE shop_id = v_shop;

  -- Today
  INSERT INTO public.bookings (shop_id, service_id, staff_id, customer_id, starts_at, ends_at, status, price_cents, currency)
  VALUES
    (v_shop, v_svc_cut,   v_marco, v_cust1, (v_today::timestamp + interval '10 hours'),
       (v_today::timestamp + interval '10 hours 30 minutes'), 'confirmed', 2800, 'EUR'),
    (v_shop, v_svc_combo, v_diego, v_cust2, (v_today::timestamp + interval '11 hours'),
       (v_today::timestamp + interval '11 hours 45 minutes'), 'confirmed', 4200, 'EUR'),
    (v_shop, v_svc_beard, v_marco, v_cust3, (v_today::timestamp + interval '14 hours'),
       (v_today::timestamp + interval '14 hours 20 minutes'), 'pending',   1800, 'EUR'),
    -- Tomorrow
    (v_shop, v_svc_cut,   v_diego, v_cust4, ((v_today + 1)::timestamp + interval '9 hours 30 minutes'),
       ((v_today + 1)::timestamp + interval '10 hours'),       'confirmed', 2800, 'EUR'),
    (v_shop, v_svc_combo, v_marco, v_cust5, ((v_today + 1)::timestamp + interval '15 hours'),
       ((v_today + 1)::timestamp + interval '15 hours 45 minutes'), 'confirmed', 4200, 'EUR'),
    -- Day after
    (v_shop, v_svc_kids,  v_diego, v_cust6, ((v_today + 2)::timestamp + interval '13 hours'),
       ((v_today + 2)::timestamp + interval '13 hours 25 minutes'), 'confirmed', 2200, 'EUR');

  -- Mark Inkwell as demo (in case it isn't already) so picker shows both
  UPDATE public.shops SET is_demo = true
   WHERE id = '00000000-0000-0000-0000-0000000000a1' AND is_demo = false;
END $$;