"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  Calendar,
  CheckCircle2,
  Circle,
  ChevronDown,
  Edit3,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { supabase, STORAGE_BUCKET, SUPABASE_URL } from "@/lib/supabase";
import type { AuthSession } from "@/lib/auth";
import type {
  ActivityLog,
  ActivityLogV2,
  Archive as ArchiveRow,
  Category,
  User as UserRow,
  UserRole,
} from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { fetchActivityLogs, fetchLogs, recordActivity, deleteActivityLog, clearActivityLogs } from "@/lib/activity";
import { deleteUser, fetchUsers, upsertUser } from "@/lib/users";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  fetchSettings,
  saveSettingsRemote,
  uploadLogo,
} from "@/lib/settings";

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(d)
      .replace(/\./g, "");
  } catch {
    return iso;
  }
}

// ────────────────────────────────────────────────────────────
// 1. SAMPAH
// ────────────────────────────────────────────────────────────

const TRASH_RETENTION_DAYS = 30;

function daysRemaining(deletedAt: string | null | undefined): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS;
  const deleted = new Date(deletedAt).getTime();
  const elapsedDays = (Date.now() - deleted) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsedDays));
}

export function SampahView({ archives, loading, onChange }: { archives: ArchiveRow[]; loading: boolean; onChange: () => void }) {
  const trashed = useMemo(() => archives.filter((a) => a.deleted_at), [archives]);
   const [search, setSearch] = useState("");
   const [busyId, setBusyId] = useState<string | null>(null);
   const [bulkRestoring, setBulkRestoring] = useState(false);
   const [autoPurged, setAutoPurged] = useState(0);

  useEffect(() => {
    if (loading) return;
    const expired = trashed.filter((a) => daysRemaining(a.deleted_at) <= 0);
    if (expired.length === 0) return;
    (async () => {
      let count = 0;
      for (const item of expired) {
        try {
          await supabase.storage.from(STORAGE_BUCKET).remove([item.file_path]);
          const { error } = await supabase.from("archives").delete().eq("id", item.id);
          if (!error) {
            count++;
            try {
              await recordActivity({
                action: "Hapus Permanen",
                user_name: "Sistem",
                document_title: item.title,
                details: `Auto-purge setelah ${TRASH_RETENTION_DAYS} hari di Sampah`,
                archive_id: item.id,
              });
            } catch {}
          }
        } catch (err) {
          console.warn("Auto-purge gagal untuk", item.id, err);
        }
      }
      if (count > 0) {
        setAutoPurged(count);
        onChange();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, trashed.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trashed;
    return trashed.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.document_number.toLowerCase().includes(q) ||
        (a.uploader ?? "").toLowerCase().includes(q)
    );
  }, [trashed, search]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  async function restore(item: ArchiveRow) {
    setBusyId(item.id);
    try {
      const { error } = await supabase
        .from("archives")
        .update({ deleted_at: null })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
      await recordActivity({
        action: "Memulihkan Arsip",
        user_name: "Admin",
        document_title: item.title,
        details: `Memulihkan dokumen ${item.title} dari Sampah`,
        archive_id: item.id,
      });
      onChange();
    } catch (err: any) {
      window.alert(`Gagal restore: ${err?.message || "unknown"}`);
     } finally {
       setBusyId(null);
     }
   }

   async function bulkRestore() {
     if (selectedIds.length === 0) return;
     setBulkRestoring(true);
     try {
       const { error } = await supabase
         .from("archives")
         .update({ deleted_at: null })
         .in("id", selectedIds);
       if (error) throw new Error(error.message);
       for (const id of selectedIds) {
         const item = trashed.find((t) => t.id === id);
         if (item) {
           await recordActivity({
             action: "Memulihkan Arsip",
             user_name: "Admin",
             document_title: item.title,
             details: `Bulk restore ${item.title} dari Sampah`,
             archive_id: item.id,
           });
         }
       }
       setSelected({});
       onChange();
     } catch (err: any) {
       window.alert(`Gagal bulk restore: ${err?.message || "unknown"}`);
     } finally {
       setBulkRestoring(false);
     }
   }

   async function permanentDelete(item: ArchiveRow) {
    if (!window.confirm(`Hapus permanen "${item.title}"? File di storage juga akan dihapus dan tidak bisa dikembalikan.`)) return;
    setBusyId(item.id);
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([item.file_path]);
      const { error } = await supabase.from("archives").delete().eq("id", item.id);
      if (error) throw new Error(error.message);
      await recordActivity({
        action: "Hapus Permanen",
        user_name: "Admin",
        document_title: item.title,
        details: `Hapus permanen dokumen ${item.title}`,
        archive_id: item.id,
      });
      onChange();
    } catch (err: any) {
      window.alert(`Gagal: ${err?.message || "unknown"}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">Sampah</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {trashed.length} arsip dihapus sementara · otomatis hapus permanen setelah {TRASH_RETENTION_DAYS} hari
        </p>
      </div>

      {autoPurged > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {autoPurged} dokumen dihapus otomatis (melewati {TRASH_RETENTION_DAYS} hari).
          <button className="ml-auto text-xs underline" onClick={() => setAutoPurged(0)}>
            Tutup
          </button>
        </div>
      )}

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari di sampah..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Memuat...
          </div>
         ) : filtered.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 text-slate-500">
             <Trash2 className="w-10 h-10 mb-3 text-slate-300" />
             <p className="text-sm">Sampah kosong. Tidak ada arsip yang dihapus sementara.</p>
           </div>
         ) : (
           <div className="overflow-x-auto">
             {selectedIds.length > 0 && (
               <div className="bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800 px-4 py-2 flex items-center justify-between text-sm">
                 <span className="text-violet-800 dark:text-violet-200">
                   {selectedIds.length} dokumen terpilih
                 </span>
                 <button
                   onClick={bulkRestore}
                   disabled={bulkRestoring}
                   className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60"
                 >
                   {bulkRestoring ? (
                     <Loader2 className="w-3.5 h-3.5 animate-spin" />
                   ) : (
                     <RotateCcw className="w-3.5 h-3.5" />
                   )}
                   Restore Terpilih
                 </button>
               </div>
             )}
             <table className="min-w-full text-sm">
               <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider">
                 <tr>
                   <th className="px-4 py-3 w-10">
                     <input
                       type="checkbox"
                       checked={selectedIds.length === filtered.length}
                       ref={(el) => {
                         if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < filtered.length;
                       }}
                       onChange={(e) => {
                          if (e.target.checked) {
                            const all: Record<string, boolean> = {};
                            filtered.forEach((f) => { all[f.id] = true; });
                            setSelected(all);
                         } else {
                           setSelected({});
                         }
                       }}
                       className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                     />
                   </th>
                   <th className="text-left font-medium px-4 py-3">Nama Dokumen</th>
                   <th className="text-left font-medium px-4 py-3">Kategori</th>
                   <th className="text-left font-medium px-4 py-3">Dihapus</th>
                   <th className="text-left font-medium px-4 py-3">Sisa Hari</th>
                   <th className="text-left font-medium px-4 py-3">Pengunggah</th>
                   <th className="text-right font-medium px-4 py-3">Aksi</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                 {filtered.map((a) => {
                   const remaining = daysRemaining(a.deleted_at);
                   const expiring = remaining <= 3;
                   return (
                   <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                     <td className="px-4 py-3 align-top">
                       <input
                         type="checkbox"
                         checked={!!selected[a.id]}
                         onChange={(e) =>
                           setSelected((prev) => ({ ...prev, [a.id]: e.target.checked }))
                         }
                         className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                       />
                     </td>
                     <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-xs">
                        {a.title}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500 mt-0.5">{a.document_number}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{a.category}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {a.deleted_at ? formatDate(a.deleted_at) : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${
                          expiring
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : "bg-sky-50 text-sky-700 ring-sky-200"
                        }`}
                      >
                        {remaining} hari
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.uploader || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => restore(a)}
                          disabled={busyId === a.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {busyId === a.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          Kembalikan
                        </button>
                        <button
                          onClick={() => permanentDelete(a)}
                          disabled={busyId === a.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus Permanen
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 2. LAPORAN
// ────────────────────────────────────────────────────────────

export function LaporanView({ archives }: { archives: ArchiveRow[] }) {
  const active = useMemo(() => archives.filter((a) => !a.deleted_at), [archives]);

   const perCategory = useMemo(() => {
     return CATEGORIES.map((c) => ({
       category: c,
       count: active.filter((a) => a.category === c).length,
     }));
   }, [active]);

   const fileTypeStats = useMemo(() => {
     const extMap: Record<string, { count: number; size: number }> = {};
     active.forEach((a) => {
       const fn = a.file_name ?? "";
       const idx = fn.lastIndexOf(".");
       const ext = idx > 0 ? fn.slice(idx + 1).toUpperCase() : "TANPA EKSTEN";
       if (!extMap[ext]) extMap[ext] = { count: 0, size: 0 };
       extMap[ext].count++;
       extMap[ext].size += a.file_size ?? 0;
     });
     return Object.entries(extMap)
       .map(([ext, { count, size }]) => ({ ext, count, size }))
       .sort((a, b) => b.count - a.count);
   }, [active]);

   const maxFileType = Math.max(1, ...fileTypeStats.map((f) => f.count));

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" }).format(d);
      const count = active.filter((a) => {
        const ad = new Date(a.created_at);
        return ad >= d && ad < next;
      }).length;
      months.push({ label, count });
    }
    return months;
  }, [active]);

  const totalSize = useMemo(() => active.reduce((acc, a) => acc + (a.file_size ?? 0), 0), [active]);
  const totalCount = active.length;
  const avgSize = totalCount > 0 ? totalSize / totalCount : 0;
  const maxMonth = Math.max(1, ...monthlyTrend.map((m) => m.count));
  const maxCategory = Math.max(1, ...perCategory.map((c) => c.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">Laporan</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Ringkasan analitik arsip SYTEM ARSIP
        </p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ReportCard label="Total Dokumen" value={totalCount.toLocaleString("id-ID")} sub="arsip aktif" icon={<Archive className="w-5 h-5" />} iconClass="from-violet-600 to-indigo-600" />
        <ReportCard label="Total Penyimpanan" value={formatBytes(totalSize)} sub="estimasi terpakai" icon={<BarChart3 className="w-5 h-5" />} iconClass="from-sky-500 to-cyan-500" />
        <ReportCard label="Rata-rata Ukuran" value={formatBytes(avgSize)} sub="per dokumen" icon={<FileText className="w-5 h-5" />} iconClass="from-emerald-500 to-teal-500" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-1">Dokumen per Kategori</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Distribusi arsip aktif</p>
          <div className="space-y-3">
            {perCategory.map((c) => {
              const pct = (c.count / maxCategory) * 100;
              return (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-700 dark:text-slate-200">{c.category}</span>
                    <span className="font-mono text-xs text-slate-500">{c.count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-1">Tren Upload Bulanan</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">6 bulan terakhir</p>
          <div className="flex items-end gap-3 h-40">
            {monthlyTrend.map((m) => {
              const h = (m.count / maxMonth) * 100;
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center justify-end gap-2">
                  <div className="w-full flex flex-col items-center justify-end h-full">
                    <span className="text-[10px] font-mono text-slate-500 mb-1">{m.count}</span>
                    <div
                      className="w-full bg-gradient-to-t from-violet-600 to-indigo-500 rounded-t-md min-h-[4px]"
                      style={{ height: `${Math.max(4, h)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-1">Statistik Tipe Berkas</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Distribusi per ekstensi</p>
        <FileTypeStats data={fileTypeStats} max={maxFileType} />
      </section>
    </div>
  );
}

function FileTypeStats({ data, max }: { data: { ext: string; count: number; size: number }[]; max: number }) {
  const colors = [
    "from-violet-600 to-indigo-600",
    "from-sky-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-amber-500 to-orange-500",
    "from-pink-500 to-rose-500",
    "from-purple-500 to-fuchsia-500",
  ];
  return (
    <div className="space-y-3">
      {data.length === 0 ? (
        <p className="text-xs text-slate-500">Belum ada dokumen.</p>
      ) : (
        data.map((f, i) => {
          const pct = (f.count / max) * 100;
          return (
            <div key={f.ext}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-mono text-slate-700 dark:text-slate-200">.{f.ext}</span>
                <span className="font-mono text-xs text-slate-500">{f.count} · {formatBytes(f.size)}</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ReportCard({ label, value, sub, icon, iconClass }: { label: string; value: string; sub: string; icon: ReactNode; iconClass: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{label}</p>
        <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>
      </div>
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${iconClass} text-white flex items-center justify-center shadow-sm`}>{icon}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 3. RIWAYAT
// ────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; icon: ReactNode }> = {
  upload: { label: "Mengunggah", color: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: <Plus className="w-3.5 h-3.5" /> },
  "Mengunggah Arsip": { label: "Mengunggah", color: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: <Plus className="w-3.5 h-3.5" /> },
  "Menghapus Arsip": { label: "Menghapus", color: "bg-rose-50 text-rose-700 ring-rose-200", icon: <Trash2 className="w-3.5 h-3.5" /> },
  "Memulihkan Arsip": { label: "Memulihkan", color: "bg-sky-50 text-sky-700 ring-sky-200", icon: <RotateCcw className="w-3.5 h-3.5" /> },
  "Hapus Permanen": { label: "Hapus Permanen", color: "bg-rose-50 text-rose-700 ring-rose-200", icon: <Trash2 className="w-3.5 h-3.5" /> },
  delete: { label: "Menghapus", color: "bg-rose-50 text-rose-700 ring-rose-200", icon: <Trash2 className="w-3.5 h-3.5" /> },
  restore: { label: "Memulihkan", color: "bg-sky-50 text-sky-700 ring-sky-200", icon: <RotateCcw className="w-3.5 h-3.5" /> },
  permanent_delete: { label: "Hapus Permanen", color: "bg-rose-50 text-rose-700 ring-rose-200", icon: <Trash2 className="w-3.5 h-3.5" /> },
  update: { label: "Memperbarui", color: "bg-amber-50 text-amber-700 ring-amber-200", icon: <Edit3 className="w-3.5 h-3.5" /> },
  view: { label: "Melihat", color: "bg-slate-100 text-slate-700 ring-slate-200", icon: <ExternalLink className="w-3.5 h-3.5" /> },
  download: { label: "Mengunduh", color: "bg-indigo-50 text-indigo-700 ring-indigo-200", icon: <FileText className="w-3.5 h-3.5" /> },
};

const ACTION_FILTERS = ["Mengunggah Arsip", "Menghapus Arsip", "Memulihkan Arsip", "Hapus Permanen", "Memperbarui Arsip"];

export function RiwayatView() {
  const [logs, setLogs] = useState<ActivityLogV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterAction, setFilterAction] = useState<string>("Semua");
  const [usedFallback, setUsedFallback] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  async function loadLogs() {
    setLoading(true);
    const list = await fetchActivityLogs();
    if (list.length > 0) {
      setLogs(list);
      setUsedFallback(false);
    } else {
      const { data } = await supabase
        .from("archives")
        .select("id,title,uploader,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      const fallback: ActivityLogV2[] = (data ?? []).map((a: any) => ({
        id: `fb-${a.id}`,
        action: "Mengunggah Arsip",
        user_name: a.uploader ?? "Admin",
        document_title: a.title ?? "—",
        details: `Mengunggah dokumen ${a.title ?? "—"} oleh ${a.uploader ?? "Admin"} pada ${formatDate(a.created_at)}`,
        created_at: a.created_at,
      }));
      setLogs(fallback);
      setUsedFallback(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDeleteLog(l: ActivityLogV2) {
    if (!window.confirm(`Hapus log "${l.action} - ${l.document_title ?? ""}"?`)) return;
    setDeletingId(l.id);
    try {
      if (!l.id.startsWith("fb-")) {
        try {
          await deleteActivityLog(l.id);
        } catch {
          // Tabel activity_logs mungkin belum ada; hapus secara lokal saja
        }
      }
      setLogs((prev) => prev.filter((x) => x.id !== l.id));
    } catch (err: any) {
      window.alert(err?.message || "Gagal menghapus log.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearAll() {
    if (!window.confirm("Hapus seluruh riwayat aktivitas? Tindakan ini tidak bisa dibatalkan.")) return;
    setClearingAll(true);
    try {
      if (!usedFallback) {
        try {
          await clearActivityLogs();
        } catch {
          // Tabel activity_logs mungkin belum ada; hapus secara lokal saja
        }
      }
      setLogs([]);
    } catch (err: any) {
      window.alert(err?.message || "Gagal menghapus riwayat.");
    } finally {
      setClearingAll(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      const hay = [
        l.action ?? "",
        l.user_name ?? "",
        l.document_title ?? "",
        l.details ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
      if (filterAction !== "Semua" && l.action !== filterAction) return false;
      const d = new Date(l.created_at);
      if (filterDateFrom && new Date(filterDateFrom) > d) return false;
      if (filterDateTo && new Date(filterDateTo) < d) return false;
      return true;
    });
  }, [logs, search, filterAction, filterDateFrom, filterDateTo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">Riwayat Aktivitas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Log aktivitas pengguna sistem {usedFallback && logs.length > 0 ? "(fallback dari tabel archives)" : ""}
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={clearingAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 dark:bg-rose-900/20 dark:text-rose-200 dark:hover:bg-rose-900/30"
          >
            {clearingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Hapus Semua
          </button>
        )}
      </div>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari aktivitas, user, atau dokumen..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="relative">
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="appearance-none pl-3 pr-9 py-2 text-sm rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            >
              <option value="Semua">Semua Aksi</option>
              {ACTION_FILTERS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
          <span className="text-slate-400 text-sm">—</span>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
          {(filterDateFrom || filterDateTo || filterAction !== "Semua") && (
            <button
              onClick={() => {
                setFilterDateFrom("");
                setFilterDateTo("");
                setFilterAction("Semua");
              }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
            >
              Reset filter
            </button>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Memuat riwayat...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <History className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm">Belum ada aktivitas tercatat.</p>
            <p className="text-xs text-slate-400 mt-1">Aktivitas upload/hapus akan muncul di sini.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((l) => {
              const meta = ACTION_META[l.action] ?? { label: l.action, color: "bg-slate-100 text-slate-700 ring-slate-200", icon: <Circle className="w-3.5 h-3.5" /> };
              const title = l.document_title ?? l.archive_title ?? "—";
              return (
                <li key={l.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600/10 to-indigo-600/10 flex items-center justify-center text-violet-600 flex-shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 dark:text-slate-100">
                      <span className="font-semibold">{l.user_name || "Anonim"}</span>{" "}
                      <span className="text-slate-500 dark:text-slate-400">{l.action}</span>{" "}
                      <span className="font-medium">{title}</span>
                    </p>
                    {l.details && l.details !== l.action && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {l.details}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {formatDate(l.created_at)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                  </span>
                  <button
                    onClick={() => handleDeleteLog(l)}
                    disabled={deletingId === l.id}
                    title="Hapus log ini"
                    className="ml-2 inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition flex-shrink-0"
                  >
                    {deletingId === l.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 4. PENGGUNA
// ────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<UserRole, string> = {
  Admin: "bg-violet-50 text-violet-700 ring-violet-200",
  Staff: "bg-sky-50 text-sky-700 ring-sky-200",
  Viewer: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function PenggunaView({ session }: { session: AuthSession | null }) {
  const isAdmin = session?.user?.role === "Admin";
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"Semua" | UserRole>("Semua");

  async function refresh() {
    setLoading(true);
    setUsers(await fetchUsers());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchRole = filterRole === "Semua" || u.role === filterRole;
      if (!matchRole) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, search, filterRole]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">Pengguna</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {filtered.length} anggota tim terdaftar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as "Semua" | UserRole)}
              className="appearance-none pl-3 pr-9 py-2 text-sm rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            >
              <option value="Semua">Semua Role</option>
              <option value="Admin">Admin</option>
              <option value="Staff">Staff</option>
              <option value="Viewer">Viewer</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau email..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>
          <button
            onClick={() => setOpenNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:from-violet-700 hover:to-indigo-700 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Pengguna
          </button>
        </div>
      </div>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Memuat pengguna...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Users className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm">
              {users.length === 0
                ? "Belum ada pengguna."
                : "Tidak ada pengguna yang cocok dengan filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Nama</th>
                  <th className="text-left font-medium px-4 py-3">Email</th>
                  <th className="text-left font-medium px-4 py-3">Role</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Bergabung</th>
                  <th className="text-right font-medium px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-xs font-semibold flex items-center justify-center">
                          {u.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${ROLE_STYLES[u.role]}`}>
                        {u.role === "Admin" ? <ShieldCheck className="w-3.5 h-3.5" /> : u.role === "Staff" ? <Shield className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.active ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-medium">
                          <Circle className="w-3.5 h-3.5" /> Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Hapus pengguna ${u.name}?`)) return;
                            try {
                              await deleteUser(u.id);
                              refresh();
                            } catch (err: any) {
                              window.alert(err.message);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(editing || openNew) && (
         <UserFormModal
           initial={editing}
           isAdmin={isAdmin}
           onClose={() => {
             setEditing(null);
             setOpenNew(false);
           }}
           onSaved={() => {
             setEditing(null);
             setOpenNew(false);
             refresh();
           }}
         />
      )}
    </div>
  );
}

function UserFormModal({
  initial,
  isAdmin,
  onClose,
  onSaved,
}: {
  initial: UserRow | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<UserRole>(initial?.role ?? "Staff");
  const [active, setActive] = useState(initial?.active ?? true);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !email.trim()) {
      window.alert("Nama dan email wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await upsertUser({ id: initial?.id, name: name.trim(), email: email.trim(), role, active, password: password || null });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            {initial ? "Edit Pengguna" : "Tambah Pengguna"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Nama" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
          </Field>
          <Field label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
              <option>Admin</option>
              <option>Staff</option>
              <option>Viewer</option>
            </select>
          </Field>
          {isAdmin && (
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={initial ? "Kosongkan jika tidak ingin mengganti" : "Password login"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title={showPassword ? "Sembunyikan password" : "Lihat password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
          )}
          {!isAdmin && initial && initial.password && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Password tidak dapat diubah — hubungi Admin.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
            Pengguna aktif
          </label>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
            Batal
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 5. PENGATURAN
// ────────────────────────────────────────────────────────────

export const SETTINGS_EVENT = "app_settings_changed";

function dispatchSettings(s: AppSettings) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_EVENT, { detail: s }));
  }
}

export function PengaturanView() {
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const loaded = await fetchSettings();
      setS(loaded);
      setLoaded(true);
      dispatchSettings(loaded);
      checkConnection();
    })();
  }, []);

  function patch(patch: Partial<AppSettings>) {
    setS((prev) => ({ ...prev, ...patch }));
  }

  async function checkConnection() {
    setChecking(true);
    const t0 = performance.now();
    try {
      const { error } = await supabase.from("archives").select("id").limit(1);
      const t1 = performance.now();
      setLatency(Math.round(t1 - t0));
      setConnected(!error);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }

  async function handleLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Ukuran logo maksimal 2 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setLogoError("File harus berupa gambar (PNG/JPG).");
      return;
    }
    setUploadingLogo(true);
    try {
      const { url, path } = await uploadLogo(file);
      const next = { ...s, logo_url: url, logo_path: path };
      setS(next);
      dispatchSettings(next);
    } catch (err: any) {
      setLogoError(err?.message || "Gagal mengunggah logo.");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  }

  async function removeLogo() {
    const next = { ...s, logo_url: null, logo_path: null };
    setS(next);
    dispatchSettings(next);
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await saveSettingsRemote(s);
      setS(saved);
      dispatchSettings(saved);
      setToast("Pengaturan berhasil disimpan.");
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast(err?.message || "Gagal menyimpan.");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Memuat pengaturan...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">
          Pengaturan
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Kelola profil perusahaan dan preferensi sistem arsip.
        </p>
      </div>

      {/* KARTU 1: PROFIL PERUSAHAAN */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 max-w-3xl">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">
          Profil Perusahaan
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nama Perusahaan / Instansi" required>
            <input
              value={s.company_name}
              onChange={(e) => patch({ company_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Kode Prefiks Arsip">
            <input
              value={s.archive_prefix}
              onChange={(e) => patch({ archive_prefix: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Telepon">
            <input
              value={s.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={s.email}
              onChange={(e) => patch({ email: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={s.website}
              onChange={(e) => patch({ website: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Retensi Arsip (tahun)">
            <input
              type="number"
              min={1}
              max={50}
              value={s.retention_years}
              onChange={(e) => patch({ retention_years: parseInt(e.target.value) || 1 })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Alamat" className="md:col-span-2">
            <textarea
              rows={2}
              value={s.address}
              onChange={(e) => patch({ address: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
        </div>
      </section>

      {/* KARTU 2: LOGO PERUSAHAAN */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 max-w-3xl">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">
          Logo Perusahaan
        </h2>
        <div className="flex items-center gap-5">
          <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {s.logo_url ? (
              <img
                src={s.logo_url}
                alt="Logo"
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-2xl font-bold text-slate-400">
                {s.company_name?.charAt(0) || "P"}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 cursor-pointer dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {uploadingLogo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Unggah Logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogo}
                  disabled={uploadingLogo}
                />
              </label>
              {s.logo_url && (
                <button
                  onClick={removeLogo}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              PNG/JPG, maksimal 2 MB.
            </p>
            {logoError && (
              <p className="text-xs text-rose-600 mt-1">{logoError}</p>
            )}
            {s.logo_url && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono break-all">
                {s.logo_url}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* STATUS SUPABASE (opsional, tetap ditampilkan) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Status Koneksi Supabase
          </h2>
          <button
            onClick={checkConnection}
            disabled={checking}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-800"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Tes Ulang
          </button>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
          {checking ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          ) : connected ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <X className="w-5 h-5 text-rose-600" />
          )}
          <div className="flex-1">
            <p className={`text-sm font-medium ${connected ? "text-emerald-700" : connected === false ? "text-rose-700" : "text-slate-700"}`}>
              {checking ? "Memeriksa..." : connected ? "Terhubung" : connected === false ? "Tidak terhubung" : "Belum diperiksa"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono break-all">
              {SUPABASE_URL}
            </p>
          </div>
          {latency !== null && (
            <span className="text-xs text-slate-500 whitespace-nowrap">{latency} ms</span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Untuk menyimpan pengaturan ke Supabase (sinkron antar device), jalankan SQL:
          <code className="block mt-1 p-2 bg-slate-50 dark:bg-slate-800 rounded font-mono text-[11px] break-all whitespace-pre-wrap">
{`create table if not exists public.app_settings (
  id text primary key default 'default',
  company_name text,
  archive_prefix text,
  phone text,
  email text,
  website text,
  retention_years int,
  address text,
  logo_url text,
  logo_path text,
  max_upload_mb int,
  updated_at timestamptz default now()
);
alter table public.app_settings enable row level security;
create policy "settings all" on public.app_settings for all to authenticated using (true) with check (true);`}
          </code>
        </p>
      </section>

      {/* TOMBOL SIMPAN */}
      <div className="max-w-3xl flex items-center justify-end gap-3 pb-8">
        {toast && (
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              toast.includes("Gagal") ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            {toast.includes("Gagal") ? (
              <X className="w-4 h-4" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {toast}
          </span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:from-violet-700 hover:to-indigo-700 shadow-sm disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Simpan Pengaturan
        </button>
      </div>
    </div>
  );
}

function Field({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}