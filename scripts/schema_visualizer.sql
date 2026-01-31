-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_access_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_access_logs_pkey PRIMARY KEY (id),
  CONSTRAINT admin_access_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.admin_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.admin_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT admin_users_pkey PRIMARY KEY (id),
  CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT admin_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.advertiser (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  industry text,
  website text,
  verified boolean DEFAULT false,
  budget numeric DEFAULT 0,
  avg_campaignDuration text,
  language text DEFAULT 'en'::text,
  timezone text DEFAULT 'UTC'::text,
  user_id uuid,
  company_name text,
  logo_url text,
  active_campaigns integer,
  total_campaigns integer,
  email_notifications boolean,
  campaign_updates boolean,
  created_at timestamp with time zone,
  total_impressions integer,
  riders_engaged integer,
  avg_campaign_duration text,
  company_email text,
  CONSTRAINT advertiser_pkey PRIMARY KEY (id),
  CONSTRAINT advertiser_user_id_fkey_new FOREIGN KEY (user_id) REFERENCES public.user(id)
);
CREATE TABLE public.campaign (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  budget numeric NOT NULL CHECK (budget >= 0::numeric),
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  campaign_type USER-DEFINED DEFAULT 'destination_ride'::campaign_type,
  vehicle_type_required text,
  target_zones ARRAY,
  creative_assets jsonb,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  roi numeric DEFAULT 0,
  engagement_rate numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  coverage_goal text,
  visibility_target text,
  max_riders integer,
  signup_deadline timestamp with time zone,
  selection_strategy text,
  selection_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  campaign_multiplier numeric NOT NULL DEFAULT 1.0 CHECK (campaign_multiplier = ANY (ARRAY[1.0, 1.25, 1.5, 2.0])),
  campaign_points_cap integer NOT NULL DEFAULT 600 CHECK (campaign_points_cap >= 0),
  expected_min_daily_verified_minutes integer,
  expected_max_daily_verified_minutes integer,
  lifecycle_status USER-DEFINED DEFAULT 'draft'::campaign_lifecycle_status,
  CONSTRAINT campaign_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertiser(id)
);
CREATE TABLE public.campaign_assignment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  rider_id uuid,
  campaign_id uuid,
  assigned_at timestamp with time zone,
  CONSTRAINT campaign_assignment_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_assignment_rider_id_fkey_new FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT campaign_assignment_campaign_id_fkey_new FOREIGN KEY (campaign_id) REFERENCES public.campaign(id)
);
CREATE TABLE public.campaign_assignment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_assignment_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['assigned'::text, 'accepted'::text, 'declined'::text, 'activated'::text, 'completed'::text, 'cancelled'::text])),
  previous_status text,
  new_status text,
  event_at timestamp with time zone NOT NULL DEFAULT now(),
  changed_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT campaign_assignment_events_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_assignment_events_campaign_assignment_id_fkey FOREIGN KEY (campaign_assignment_id) REFERENCES public.campaign_assignment(id),
  CONSTRAINT campaign_assignment_events_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT campaign_assignment_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id),
  CONSTRAINT campaign_assignment_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.campaign_hot_zone (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  name text,
  bonus_percent integer NOT NULL DEFAULT 0 CHECK (bonus_percent >= 0),
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  geom USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_hot_zone_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_hot_zone_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id)
);
CREATE TABLE public.campaign_signup (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'joined'::text CHECK (status = ANY (ARRAY['joined'::text, 'withdrawn'::text, 'selected'::text, 'confirmed'::text, 'rejected'::text, 'expired'::text])),
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  withdrawn_at timestamp with time zone,
  selected_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  rejected_at timestamp with time zone,
  selection_score numeric,
  selection_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_signup_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_signup_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT campaign_signup_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id)
);
CREATE TABLE public.campaign_zone (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  name text,
  geom USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_zone_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_zone_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id)
);
CREATE TABLE public.campaign_zone_backup (
  id uuid,
  campaign_id uuid,
  name text,
  geom USER-DEFINED,
  created_at timestamp with time zone
);
CREATE TABLE public.export_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  export_type text NOT NULL CHECK (export_type = ANY (ARRAY['manual'::text, 'scheduled'::text, 'batch'::text])),
  format text NOT NULL CHECK (format = ANY (ARRAY['csv'::text, 'xlsx'::text, 'pdf'::text, 'json'::text])),
  filename text NOT NULL,
  record_count integer NOT NULL,
  file_size integer,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  created_by uuid,
  CONSTRAINT export_history_pkey PRIMARY KEY (id),
  CONSTRAINT export_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.geocode_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  normalized_text text NOT NULL,
  provider text NOT NULL,
  provider_id text,
  raw_json jsonb,
  geom USER-DEFINED,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT geocode_cache_pkey PRIMARY KEY (id)
);
CREATE TABLE public.impression_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_tracking_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  route_id uuid NOT NULL,
  impression_type text NOT NULL CHECK (impression_type = ANY (ARRAY['display'::text, 'completion'::text, 'engagement'::text, 'click'::text])),
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT impression_events_pkey PRIMARY KEY (id),
  CONSTRAINT impression_events_route_tracking_id_fkey FOREIGN KEY (route_tracking_id) REFERENCES public.route_tracking(id),
  CONSTRAINT impression_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id),
  CONSTRAINT impression_events_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT impression_events_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.route(id),
  CONSTRAINT impression_events_route_tracking_fkey FOREIGN KEY (route_tracking_id) REFERENCES public.route_tracking(id),
  CONSTRAINT impression_events_campaign_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id),
  CONSTRAINT impression_events_rider_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT impression_events_route_fkey FOREIGN KEY (route_id) REFERENCES public.route(id)
);
CREATE TABLE public.performance_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid,
  total_routes integer,
  completed_routes integer,
  total_impressions integer,
  total_earnings double precision,
  last_active timestamp with time zone,
  CONSTRAINT performance_stats_pkey PRIMARY KEY (id),
  CONSTRAINT performance_stats_rider_id_fkey_new FOREIGN KEY (rider_id) REFERENCES public.rider(id)
);
CREATE TABLE public.post (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text NOT NULL,
  author text,
  category text,
  image_url text,
  read_time integer DEFAULT 1,
  tags ARRAY,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT post_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pro_tips (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  icon text NOT NULL,
  text text NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 500),
  category text,
  priority integer DEFAULT 0 CHECK (priority >= 0),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pro_tips_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reward_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  points_price integer NOT NULL CHECK (points_price >= 0),
  partner_id uuid,
  partner_url text,
  thumbnail_url text,
  gallery_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  inventory_type text NOT NULL DEFAULT 'unlimited'::text,
  inventory_count integer,
  max_per_rider integer,
  featured_rank integer,
  is_featured boolean NOT NULL DEFAULT false,
  visibility_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags ARRAY NOT NULL DEFAULT '{}'::text[],
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_catalog_pkey PRIMARY KEY (id),
  CONSTRAINT reward_catalog_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.reward_partner(id)
);
CREATE TABLE public.reward_catalog_sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reward_id uuid,
  sync_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_catalog_sync_log_pkey PRIMARY KEY (id),
  CONSTRAINT reward_catalog_sync_log_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.reward_catalog(id)
);
CREATE TABLE public.reward_partner (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  website text,
  logo_url text,
  contact_email text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_partner_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reward_redemptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL,
  points_spent integer NOT NULL CHECK (points_spent > 0),
  reward_sku text,
  status text NOT NULL DEFAULT 'requested'::text CHECK (status = ANY (ARRAY['requested'::text, 'approved'::text, 'fulfilled'::text, 'cancelled'::text, 'rejected'::text])),
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  fulfilled_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT reward_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT reward_redemptions_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id)
);
CREATE TABLE public.reward_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL,
  campaign_id uuid,
  ride_id uuid,
  points_earned integer NOT NULL CHECK (points_earned >= 0),
  source text NOT NULL DEFAULT 'campaign_ride'::text CHECK (source = ANY (ARRAY['campaign_ride'::text, 'bonus'::text, 'adjustment'::text])),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  route_tracking_id uuid UNIQUE,
  verified_minutes integer,
  base_rate numeric,
  campaign_multiplier numeric,
  quality_multiplier numeric,
  awarded_on date,
  week_start date,
  period_start date,
  bonus_type text,
  CONSTRAINT reward_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT reward_transactions_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT reward_transactions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id)
);
CREATE TABLE public.rider (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city text NOT NULL,
  country text NOT NULL,
  availability boolean DEFAULT true,
  status USER-DEFINED NOT NULL DEFAULT 'active'::rider_status,
  rating numeric DEFAULT 0.0,
  phone text,
  emergency_contact text,
  emergency_phone text,
  user_id uuid,
  vehicle_type text,
  is_certified boolean,
  total_campaigns integer,
  impressions_delivered integer,
  created_at timestamp with time zone,
  last_active timestamp with time zone,
  route_progress numeric,
  current_campaign uuid,
  CONSTRAINT rider_pkey PRIMARY KEY (id),
  CONSTRAINT rider_user_id_fkey_new FOREIGN KEY (user_id) REFERENCES public.user(id)
);
CREATE TABLE public.rider_availability_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL,
  availability boolean NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  changed_by uuid,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT rider_availability_log_pkey PRIMARY KEY (id),
  CONSTRAINT rider_availability_log_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT rider_availability_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.rider_bikes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL UNIQUE,
  brand text,
  model text,
  color text,
  year text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rider_bikes_pkey PRIMARY KEY (id),
  CONSTRAINT rider_bikes_rider_id_fkey_correct FOREIGN KEY (rider_id) REFERENCES public.rider(id)
);
CREATE TABLE public.rider_campaign_streak (
  rider_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  streak_days integer NOT NULL DEFAULT 0,
  last_ride_date date,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rider_campaign_streak_pkey PRIMARY KEY (rider_id, campaign_id),
  CONSTRAINT rider_campaign_streak_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT rider_campaign_streak_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id)
);
CREATE TABLE public.rider_reward_balance (
  rider_id uuid NOT NULL,
  points_balance integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  lifetime_points_earned integer NOT NULL DEFAULT 0 CHECK (lifetime_points_earned >= 0),
  daily_points_earned integer NOT NULL DEFAULT 0 CHECK (daily_points_earned >= 0),
  daily_points_cap integer NOT NULL DEFAULT 1000 CHECK (daily_points_cap > 0),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  weekly_points_earned integer NOT NULL DEFAULT 0,
  weekly_points_cap integer NOT NULL DEFAULT 600,
  tier text,
  tier_points_last30 integer NOT NULL DEFAULT 0,
  CONSTRAINT rider_reward_balance_pkey PRIMARY KEY (rider_id),
  CONSTRAINT rider_reward_balance_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id)
);
CREATE TABLE public.rider_route (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL,
  route_id uuid NOT NULL,
  campaign_id uuid,
  status text DEFAULT 'assigned'::text,
  progress numeric DEFAULT 0,
  impressions integer DEFAULT 0,
  assigned_by uuid,
  assigned_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  CONSTRAINT rider_route_pkey PRIMARY KEY (id),
  CONSTRAINT rider_route_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.rider(id),
  CONSTRAINT rider_route_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.route(id),
  CONSTRAINT rider_route_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.user(id)
);
CREATE TABLE public.route (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  campaign_id uuid,
  start_lat double precision NOT NULL,
  start_lng double precision NOT NULL,
  end_lat double precision NOT NULL,
  end_lng double precision NOT NULL,
  estimated_duration_minutes integer,
  coverage_km double precision,
  city text,
  country text,
  difficulty text DEFAULT 'easy'::text,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tolerance double precision,
  CONSTRAINT route_pkey PRIMARY KEY (id),
  CONSTRAINT route_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(id)
);
CREATE TABLE public.route_stop (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  stop_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT route_stop_pkey PRIMARY KEY (id),
  CONSTRAINT route_stop_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.route(id)
);
CREATE TABLE public.route_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone,
  path jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_distance numeric NOT NULL DEFAULT 0,
  average_speed numeric NOT NULL DEFAULT 0,
  route_compliance integer NOT NULL DEFAULT 0 CHECK (route_compliance >= 0 AND route_compliance <= 100),
  impressions_earned integer NOT NULL DEFAULT 0,
  battery_usage numeric,
  created_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  max_speed numeric DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT route_tracking_pkey PRIMARY KEY (id),
  CONSTRAINT route_tracking_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.route(id),
  CONSTRAINT route_tracking_rider_id_fkey_correct FOREIGN KEY (rider_id) REFERENCES public.rider(id)
);
CREATE TABLE public.scheduled_exports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  data_source_id text NOT NULL,
  export_options jsonb NOT NULL,
  schedule jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  last_run timestamp with time zone,
  next_run timestamp with time zone NOT NULL,
  run_count integer DEFAULT 0,
  created_by uuid,
  CONSTRAINT scheduled_exports_pkey PRIMARY KEY (id),
  CONSTRAINT scheduled_exports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.spatial_ref_sys (
  srid integer NOT NULL CHECK (srid > 0 AND srid <= 998999),
  auth_name character varying,
  auth_srid integer,
  srtext character varying,
  proj4text character varying,
  CONSTRAINT spatial_ref_sys_pkey PRIMARY KEY (srid)
);
CREATE TABLE public.support_message (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticketid uuid NOT NULL,
  sender text NOT NULL,
  message text NOT NULL,
  sentat timestamp with time zone DEFAULT now(),
  ticket_id uuid,
  sent_at timestamp with time zone,
  CONSTRAINT support_message_pkey PRIMARY KEY (id),
  CONSTRAINT support_message_ticketid_fkey FOREIGN KEY (ticketid) REFERENCES public.support_ticket(id),
  CONSTRAINT support_message_ticket_id_fkey_new FOREIGN KEY (ticket_id) REFERENCES public.support_ticket(id)
);
CREATE TABLE public.support_ticket (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text DEFAULT 'open'::text,
  name text NOT NULL,
  email text NOT NULL,
  role USER-DEFINED NOT NULL,
  issue_type text NOT NULL,
  description text NOT NULL,
  file_attachment text,
  user_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT support_ticket_pkey PRIMARY KEY (id),
  CONSTRAINT support_ticket_user_id_fkey_new FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text,
  role USER-DEFINED NOT NULL DEFAULT 'rider'::user_role,
  status USER-DEFINED NOT NULL DEFAULT 'active'::user_status,
  organization text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  email_verified boolean,
  is_verified boolean,
  verification_level text,
  language_preference text,
  account_notes text,
  avatar_url text,
  last_login timestamp with time zone,
  last_active_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  CONSTRAINT user_pkey PRIMARY KEY (id),
  CONSTRAINT user_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT user_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user(id),
  CONSTRAINT user_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.user(id)
);
CREATE TABLE public.user_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  notifications boolean DEFAULT true,
  location_sharing boolean DEFAULT true,
  auto_accept_routes boolean DEFAULT false,
  weekend_rides boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  weekly_goal_rides integer NOT NULL DEFAULT 3 CHECK (weekly_goal_rides >= 1 AND weekly_goal_rides <= 14),
  notify_route_assignments boolean DEFAULT true,
  notify_campaign_reminders boolean DEFAULT true,
  notify_earnings_updates boolean DEFAULT true,
  notify_reward_milestones boolean DEFAULT true,
  language text DEFAULT 'en-US'::text CHECK (language IS NULL OR (language = ANY (ARRAY['en-US'::text, 'nl-NL'::text]))),
  distance_unit text DEFAULT 'miles'::text CHECK (distance_unit IS NULL OR (distance_unit = ANY (ARRAY['miles'::text, 'kilometers'::text]))),
  CONSTRAINT user_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  city text NOT NULL,
  bike_ownership text NOT NULL CHECK (bike_ownership = ANY (ARRAY['yes'::text, 'no'::text, 'planning'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  status USER-DEFINED NOT NULL DEFAULT 'pending'::waitlist_status,
  status_reason text,
  converted_to_user boolean NOT NULL DEFAULT false,
  CONSTRAINT waitlist_pkey PRIMARY KEY (id)
);