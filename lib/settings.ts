// lib/settings.ts — App settings helpers
import { supabase } from "./supabase";
import { STORAGE_BUCKET } from "./supabase";

export interface AppSettings {
  company_name: string;
  archive_prefix: string;
  phone: string;
  email: string;
  website: string;
  retention_years: number;
  address: string;
  logo_url: string | null;
  logo_path: string | null;
  max_upload_mb: number;
  updated_at?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  company_name: "PT OHSUNG EI",
  archive_prefix: "ARSIP DOKUMEN",
  phone: "+62 21 1234 5678",
  email: "andiexim.osei@gmail.com",
  website: "https://www.perusahaan.com",
  retention_years: 5,
  address: "bekasi",
  logo_url: null,
  logo_path: null,
  max_upload_mb: 25,
};

const LS_KEY = "app_settings_v1";

export function loadSettingsLocal(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettingsLocal(s: AppSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify({ ...s, updated_at: new Date().toISOString() }));
}

export async function fetchSettings(): Promise<AppSettings> {
  // 1. coba local dulu (cepat)
  const local = loadSettingsLocal();
  try {
    // 2. coba sinkron dari Supabase kalau tabel ada
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (!error && data) {
      const merged = { ...DEFAULT_SETTINGS, ...data, ...local };
      saveSettingsLocal(merged);
      return merged;
    }
  } catch {
    // ignore
  }
  return local;
}

export async function saveSettingsRemote(s: AppSettings): Promise<AppSettings> {
  const payload = { ...s, id: "default", updated_at: new Date().toISOString() };
  try {
    const { error } = await supabase
      .from("app_settings")
      .upsert(payload, { onConflict: "id" });
    if (!error) {
      saveSettingsLocal(payload);
      return payload;
    }
  } catch {
    // tabel belum ada → fallback local
  }
  saveSettingsLocal(payload);
  return payload;
}

export async function uploadLogo(file: File): Promise<{ url: string; path: string }> {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Ukuran logo maksimal 2 MB.");
  }
  const ext = file.name.split(".").pop() ?? "png";
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `logos/${Date.now()}_${safe}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(`Upload logo gagal: ${error.message}`);

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: pub.publicUrl, path };
}