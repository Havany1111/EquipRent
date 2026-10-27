# EquipRent: Supabase Cloud Database Quick Setup Guide

Follow these quick steps to deploy the database onto your Supabase PostgreSQL cluster:

---

> **Warning:** `full_schema_setup.sql` drops and recreates the application tables. Run it only for a new/empty project; do not rerun it on a database containing data.

## Step 1: Open Supabase SQL Editor
1. Log in to [https://supabase.com](https://supabase.com) and open your project (or create a new project called **EquipRent**).
2. In the left navigation sidebar, click on **SQL Editor** (icon looking like `>_` or SQL terminal).
3. Click **"+ New Query"**.

---

## Step 2: Run the All-in-One Master Script
1. Open the file [`supabase/full_schema_setup.sql`](../supabase/full_schema_setup.sql) located in this repository.
2. Copy its entire content.
3. Paste it into the Supabase SQL Editor window.
4. Click the green **"Run"** button (or press `Ctrl + Enter` / `Cmd + Enter`).

**What this executes in one click:**
- ✅ Creates all **11 3NF Normalized Tables** (User profiles, Warehouses, Categories, Equipment, Rental Orders, Rental Order Items, Payments, Maintenance Records, Maintenance Tasks, Inspections, Audit Logs).
- ✅ Binds all **Universal Engine Triggers** (Audit diff logging, Inventory status synchronization, Financial recalculation, Double-booking guards).
- ✅ Compiles all **PL/pgSQL Stored Procedures & Functions** (`sp_process_rental_checkout`, `sp_process_equipment_return`, `fn_get_fleet_utilization_analytics`).
- ✅ Deploys all **Abstracted Views & Row Level Security (RLS)** for Admin, Staff, and Customer tiers.
- ✅ Populates realistic **Seed Data & Fixtures**.

After the master script succeeds, run [`supabase/fix_auth_and_seed_users.sql`](../supabase/fix_auth_and_seed_users.sql) in the SQL Editor to configure secure Auth-to-profile linking. It does not create Auth users; Supabase manages those records.

If you created demo Auth users with the older setup script and sign-in now reports **"Database error querying schema"**, run the updated fix script again. It repairs the missing Auth token fields on those three demo accounts.

## Step 3: Create Auth users through Supabase
1. In the Supabase dashboard, go to **Authentication -> Users -> Add user**.
2. Create users with the seeded profile email addresses:
   - `admin@equiprent.com`
   - `marcus.tech@equiprent.com`
   - `jordan.miller@buildcorp.com`
3. Set a password for each account and confirm the email.

The database trigger links each Auth user to its seeded profile by email, retaining the seeded admin, staff, and customer roles. If you previously created these demo users by running an older version of `fix_auth_and_seed_users.sql`, delete those demo Auth users in the dashboard and recreate them here. Do not delete the `user_profiles` rows.

The quick-fill buttons only fill the account email; enter the password you set in the dashboard. New self-service registrations receive the customer role. Assign staff/admin roles only to trusted accounts from the Supabase SQL Editor.

---

## Step 4: Connect Your Application via `.env`
1. In your Supabase dashboard, go to **Project Settings** (gear icon on the bottom left) -> **API**.
2. Find:
   - **Project URL** (e.g. `https://xyzabcdefg.supabase.co`)
   - **Project API Keys** -> `anon` / `public` key
3. In the root directory of this project, create a file named `.env` (or copy `.env.example` to `.env`):
   ```env
   VITE_SUPABASE_URL=https://xyzabcdefg.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. Save the `.env` file.

---

## Step 5: Verify Deployment
1. The development server will hot-reload (or run `npm run dev`).
2. Notice the top status bar in the web app:
   - It will switch from yellow to:  
     `🟢 Supabase PostgreSQL Cloud: Connected`
3. Try booking equipment or dispatching a unit — your Supabase database will execute the server-side stored procedures and triggers in real time!
