// lib/activity.ts — Activity log helpers (activity_logs table)
import { supabase } from "./supabase";
import type { ActivityAction, ActivityLogV2 } from "./types";

export interface RecordActivityInput {
  action: ActivityAction | string;
  user_name?: string | null;
  document_title?: string | null;
  details?: string | null;
  archive_id?: string | null;
  meta?: Record<string, unknown> | null;
}

export async function recordActivity(input: RecordActivityInput) {
  try {
    const payload: Record<string, any> = {
      action: String(input.action),
      user_name: input.user_name ?? "Anonim",
      document_title: input.document_title ?? null,
      details: input.details ?? null,
    };

    // Probe kolom opsional (archive_id, meta) — tambahkan hanya jika ada
    try {
      const { error: probeErr } = await supabase
        .from("activity_logs")
        .select("archive_id,meta")
        .limit(1);
      if (!probeErr) {
        if (input.archive_id !== undefined) payload.archive_id = input.archive_id;
        if (input.meta !== undefined) payload.meta = input.meta;
      }
    } catch {
      // ignore — pakai payload minimal
    }

    await supabase.from("activity_logs").insert(payload);
  } catch (err) {
    console.warn("[activity] recordActivity gagal:", err);
  }
}

export async function fetchActivityLogs(limit = 200): Promise<ActivityLogV2[]> {
  try {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as ActivityLogV2[];
  } catch {
    return [];
  }
}

export async function deleteActivityLog(id: string) {
  const { error } = await supabase
    .from("activity_logs")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function clearActivityLogs() {
  const { error } = await supabase
    .from("activity_logs")
    .delete()
    .neq("id", "");
  if (error) throw new Error(error.message);
}

// Backward-compat alias (dipakai komponen lama)
export const fetchLogs = fetchActivityLogs;