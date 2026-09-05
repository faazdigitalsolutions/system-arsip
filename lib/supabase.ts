import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://wghjtqirzxgyqbyetfdl.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_vrJKnXw3jUuyImVf7mL5Ug_DxR8bgvd";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

export const STORAGE_BUCKET = "dokumen-arsip";
export const SUPABASE_URL = supabaseUrl;