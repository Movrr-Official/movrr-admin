-- 1️⃣ ENUM types for roles and status
create type public."user_role" as enum (
  'super_admin',
  'admin',
  'moderator',
  'support',
  'advertiser',
  'rider',
  'gov'
);

create type public."user_status" as enum (
  'active',
  'suspended',
  'pending',
  'deleted'
);

-- 2️⃣ Main User table (linked to Supabase auth.users)
create table public."user" (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  "emailVerified" boolean not null default false,
  name text not null,
  phone text null,
  role public."user_role" not null default 'rider',
  status public."user_status" not null default 'active',
  "isVerified" boolean not null default false,
  "verificationLevel" text default 'basic' check ("verificationLevel" in ('basic', 'kyc', 'manual_review')),
  organization text null,
  "languagePreference" text not null default 'en',
  "accountNotes" text null,
  "avatarUrl" text null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  "lastLogin" timestamp with time zone null,
  "lastActiveAt" timestamp with time zone null,
  "deletedAt" timestamp with time zone null,
  "createdBy" uuid null references public."user"(id) on delete set null,
  "updatedBy" uuid null references public."user"(id) on delete set null
);

-- ✅ Minor fixes:
-- - changed defaults to lowercase ('rider', 'active') since enums are case-sensitive.
-- - switched timestamps to "with time zone" for better consistency with Supabase.
-- - added quotation marks around "user_role" in column references.
-- - added comments for clarity.

-- 3️⃣ Advertiser Profile
create table public."advertiser" (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references public."user"(id) on delete cascade,
  "companyName" text not null,
  industry text null,
  website text null,
  "logoUrl" text null,
  verified boolean default false,

  -- Basic analytics
  "budget" numeric(12,2) default 0,
  "activeCampaigns" int default 0,
  "totalCampaigns" int default 0,

  -- Optional future fields (commented out for now)
  -- "totalImpressions" int default 0,
  -- "ridersEngaged" int default 0,

  -- Preferences
  "emailNotifications" boolean default true,
  "campaignUpdates" boolean default true,

  "createdAt" timestamp with time zone default now()
);


-- 4️⃣ Rider Profile
create type public."RiderStatus" as enum ('active', 'inactive', 'suspended');

create table public."rider" (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references public."user"(id) on delete cascade,
  city text not null,
  country text not null,
  "vehicleType" text default 'bicycle',
  availability boolean default true,

  -- Rider status & performance
  status public."RiderStatus" not null default 'active',
  "isCertified" boolean default false,
  rating numeric(2,1) default 0.0,
  "totalCampaigns" int default 0,
  "impressionsDelivered" int default 0,

  -- Contact & emergency info
  phone text null,
  "emergencyContact" text null,
  "emergencyPhone" text null,

  "createdAt" timestamp with time zone default now()
);


-- 5️⃣ Enable RLS
alter table public."user" enable row level security;
alter table public."rider" enable row level security;
alter table public."advertiser" enable row level security;

-- 6️⃣ Policies
create policy "Users can view their own profile"
on public."user" for select
using (auth.uid() = id);

create policy "Users can update their own profile"
on public."user" for update
using (auth.uid() = id);

-- 7️⃣ Trigger to sync Supabase auth → User
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public."user" (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


BEGIN;

-- 1) Create enum type if not exists (safe check via plpgsql)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE public.waitlist_status AS ENUM ('pending','approved','rejected');
  END IF;
END$$;

-- 2) Add column using the enum type with default
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS status public.waitlist_status NOT NULL DEFAULT 'approved';

-- 3) Backfill any NULLs just in case
UPDATE public.waitlist SET status = 'approved' WHERE status IS NULL;

-- 4) Create index
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist USING btree (status);

COMMIT;


create table public.advertiser (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references "user" (id) on delete cascade,
  "companyName" text not null,
  industry text,
  website text,
  "logoUrl" text,
  verified boolean default false,
  budget numeric(12, 2) default 0,
  "activeCampaigns" int default 0,
  "totalCampaigns" int default 0,
  "totalImpressions" int default 0,
  "ridersEngaged" int default 0,
  "avgCampaignDuration" text,
  "emailNotifications" boolean default true,
  "campaignUpdates" boolean default true,
  language text default 'en',
  timezone text default 'UTC',
  "createdAt" timestamptz default now()
);

create table public.rider (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references "user" (id) on delete cascade,
  city text not null,
  country text not null,
  "vehicleType" text default 'bicycle',
  availability boolean default true,
  status public.RiderStatus default 'active'::public.RiderStatus,
  "isCertified" boolean default false,
  rating numeric(2, 1) default 0.0,
  "totalCampaigns" int default 0,
  "impressionsDelivered" int default 0,
  "weeklyEarnings" numeric(10, 2) default 0,
  "totalEarnings" numeric(12, 2) default 0,
  "lastActive" timestamptz,
  "currentCampaign" uuid,
  "routeProgress" numeric(5, 2),
  phone text,
  "emergencyContact" text,
  "emergencyPhone" text,
  "createdAt" timestamptz default now()
);



