-- =============================================================
-- SYTEM ARSIP — Cukup jalankan SATU KALI ini di Supabase
-- SQL Editor → New query → paste → Run
-- =============================================================

-- 1) Tambahkan kolom deleted_at untuk fitur Sampah & Auto-Purge
ALTER TABLE public.archives
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_archives_deleted
  ON public.archives(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 2) Pastikan kolom opsional lain ada
ALTER TABLE public.archives
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS retention   text,
  ADD COLUMN IF NOT EXISTS uploader    text,
  ADD COLUMN IF NOT EXISTS file_name   text,
  ADD COLUMN IF NOT EXISTS file_size   bigint,
  ADD COLUMN IF NOT EXISTS mime_type   text;

-- 3) Buat tabel activity_logs jika belum ada
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action          text        NOT NULL,
  user_name       text        DEFAULT 'Admin',
  document_title  text        DEFAULT '',
  details         text        DEFAULT '',
  archive_id      uuid,
  meta            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created
  ON public.activity_logs(created_at DESC);

-- 4) Aktifkan Akses RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs all" ON public.activity_logs;
CREATE POLICY "activity_logs all"
  ON public.activity_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4) Tambah kolom password ke tabel users (untuk login per-user, hanya admin yang bisa atur)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password text;

-- 6) Bucket storage (kalau belum ada)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dokumen-arsip', 'dokumen-arsip', true)
ON CONFLICT (id) DO NOTHING;

-- 6) Refresh cache skema
NOTIFY pgrst, 'reload schema';

-- Selesai. Setelah Run berhasil, refresh halaman SYTEM ARSIP.
-- =============================================================
