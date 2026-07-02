# Landlord Portal

Client-facing landlord/investor portal for Lakeland Abstract. React 18 + Vite + Supabase,
deployed on Vercel. Shares the Supabase project `zylifhczmdvehiogkegc`.

Batch 2 = scaffold: magic-link auth, account context, permission-gated navigation,
and the Team & access management screen. Feature modules land in later batches.

## 1. Database

Run these in the Supabase SQL editor, in order (both are additive & re-runnable):

1. `landlord_migration_01.sql` (the foundation — 28 tables, RLS, storage bucket)
2. `migration_02.sql` (member email/display_name)

When the linter dialog appears, choose **Run and enable RLS**.

## 2. Vercel

New Vercel project pointing at this repo. Set environment variables:

- `VITE_SUPABASE_URL` = https://zylifhczmdvehiogkegc.supabase.co
- `VITE_SUPABASE_ANON_KEY` = (Supabase → Project Settings → API → anon public key)

Build command `vite build`, output `dist` (auto-detected). `vercel.json` handles SPA routing.

## 3. Supabase Auth settings

- Auth → URL Configuration → **Site URL**: your Vercel URL.
- Add the same URL under **Redirect URLs**.
- Email → keep "Confirm email" on; magic links are used for sign-in.

## 4. Bootstrap a test account (until staff provisioning is built in Batch 4)

Provisioning normally happens from the staff CRM via a service-role endpoint.
To create your first account now for testing:

1. Deploy, open the app, sign in with your email (magic link). This creates your
   `auth.users` row. Copy your user id from Supabase → Authentication → Users.
2. In the SQL editor, run (replace the two values):

```sql
with a as (
  insert into public.landlord_accounts (name, primary_email)
  values ('Test Landlord LLC', 'YOUR_EMAIL')
  returning id
)
insert into public.landlord_members (account_id, user_id, role, email)
select a.id, 'YOUR_AUTH_USER_ID', 'owner', 'YOUR_EMAIL' from a;
```

3. Refresh the app — you're in as the owner and can invite teammates from **Team & access**.

## Conventions

- Files: `Landlord`-prefixed, components in `src/`, serverless in `api/`.
- Supabase client import: `landlordClient.js`.
- Storage: every object path is `{account_id}/…` (RLS keys on it).
- Permissions: owner = full; members get per-scope toggles
  (`properties, financials, vault, documents, contacts, tasks, deals`), enforced in RLS.
