-- Lisanga : schéma Supabase (PostgreSQL + Row Level Security + Realtime + Storage).
-- À coller en entier dans Supabase > SQL Editor, puis « Run ». Le script peut être relancé sans danger.
--
-- Rôles :
--   organisateur = tontines.owner_id : réglages, membres, versements, remises, inscriptions ;
--   membre actif = ligne members.status = 'active' avec son user_id : lit tout, écrit dans la discussion ;
--   demandeur    = ligne members.status = 'pending' : ne voit que sa demande et le nom de la tontine.
-- Le numéro de téléphone (table contacts) n'est lisible que par l'organisateur.

-- ---------- Tables ----------
create table if not exists public.tontines (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  amount        numeric not null check (amount > 0),
  currency      text not null default 'FC' check (char_length(currency) between 1 and 8),
  interval_days int not null default 30 check (interval_days between 1 and 365),
  start_date    date not null,
  penalty       numeric not null default 0 check (penalty >= 0),
  reminder_days int not null default 3 check (reminder_days between 0 and 30),
  country_code  text not null default '243' check (country_code ~ '^[0-9]{1,4}$'),
  join_open     boolean not null default true,
  code          text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_at    timestamptz not null default now()
);

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  tontine_id  uuid not null references public.tontines(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 40),
  position    int not null default 0,
  status      text not null default 'active' check (status in ('pending', 'active')),
  created_at  timestamptz not null default now(),
  unique (tontine_id, user_id)
);
create index if not exists members_tontine_idx on public.members (tontine_id, position);

create table if not exists public.contacts (
  member_id   uuid primary key references public.members(id) on delete cascade,
  tontine_id  uuid not null references public.tontines(id) on delete cascade,
  phone       text not null check (char_length(phone) between 1 and 30)
);

-- Un versement cumulé par membre et par tour ; `log` garde le détail des versements partiels.
create table if not exists public.payments (
  tontine_id    uuid not null references public.tontines(id) on delete cascade,
  round         int not null check (round >= 0),
  member_id     uuid not null references public.members(id) on delete cascade,
  amount        numeric not null check (amount > 0),
  penalty_paid  boolean not null default false,
  paid_on       date not null,
  done_on       date,
  log           jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (tontine_id, round, member_id)
);

create table if not exists public.payouts (
  tontine_id  uuid not null references public.tontines(id) on delete cascade,
  round       int not null check (round >= 0),
  member_id   uuid not null references public.members(id) on delete cascade,
  amount      numeric not null check (amount >= 0),
  paid_on     date not null,
  created_at  timestamptz not null default now(),
  primary key (tontine_id, round)
);

create table if not exists public.topics (
  id           uuid primary key default gen_random_uuid(),
  tontine_id   uuid not null references public.tontines(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 50),
  author_id    uuid not null default auth.uid(),
  author_name  text not null,
  closed       boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index if not exists topics_title_idx on public.topics (tontine_id, lower(title));

-- topic_id nul = sujet « Général ». `att` décrit la pièce jointe stockée dans le bucket `lisanga`.
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  tontine_id   uuid not null references public.tontines(id) on delete cascade,
  topic_id     uuid references public.topics(id) on delete cascade,
  author_id    uuid not null default auth.uid(),
  author_name  text not null,
  body         text not null default '' check (char_length(body) <= 1000),
  att          jsonb,
  created_at   timestamptz not null default now(),
  check (body <> '' or att is not null)
);
create index if not exists messages_tontine_idx on public.messages (tontine_id, created_at);

-- ---------- Fonctions d'appartenance (security definer : évitent la récursion des politiques) ----------
create or replace function public.is_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tontines where id = t and owner_id = auth.uid())
$$;

