
-- 1) Lock down Realtime subscriptions so only admins can receive row events
--    (table-level RLS doesn't gate Realtime channel subscriptions by itself)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can receive realtime broadcasts" ON realtime.messages;
CREATE POLICY "Admins can receive realtime broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

-- 2) Storage: leo-assets bucket — restrict writes to admins, scope reads to objects only
DROP POLICY IF EXISTS "Public read leo-assets" ON storage.objects;

CREATE POLICY "Public can read leo-assets objects"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'leo-assets');

CREATE POLICY "Admins can upload leo-assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'leo-assets'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Admins can update leo-assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'leo-assets'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'leo-assets'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Admins can delete leo-assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'leo-assets'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Block bucket-level listing of leo-assets (objects remain readable individually)
DROP POLICY IF EXISTS "Block leo-assets bucket listing" ON storage.buckets;
CREATE POLICY "Block leo-assets bucket listing"
ON storage.buckets
FOR SELECT
TO public
USING (id <> 'leo-assets');

-- 3) Revoke EXECUTE on public SECURITY DEFINER helpers from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.abater_estoque_pedido() FROM PUBLIC, anon, authenticated;
