# Supabase Storage Upload Setup

File uploads go to **Supabase Storage** in bucket `MyBucket` under the `upload/` folder. Use this so uploads work smoothly.

## 1. Create the bucket (if needed)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Storage**.
3. If `MyBucket` does not exist, click **New bucket**:
   - **Name**: `MyBucket` (exact name used by the app).
   - **Public bucket**: turn **ON** if you want public read URLs.
   - Click **Create bucket**.

## 2. Storage policies (required for upload to work)

The app uploads using the **anon** key. The bucket must allow inserts.

1. In **Storage** → **Policies** (or open `MyBucket` → **Policies**).
2. Add a policy that allows uploads (INSERT) into `MyBucket`:

**Option A – Allow anyone to upload (anon)**

- **Policy name**: e.g. `Allow public uploads`
- **Allowed operation**: **INSERT**
- **Target**: bucket `MyBucket`
- **Policy definition**:  
  `true`  
  (no role check; allows anon and authenticated)

In SQL (Supabase SQL Editor), you can use:

```sql
-- Allow anyone to upload to MyBucket (anon + authenticated)
CREATE POLICY "Allow uploads to MyBucket"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'MyBucket');

-- Optional: allow public read (for public bucket)
CREATE POLICY "Allow public read MyBucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'MyBucket');
```

**Option B – Restrict to authenticated users only**

If you only want signed-in users to upload:

```sql
CREATE POLICY "Authenticated uploads to MyBucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'MyBucket');
```

Use **Option A** if you want “no restriction” and anyone (including anon) to upload.

## 3. Environment variables

In `.env` (or your deployment env):

- `NEXT_PUBLIC_SUPABASE_URL` – project URL (e.g. `https://xxxx.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – project anon key.

Without these, the Supabase client cannot be created and upload will fail.

## 4. How the app uses storage

- **Bucket**: `MyBucket`
- **Path**: `upload/<uuid>-<sanitized_filename>` (e.g. `upload/abc-123-data.json`)
- **Auth**:
  - If the user is **signed in**: file is uploaded to Storage, then processed for RAG (chunked, embedded, stored in DB).
  - If the user is **not signed in**: file is only uploaded to Storage; no RAG indexing (DB requires auth).

## 5. If upload still fails

- **401 Unauthorized**: Usually from another endpoint (e.g. session). The upload route itself does not return 401. Check that session/auth is not blocking the request (e.g. middleware or frontend sending credentials).
- **403 / policy violation**: Storage policy is missing or too strict. Add the INSERT policy for `MyBucket` as above.
- **Bucket not found**: Create `MyBucket` in the dashboard and ensure the name is exactly `MyBucket`.
- **Missing URL/Key**: Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set and loaded (restart dev server after changing `.env`).