-- Organisateur ou membre actif.
create or replace function public.is_active(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner(t) or exists (
    select 1 from public.members where tontine_id = t and user_id = auth.uid() and status = 'active')
$$;

-- A une ligne dans le groupe, même simple demande en attente.
create or replace function public.is_in(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner(t) or exists (
    select 1 from public.members where tontine_id = t and user_id = auth.uid())
$$;

create or replace function public.topic_open(tp uuid, t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select tp is null or exists (select 1 from public.topics where id = tp and tontine_id = t and not closed)
$$;

create or replace function public.try_uuid(s text) returns uuid
language plpgsql immutable as $$
begin return s::uuid; exception when others then return null; end $$;

-- ---------- Row Level Security ----------
alter table public.tontines enable row level security;
alter table public.members  enable row level security;
alter table public.contacts enable row level security;
alter table public.payments enable row level security;
alter table public.payouts  enable row level security;
alter table public.topics   enable row level security;
alter table public.messages enable row level security;

do $$
declare r record;
begin  -- repart de zéro pour que le script reste rejouable
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('tontines','members','contacts','payments','payouts','topics','messages')
  loop execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

create policy tontines_select on public.tontines for select to authenticated using (public.is_in(id));
create policy tontines_insert on public.tontines for insert to authenticated with check (owner_id = auth.uid());
create policy tontines_update on public.tontines for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy tontines_delete on public.tontines for delete to authenticated using (owner_id = auth.uid());

create policy members_select on public.members for select to authenticated
  using (public.is_active(tontine_id) or user_id = auth.uid());
create policy members_insert on public.members for insert to authenticated with check (public.is_owner(tontine_id));
create policy members_update on public.members for update to authenticated
  using (public.is_owner(tontine_id)) with check (public.is_owner(tontine_id));
create policy members_delete on public.members for delete to authenticated
  using (public.is_owner(tontine_id) or (user_id = auth.uid() and status = 'pending'));

create policy contacts_all on public.contacts for all to authenticated
  using (public.is_owner(tontine_id)) with check (public.is_owner(tontine_id));

create policy payments_select on public.payments for select to authenticated using (public.is_active(tontine_id));
create policy payments_write  on public.payments for all to authenticated
  using (public.is_owner(tontine_id)) with check (public.is_owner(tontine_id));

create policy payouts_select on public.payouts for select to authenticated using (public.is_active(tontine_id));
create policy payouts_write  on public.payouts for all to authenticated
  using (public.is_owner(tontine_id)) with check (public.is_owner(tontine_id));

create policy topics_select on public.topics for select to authenticated using (public.is_active(tontine_id));
create policy topics_insert on public.topics for insert to authenticated
  with check (public.is_active(tontine_id) and author_id = auth.uid());
create policy topics_update on public.topics for update to authenticated
  using (author_id = auth.uid() or public.is_owner(tontine_id))
  with check (author_id = auth.uid() or public.is_owner(tontine_id));
create policy topics_delete on public.topics for delete to authenticated
  using (author_id = auth.uid() or public.is_owner(tontine_id));

create policy messages_select on public.messages for select to authenticated using (public.is_active(tontine_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_active(tontine_id) and author_id = auth.uid() and public.topic_open(topic_id, tontine_id));
create policy messages_delete on public.messages for delete to authenticated
  using (author_id = auth.uid() or public.is_owner(tontine_id));

-- ---------- Inscription par code (le demandeur n'a pas le droit d'écrire dans members) ----------
create or replace function public.tontine_preview(p_code text)
returns table (name text, join_open boolean)
language sql stable security definer set search_path = public as $$
  select name, join_open from public.tontines where code = lower(trim(p_code))
$$;

create or replace function public.join_tontine(p_code text, p_name text, p_phone text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.tontines; mid uuid; nm text := left(trim(coalesce(p_name, '')), 40); ph text := left(trim(coalesce(p_phone, '')), 30);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into t from public.tontines where code = lower(trim(p_code));
  if not found then raise exception 'invalid_code'; end if;
  if not t.join_open then raise exception 'join_closed'; end if;
  if nm = '' then raise exception 'name_required'; end if;
  if exists (select 1 from public.members where tontine_id = t.id and user_id = auth.uid()) or t.owner_id = auth.uid()
    then raise exception 'already_joined'; end if;
  insert into public.members (tontine_id, user_id, name, status) values (t.id, auth.uid(), nm, 'pending') returning id into mid;
  if ph <> '' then insert into public.contacts (member_id, tontine_id, phone) values (mid, t.id, ph); end if;
  return mid;
end $$;

revoke all on function public.tontine_preview(text), public.join_tontine(text, text, text) from public, anon;
grant execute on function public.tontine_preview(text), public.join_tontine(text, text, text) to authenticated;
grant execute on function public.is_owner(uuid), public.is_active(uuid), public.is_in(uuid),
  public.topic_open(uuid, uuid), public.try_uuid(text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tontines, public.members, public.contacts, public.payments,
  public.payouts, public.topics, public.messages to authenticated;

-- ---------- Temps réel ----------
-- replica identity full : les événements DELETE portent alors tontine_id et passent le filtre côté client.
alter table public.members  replica identity full;
alter table public.contacts replica identity full;
alter table public.payments replica identity full;
alter table public.payouts  replica identity full;
alter table public.topics   replica identity full;
alter table public.messages replica identity full;
alter table public.tontines replica identity full;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tontines','members','contacts','payments','payouts','topics','messages'] loop
      begin execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null; end;
    end loop;
  end if;
end $$;

-- ---------- Stockage des photos, vocaux et PDF ----------
-- Chemin d'un fichier : <tontine_id>/<user_id>/<nom>. Lecture : membres actifs. Écriture : dans son propre dossier.
insert into storage.buckets (id, name, public, file_size_limit)
values ('lisanga', 'lisanga', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

drop policy if exists lisanga_read   on storage.objects;
drop policy if exists lisanga_insert on storage.objects;
drop policy if exists lisanga_delete on storage.objects;
create policy lisanga_read on storage.objects for select to authenticated
  using (bucket_id = 'lisanga' and public.is_active(public.try_uuid((storage.foldername(name))[1])));
create policy lisanga_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lisanga' and public.is_active(public.try_uuid((storage.foldername(name))[1]))
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy lisanga_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lisanga' and ((storage.foldername(name))[2] = auth.uid()::text
         or public.is_owner(public.try_uuid((storage.foldername(name))[1]))));
