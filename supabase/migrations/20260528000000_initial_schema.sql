-- Ghisa initial schema
-- 2026-05-28

-- Settings: una riga per utente, tutto in JSONB
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Esercizi con stato di progressione
create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scheme text not null check (scheme in ('wave','linear')),
  rest_seconds int not null default 180,
  wave_base_load numeric,
  wave_current_week int,
  wave_current_cycle int,
  cycle_failures int not null default 0,
  pending_deload boolean not null default false,
  linear_current_load numeric,
  linear_target_sets int,
  linear_target_reps int,
  linear_consecutive_failures int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Schede
create table schede (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Giorni
create table scheda_days (
  id uuid primary key default gen_random_uuid(),
  scheda_id uuid not null references schede(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position int not null default 0,
  exercise_ids uuid[] not null default '{}'::uuid[]
);

-- Sedute
create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheda_id uuid references schede(id) on delete set null,
  day_id uuid references scheda_days(id) on delete set null,
  performed_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Entries
create table workout_entries (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  position int not null,
  prescribed jsonb not null,
  actual_sets jsonb not null,
  user_action text,
  result_info jsonb,
  is_deload_session boolean not null default false
);

-- Indici
create index on workouts (user_id, performed_at desc);
create index on workout_entries (user_id, exercise_id);

-- Row Level Security
alter table user_settings enable row level security;
alter table exercises enable row level security;
alter table schede enable row level security;
alter table scheda_days enable row level security;
alter table workouts enable row level security;
alter table workout_entries enable row level security;

create policy "user owns row" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user owns row" on exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user owns row" on schede
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user owns row" on scheda_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user owns row" on workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user owns row" on workout_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
