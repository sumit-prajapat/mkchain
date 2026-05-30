# MKChain Auth — Step by Step Setup Guide

Follow these steps exactly, one at a time. Do not skip ahead.

---

## STEP 1 — Install packages
Open terminal in your MKChain project folder and run:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Wait for it to finish. You'll see it added to package.json.

---

## STEP 2 — Copy the new files into your project

Take every file from the folder you downloaded and place them into
your existing Next.js project at the exact same path. Here is the
full folder structure:

```
YOUR-PROJECT/
│
├── middleware.ts                         ← ROOT of project (same level as package.json)
│
├── .env.local                            ← ROOT of project (create this, see Step 3)
│
├── lib/
│   └── supabase/
│       ├── client.ts                     ← browser Supabase client
│       └── server.ts                     ← server Supabase client
│
└── app/
    ├── auth/
    │   ├── login/
    │   │   └── page.tsx                  ← login page
    │   ├── signup/
    │   │   └── page.tsx                  ← signup page
    │   ├── forgot-password/
    │   │   └── page.tsx                  ← forgot password page
    │   └── callback/
    │       └── route.ts                  ← handles email confirm redirect
    │
    └── dashboard/
        ├── page.tsx                      ← protected dashboard (server component)
        └── LogoutButton.tsx              ← logout button (client component)
```

IMPORTANT: If your project already has a middleware.ts at the root,
you need to MERGE the content — do not replace blindly.

---

## STEP 3 — Create your .env.local file

1. Go to: https://supabase.com/dashboard
2. Open your MKChain project
3. Click "Project Settings" in the left sidebar
4. Click "API"
5. Copy the "Project URL" and the "anon public" key

Create a file called .env.local in your project root (same folder as package.json):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-key-here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Never commit this file to git. It should already be in .gitignore.

---

## STEP 4 — Run the SQL schema in Supabase

1. Go to: https://supabase.com/dashboard
2. Open your MKChain project
3. Click "SQL Editor" in the left sidebar
4. Click "New query"
5. Open the file: supabase-schema.sql (from this folder)
6. Copy the ENTIRE contents and paste into the SQL editor
7. Click the green "Run" button
8. You should see: "Success. No rows returned"

To verify it worked:
- Click "Table Editor" in the left sidebar
- You should see a "profiles" table listed

---

## STEP 5 — Enable email confirmation in Supabase (optional for dev)

For development, you may want to DISABLE email confirmation so you
can test without checking email every time.

1. Go to: Supabase Dashboard → Authentication → Providers → Email
2. Toggle OFF "Confirm email"
3. Save

Re-enable this before going to production.

---

## STEP 6 — Run your project

```bash
npm run dev
```

Open your browser and go to:

- http://localhost:3000/auth/signup     ← create an account
- http://localhost:3000/auth/login      ← sign in
- http://localhost:3000/dashboard       ← protected page

---

## STEP 7 — Test the full flow

Do these checks one by one:

[ ] Go to /auth/signup → fill in name, email, password → submit
    → You should see "Check your email" success screen

[ ] Go to Supabase Dashboard → Authentication → Users
    → You should see your test user listed

[ ] Go to Supabase Dashboard → Table Editor → profiles
    → You should see a matching row auto-created

[ ] If email confirm is OFF: go to /auth/login → sign in → should land on /dashboard
[ ] If email confirm is ON:  check your email → click the link → should land on /dashboard

[ ] While logged in, try going to /auth/login
    → Should redirect you to /dashboard automatically

[ ] While logged out, try going to /dashboard directly
    → Should redirect you to /auth/login

[ ] On /dashboard, click "Sign out"
    → Should redirect to /auth/login

---

## STEP 8 — What to tell me

Once done, tell me:
- Did users appear in Supabase Authentication → Users? (yes/no)
- Did profile rows appear in Table Editor → profiles? (yes/no)
- Did the dashboard redirect work? (yes/no)
- Any error messages you see in the browser or terminal?

Then we immediately move to: API Key Generation System.

---

## Common errors and fixes

ERROR: "supabase is not defined" or module not found
FIX: Run npm install @supabase/supabase-js @supabase/ssr again

ERROR: "NEXT_PUBLIC_SUPABASE_URL is not defined"  
FIX: Make sure .env.local is in the ROOT of your project (same folder as package.json)
     Restart npm run dev after creating .env.local

ERROR: "relation profiles does not exist"
FIX: You haven't run the SQL schema yet. Go to Step 4.

ERROR: Email link not working
FIX: Disable "Confirm email" in Supabase for development (Step 5)

ERROR: Redirect loop on /dashboard
FIX: Make sure middleware.ts is at the ROOT of your project, not inside /app/
