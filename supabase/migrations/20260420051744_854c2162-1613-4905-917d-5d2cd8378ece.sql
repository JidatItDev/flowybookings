-- Create storage bucket for shop logos (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-logos',
  'shop-logos',
  true,
  2097152, -- 2MB
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Public can view logos
CREATE POLICY "shop_logos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'shop-logos');

-- Shop owners can upload to a folder named after their shop_id
CREATE POLICY "shop_logos_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shop-logos'
  AND public.is_shop_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "shop_logos_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shop-logos'
  AND public.is_shop_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "shop_logos_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shop-logos'
  AND public.is_shop_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
);