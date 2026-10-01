create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null check (char_length(name) between 2 and 80),
    nickname text not null check (char_length(nickname) between 3 and 24),
    age integer not null check (age between 1 and 120),
    created_at timestamptz not null default now()
);

create unique index if not exists profiles_nickname_lower_unique on public.profiles (lower(nickname));

create table if not exists public.friendships (
    id uuid primary key default gen_random_uuid(),
    requester_id uuid not null references public.profiles(id) on delete cascade,
    addressee_id uuid not null references public.profiles(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
    created_at timestamptz not null default now(),
    unique (requester_id, addressee_id),
    check (requester_id <> addressee_id)
);

create table if not exists public.resenhas (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles(id) on delete cascade,
    title text not null check (char_length(title) between 2 and 100),
    starts_at timestamptz not null,
    place text not null check (char_length(place) between 2 and 160),
    description text not null default '' check (char_length(description) <= 1000),
    created_at timestamptz not null default now()
);

create index if not exists resenhas_starts_at_idx on public.resenhas (starts_at);

create table if not exists public.attendance (
    resenha_id uuid not null references public.resenhas(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    going boolean not null default true,
    attended boolean not null default false,
    primary key (resenha_id, user_id)
);

create index if not exists attendance_user_attended_idx on public.attendance (user_id, attended);

create table if not exists public.notifications (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    actor_id uuid references public.profiles(id) on delete set null,
    type text not null,
    message text not null,
    resenha_id uuid references public.resenhas(id) on delete cascade,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, name, nickname, age)
    values (
        new.id,
        trim(coalesce(new.raw_user_meta_data ->> 'name', '')),
        trim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'nickname', ''), '^@+', '')),
        coalesce((new.raw_user_meta_data ->> 'age')::integer, 0)
    );
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.notify_friends_of_attendance(attendee_id uuid, event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    attendee_name text;
    event_title text;
begin
    select name into attendee_name from public.profiles where id = attendee_id;
    select title into event_title from public.resenhas where id = event_id;
    insert into public.notifications (user_id, actor_id, type, message, resenha_id)
    select distinct case when requester_id = attendee_id then addressee_id else requester_id end,
        attendee_id, 'resenha_joined', attendee_name || ' marcou presença na resenha: ' || event_title || '.', event_id
    from public.friendships
    where status = 'accepted' and (requester_id = attendee_id or addressee_id = attendee_id);
end;
$$;

create or replace function public.prevent_early_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    event_owner uuid;
    event_starts_at timestamptz;
begin
    select owner_id, starts_at into event_owner, event_starts_at
    from public.resenhas where id = new.resenha_id;

    if new.attended and event_starts_at > now() then
        raise exception 'A presença só pode ser confirmada depois da resenha.';
    end if;

    if tg_op = 'INSERT' then
        if new.going and new.user_id <> event_owner then
            perform public.notify_friends_of_attendance(new.user_id, new.resenha_id);
        end if;
    elsif tg_op = 'UPDATE' then
        if new.going and not old.going then
            perform public.notify_friends_of_attendance(new.user_id, new.resenha_id);
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists validate_attendance on public.attendance;
create trigger validate_attendance
before insert or update on public.attendance
for each row execute function public.prevent_early_attendance();

create or replace function public.add_event_owner_to_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.attendance (resenha_id, user_id, going)
    values (new.id, new.owner_id, true)
    on conflict (resenha_id, user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists add_event_owner_attendance on public.resenhas;
create trigger add_event_owner_attendance
after insert on public.resenhas
for each row execute function public.add_event_owner_to_attendance();

create or replace function public.notify_friends_of_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    owner_name text;
begin
    select name into owner_name from public.profiles where id = new.owner_id;
    insert into public.notifications (user_id, actor_id, type, message, resenha_id)
    select distinct case when requester_id = new.owner_id then addressee_id else requester_id end,
        new.owner_id, 'resenha_created', owner_name || ' adicionou uma nova resenha: ' || new.title || '.', new.id
    from public.friendships
    where status = 'accepted' and (requester_id = new.owner_id or addressee_id = new.owner_id);
    return new;
end;
$$;

drop trigger if exists notify_friends_new_event on public.resenhas;
create trigger notify_friends_new_event
after insert on public.resenhas
for each row execute function public.notify_friends_of_new_event();

create or replace function public.notify_friendship_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_name text;
begin
    if tg_op = 'INSERT' then
        if new.status = 'pending' then
            select name into actor_name from public.profiles where id = new.requester_id;
            insert into public.notifications (user_id, actor_id, type, message)
            values (new.addressee_id, new.requester_id, 'friend_request', actor_name || ' enviou uma solicitação de amizade.');
        end if;
    elsif tg_op = 'UPDATE' then
        if old.status = 'declined' and new.status = 'pending' then
            select name into actor_name from public.profiles where id = new.requester_id;
            insert into public.notifications (user_id, actor_id, type, message)
            values (new.addressee_id, new.requester_id, 'friend_request', actor_name || ' enviou uma nova solicitação de amizade.');
        elsif old.status = 'pending' and new.status = 'accepted' then
            select name into actor_name from public.profiles where id = new.addressee_id;
            insert into public.notifications (user_id, actor_id, type, message)
            values (new.requester_id, new.addressee_id, 'friend_accepted', actor_name || ' aceitou sua solicitação de amizade.');
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists notify_friendship_change on public.friendships;
create trigger notify_friendship_change
after insert or update on public.friendships
for each row execute function public.notify_friendship_change();

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.resenhas enable row level security;
alter table public.attendance enable row level security;
alter table public.notifications enable row level security;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, delete on public.resenhas to authenticated;
grant select, insert, update on public.attendance to authenticated;
grant select, update on public.notifications to authenticated;

drop policy if exists "profiles readable by members" on public.profiles;
create policy "profiles readable by members" on public.profiles
for select to authenticated using (true);

drop policy if exists "profiles updatable by owner" on public.profiles;
create policy "profiles updatable by owner" on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "friendships visible to participants" on public.friendships;
create policy "friendships visible to participants" on public.friendships
for select to authenticated using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists "friendship requests sent by owner" on public.friendships;
create policy "friendship requests sent by owner" on public.friendships
for insert to authenticated with check (requester_id = (select auth.uid()) and status = 'pending');

drop policy if exists "friendship requests answered by receiver" on public.friendships;
create policy "friendship requests answered by receiver" on public.friendships
for update to authenticated
using (addressee_id = (select auth.uid()) and status = 'pending')
with check (addressee_id = (select auth.uid()) and status in ('accepted', 'declined'));

drop policy if exists "friendship requests retried by sender" on public.friendships;
create policy "friendship requests retried by sender" on public.friendships
for update to authenticated
using (requester_id = (select auth.uid()) and status = 'declined')
with check (requester_id = (select auth.uid()) and status = 'pending');

drop policy if exists "accepted friendships removable by participants" on public.friendships;
create policy "accepted friendships removable by participants" on public.friendships
for delete to authenticated using (
    status = 'accepted' and
    ((requester_id = (select auth.uid())) or (addressee_id = (select auth.uid())))
);

drop policy if exists "resenhas readable by members" on public.resenhas;
create policy "resenhas readable by members" on public.resenhas
for select to authenticated using (true);

drop policy if exists "resenhas created by owner" on public.resenhas;
create policy "resenhas created by owner" on public.resenhas
for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "resenhas manageable by owner" on public.resenhas;
create policy "resenhas manageable by owner" on public.resenhas
for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "attendance readable by members" on public.attendance;
create policy "attendance readable by members" on public.attendance
for select to authenticated using (true);

drop policy if exists "attendance entered for self" on public.attendance;
create policy "attendance entered for self" on public.attendance
for insert to authenticated with check (user_id = (select auth.uid()) and attended = false);

drop policy if exists "attendance updated by self" on public.attendance;
create policy "attendance updated by self" on public.attendance
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "notifications readable by recipient" on public.notifications;
create policy "notifications readable by recipient" on public.notifications
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "notifications marked read by recipient" on public.notifications;
create policy "notifications marked read by recipient" on public.notifications
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications'
    ) then
        execute 'alter publication supabase_realtime add table public.notifications';
    end if;
end;
$$;
