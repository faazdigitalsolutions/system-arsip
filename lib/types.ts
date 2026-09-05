// lib/types.ts — TypeScript models untuk Sistem Arsip Digital

export type Category =
  | "Surat Masuk"
  | "Surat Keluar"
  | "Keuangan"
  | "Lainnya";

export const CATEGORIES: Category[] = [
  "Surat Masuk",
  "Surat Keluar",
  "Keuangan",
  "Lainnya",
];

export type Status = "Draft" | "Disetujui" | "Ditolak" | "Diproses";

export interface Archive {
  id: string;
  title: string;
  document_number: string;
  description?: string | null;
  category: Category;
  status: Status;
  retention?: string | null;
  file_url: string;
  file_path: string;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  uploader?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export type ActivityAction =
  | "upload"
  | "view"
  | "download"
  | "delete"
  | "restore"
  | "permanent_delete"
  | "update";

export interface ActivityLog {
  id: string;
  archive_id?: string | null;
  archive_title?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  action: ActivityAction;
  meta?: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityLogV2 {
  id: string;
  action: string;
  user_name?: string | null;
  document_title?: string | null;
  archive_title?: string | null;
  details?: string | null;
  created_at: string;
}

export type UserRole = "Admin" | "Staff" | "Viewer";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  password?: string | null;
}

export interface AppSettings {
  company_name: string;
  max_upload_size_mb: number;
  supabase_connected: boolean;
  supabase_url: string;
}

export interface ArchiveStats {
  total: number;
  masuk: number;
  keluar: number;
  finance: number; // Keuangan + Lainnya
  totalSize: number;
  thisMonth: number;
  categoryCount: number;
}

export type SortKey = "newest" | "oldest" | "title_asc" | "title_desc";
export type TabKey = "arsip" | "sampah" | "laporan" | "riwayat" | "pengguna" | "pengaturan";