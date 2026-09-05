-- =============================================================
-- Sistem Arsip Digital — SQL Lengkap untuk Supabase
-- Copy-paste semua lalu klik Run
-- =============================================================

-- 1. Tabel utama: archives
create table if not exists public.archives (
  id              uuid        primary key default gen_random_uuid(),
  title           text        not null,
  document_number text        not null,
  category        text        not null check (category in ('Surat Masuk','Surat Keluar','Keuangan','Lainnya')),
  status          text        not null default 'Draft' check (status in ('Draft','Disetujui','Ditolak','Diproses')),
  retention       text        default 'Aktif',
  uploader        text,
  file_url        text        not null,
  file_path       text        not null,
  file_name       text,
  file_size       bigint,
  mime_type       text,
  description     text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_archives_category  on public.archives(category);
create index if not exists idx_archives_created   on public.archives(created_at desc);
create index if not exists idx_archives_deleted   on public.archives(deleted_at);
create index if not exists idx_archives_search    on public.archives
  using gin (to_tsvector('simple',
    coalesce(title,'') || ' ' ||
    coalesce(document_number,'') ||
    coalesce(description,'') ||
    coalesce(uploader,'')
  ));

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_archives_updated on public.archives;
create trigger trg_archives_updated
  before update on public.archives
  for each row execute function public.set_updated_at();

-- 2. Tabel activity log
create table if not exists public.activity_logs (
  id              uuid        primary key default gen_random_uuid(),
  archive_id      uuid        references public.archives(id) on delete set null,
  archive_title   text,
  user_name       text        default 'Anonim',
  action          text        not null,
  details         text,
  document_title  text,
  meta            jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_logs_created on public.activity_logs(created_at desc);

-- 3. Tabel users
create table if not exists public.users (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  role       text        not null default 'Staff' check (role in ('Admin','Staff','Viewer')),
  active     boolean     default true,
  created_at timestamptz not null default now()
);

-- 4. Tabel app_settings
create table if not exists public.app_settings (
  id              text        primary key default 'default',
  company_name    text,
  archive_prefix  text,
  phone           text,
  email           text,
  website         text,
  retention_years int,
  address         text,
  logo_url        text,
  logo_path       text,
  max_upload_mb   int,
  updated_at      timestamptz default now()
);

-- Seed app_settings
insert into public.app_settings (id) values ('default') on conflict do nothing;

-- =============================================================
-- RLS — longga untuk anon + authenticated (cocok untuk demo)
-- Untuk produksi, ganti dengan policy berbasis auth.uid()
-- =============================================================

-- Hapus semua policy lama
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('archives','activity_logs','users','app_settings')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Aktifkan RLS di semua tabel
alter table public.archives      enable row level security;
alter table public.activity_logs enable row level security;
alter table public.users         enable row level security;
alter table public.app_settings  enable row level security;

-- Policy: full access untuk anon & authenticated
create policy "archives all"  on public.archives      for all to anon, authenticated using (true) with check (true);
create policy "logs all"      on public.activity_logs  for all to anon, authenticated using (true) with check (true);
create policy "users all"     on public.users         for all to anon, authenticated using (true) with check (true);
create policy "settings all"  on public.app_settings  for all to anon, authenticated using (true) with check (true);

-- =============================================================
-- STORAGE POLICIES untuk bucket 'dokumen-arsip'
-- CATATAN: bucket harus dibuat manual via Dashboard (New bucket,
-- Public, nama: dokumen-arsip)
-- =============================================================

do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "arsip read"   on storage.objects for select
  to anon, authenticated using (bucket_id = 'dokumen-arsip');

create policy "arsip insert" on storage.objects for insert
  to anon, authenticated with check (bucket_id = 'dokumen-arsip');

create policy "arsip update" on storage.objects for update
  to anon, authenticated using (bucket_id = 'dokumen-arsip')
  with check (bucket_id = 'dokumen-arsip');

create policy "arsip delete" on storage.objects for delete
  to anon, authenticated using (bucket_id = 'dokumen-arsip');

-- =============================================================
-- Selesai. Cek di Table Editor bahwa 4 tabel sudah ada:
-- archives, activity_logs, users, app_settings
-- =============================================================