create table public.campaign (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.advertiser(id) on delete cascade,

  name text not null,
  description text,
  budget numeric(12,2) not null check (budget >= 0),

  start_date timestamptz not null,
  end_date timestamptz not null,
  status public.campaign_status default 'draft',         -- draft | active | paused | completed | cancelled
  campaign_type public.campaign_type default 'destination_ride', -- destination_ride | swarm | other

  vehicle_type_required text,       -- e.g., 'bicycle', 'e-bike', etc.
  target_zones text[],              -- regions/cities
  creative_assets jsonb,            -- stores URLs, metadata, etc.

  -- performance metrics
  impressions integer default 0,
  clicks integer default 0,
  conversions integer default 0,
  roi numeric(8,2) default 0,       -- percentage ROI
  engagement_rate numeric(5,2) default 0, -- e.g., 12.5%

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- useful indexes for dashboard filtering
create index if not exists idx_campaign_advertiser_id on public.campaign (advertiser_id);
create index if not exists idx_campaign_status on public.campaign (status);
create index if not exists idx_campaign_type on public.campaign (campaign_type);

create table public.route (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  campaign_id uuid references public.campaign(id) on delete cascade,
  
  -- location info
  start_lat double precision not null,
  start_lng double precision not null,
  end_lat double precision not null,
  end_lng double precision not null,

  -- optional metadata
  estimated_duration_minutes integer,
  coverage_km double precision,
  city text,
  country text,
  difficulty text default 'easy', -- easy | medium | hard
  status text default 'pending',  -- pending | active | completed | cancelled
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


create table public.rider_route (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider(id) on delete cascade,
  route_id uuid not null references public.route(id) on delete cascade,
  campaign_id uuid null references public.campaign(id) on delete cascade,
  
  status text default 'assigned',   -- assigned | active | completed | cancelled
  progress numeric(5,2) default 0,  -- e.g. 75.00 (%)
  impressions integer default 0,    -- total impressions delivered on this route
  assigned_by uuid null references public.user(id),
  assigned_at timestamptz default now(),
  completed_at timestamptz null,

  unique (rider_id, route_id)
);

-- optional indexes for faster lookups
create index if not exists idx_rider_route_rider_id on public.rider_route (rider_id);
create index if not exists idx_rider_route_route_id on public.rider_route (route_id);
create index if not exists idx_rider_route_campaign_id on public.rider_route (campaign_id);


CREATE TABLE public.assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  riderId uuid NOT NULL REFERENCES public.rider (id) ON DELETE CASCADE,
  routeId uuid NOT NULL REFERENCES public.route (id) ON DELETE CASCADE,
  campaignId uuid NOT NULL REFERENCES public.campaign (id) ON DELETE CASCADE,
  assignedAt timestamptz DEFAULT now(),
  completed boolean DEFAULT false,
  impressions integer DEFAULT 0
);


CREATE TABLE public.performance_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  riderId uuid NOT NULL REFERENCES public.rider (id) ON DELETE CASCADE,
  totalRoutes integer DEFAULT 0,
  completedRoutes integer DEFAULT 0,
  totalImpressions integer DEFAULT 0,
  totalEarnings double precision DEFAULT 0,
  lastActive timestamptz
);


CREATE TABLE public.support_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  userId uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text DEFAULT 'open',
  name text NOT NULL,
  email text NOT NULL,
  role user_role NOT NULL,
  issueType text NOT NULL,
  description text NOT NULL,
  fileAttachment text,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);


CREATE TABLE public.support_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId uuid NOT NULL REFERENCES public.support_ticket (id) ON DELETE CASCADE,
  sender text NOT NULL,  -- 'user' or 'admin'
  message text NOT NULL,
  sentAt timestamptz DEFAULT now()
);


CREATE TABLE public.Post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text,
  content text NOT NULL,
  author text,
  category text,
  imageUrl text,
  readTime integer DEFAULT 1,
  tags text[],
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);


CREATE INDEX IF NOT EXISTS idx_assignment_riderId ON public.Assignment (riderId);
CREATE INDEX IF NOT EXISTS idx_assignment_campaignId ON public.Assignment (campaignId);

-- Function to convert waitlist to user
create or replace function public.convert_waitlist_to_user()
returns trigger as $$
begin
  if new.status = 'approved' and new.converted_to_user = false then
    insert into public."user" (
      id, email, name, role, status, "createdAt"
    ) values (
      gen_random_uuid(), new.email, new.name, 'rider', 'active', now()
    );

    update public."waitlist"
    set converted_to_user = true,
        updated_at = now()
    where id = new.id;
  end if;

  return new;
end;
$$ language plpgsql;

-- Trigger
create trigger trg_waitlist_to_user
after update on public."waitlist"
for each row
when (old.status is distinct from new.status)
execute function public.convert_waitlist_to_user();
