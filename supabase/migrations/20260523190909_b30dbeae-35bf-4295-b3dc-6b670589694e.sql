
-- Public buckets already serve files by URL; an additional broad SELECT policy
-- on storage.objects enables full bucket listing, which we don't want.
DROP POLICY IF EXISTS "Public can read leo-assets objects" ON storage.objects;
