"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  BarChart3,
  FileText,
  HardDrive,
  History,
  Layers,
  Loader2,
  LogOut,
  Moon,
  Settings,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Archive as ArchiveRow, TabKey } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { DEFAULT_SETTINGS, fetchSettings } from "@/lib/settings";
import { recordActivity } from "@/lib/activity";
import { ArsipView } from "./components/ArsipView";
import { SampahView, LaporanView, RiwayatView, PenggunaView, PengaturanView, SETTINGS_EVENT } from "./components/OtherViews";
import { LoginView } from "./components/LoginView";
import { getSession, logout, type AuthSession } from "@/lib/auth";
import { ToastContainer, showToast } from "@/lib/toast";

const DUMMY_ARCHIVES: ArchiveRow[] = [];

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: "arsip", label: "Arsip", icon: <FileText className="w-4 h-4" /> },
  { key: "sampah", label: "Sampah", icon: <Trash2 className="w-4 h-4" /> },
  { key: "laporan", label: "Laporan", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "riwayat", label: "Riwayat", icon: <History className="w-4 h-4" /> },
  { key: "pengguna", label: "Pengguna", icon: <Users className="w-4 h-4" /> },
  { key: "pengaturan", label: "Pengaturan", icon: <Settings className="w-4 h-4" /> },
];

export default function HomePage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [tab, setTab] = useState<TabKey>("arsip");
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSession(getSession());
    if (typeof window !== "undefined") {
      setDark(window.localStorage.getItem("sytem-arsip:dark") === "1");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sytem-arsip:dark", dark ? "1" : "0");
      window.dispatchEvent(new CustomEvent("theme-changed", { detail: dark }));
    }
  }, [dark]);

  useEffect(() => {
    (async () => {
      const s = await fetchSettings();
      setSettings(s);
    })();
    const handler = (e: Event) => {
      const ce = e as CustomEvent<AppSettings>;
      if (ce.detail) setSettings(ce.detail);
    };
    window.addEventListener(SETTINGS_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_EVENT, handler);
  }, []);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    setConnError(null);
    try {
      const { data, error, status } = await supabase
        .from("archives")
        .select("*")
        .order("created_at", { ascending: false });

      // 404 / table not found / no rows → pakai dummy
      if (error) {
        const msg = (error.message || "").toLowerCase();
        const notFound =
          status === 404 ||
          msg.includes("not found") ||
          msg.includes("does not exist") ||
          msg.includes("relation") ||
          msg.includes("pgrst");

        if (notFound) {
          console.warn(
            "[Archives] Tabel 'archives' tidak ditemukan di Supabase. " +
              "Menampilkan data dummy. Jalankan supabase/schema.sql di SQL Editor."
          );
          setArchives(DUMMY_ARCHIVES);
          setUsingMock(true);
          setConnError("Tabel archives belum ada. Menampilkan data contoh.");
        } else {
          console.error("[Archives] Gagal load:", error);
          setArchives(DUMMY_ARCHIVES);
          setUsingMock(true);
          setConnError(`Gagal load data: ${error.message}`);
        }
      } else if (!data || data.length === 0) {
        // Sukses tapi tabel kosong → tetap dummy agar UI tidak crash
        console.info("[Archives] Tabel kosong, pakai data dummy.");
        setArchives(DUMMY_ARCHIVES);
        setUsingMock(false);
        setConnError(null);
      } else {
        setArchives(data as ArchiveRow[]);
        setUsingMock(false);
        setConnError(null);
      }
    } catch (err: any) {
      // network error / fetch failed
      console.error("[Archives] Network/exception:", err);
      setArchives(DUMMY_ARCHIVES);
      setUsingMock(true);
      setConnError(
        `Tidak bisa terhubung ke Supabase: ${err?.message || "network error"}.`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchArchives();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchArchives]);

  useEffect(() => {
    const TIMEOUT_MS = 30 * 60 * 1000;
    let timer: NodeJS.Timeout;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        logout();
        setSession(null);
        window.location.reload();
      }, TIMEOUT_MS);
    };
    const events: Array<"mousedown" | "keydown" | "touchstart"> = ["mousedown", "keydown", "touchstart"];
    events.forEach((e) => document.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach((e) => document.removeEventListener(e, reset));
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLSelectElement) return;
      const t = e.key.toLowerCase();
      if (t === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const evt = new MouseEvent("click", { bubbles: true });
        document.getElementById("btn-upload")?.dispatchEvent(evt);
      }
      if (t === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const el = document.getElementById("search-input") as HTMLInputElement | null;
        el?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

   async function softDelete(a: ArchiveRow) {
     const stamp = new Date().toISOString();

     const { error: updErr } = await supabase
       .from("archives")
       .update({ deleted_at: stamp })
       .eq("id", a.id);

     if (updErr) {
       const msg = (updErr.message || "").toLowerCase();
       const missingDeletedAt =
         msg.includes("deleted_at") ||
         msg.includes("column") ||
         msg.includes("schema cache") ||
         msg.includes("pgrst204");

       if (missingDeletedAt) {
         window.alert(
           `Kolom deleted_at belum ada di database.\n\n` +
           `Supaya fitur Sampah & auto-purge 30 hari bisa jalan, jalankan sekali di Supabase Dashboard:\n` +
           `SQL Editor → New query → paste isi file:\n` +
           `supabase/migration.sql → Run.\n\n` +
           `Setelah itu refresh halaman ini.`
         );
         throw new Error("Belum menjalankan migration.sql (kolom deleted_at belum ada di Supabase).");
       }

       throw new Error(updErr.message);
     }

     try {
       await recordActivity({
         action: "Menghapus Arsip",
         user_name: session?.user.name ?? "Admin",
         document_title: a.title,
         details: `Menghapus dokumen ${a.title} (masuk Sampah)`,
         archive_id: a.id,
       });
     } catch {}

     const toastId = showToast(
       `Dokumen "${a.title}" dipindahkan ke Sampah.`,
       "info",
       {
         actionLabel: "Undo",
         onAction: async () => {
           const { error: restoreErr } = await supabase
             .from("archives")
             .update({ deleted_at: null })
             .eq("id", a.id);
           if (restoreErr) {
             showToast(`Gagal memulihkan dokumen.`, "error");
           } else {
             showToast(`Dokumen "${a.title}" dipulihkan.`, "success");
             await fetchArchives();
           }
         },
         duration: 8000,
       }
     );

     setTimeout(() => {
       fetchArchives();
     }, 8500);
   }

  async function permanentDelete(a: ArchiveRow) {
    try {
      await supabase.storage.from("dokumen-arsip").remove([a.file_path]);
    } catch (e) {
      console.warn("Storage remove gagal:", e);
    }
    const { error } = await supabase.from("archives").delete().eq("id", a.id);
    if (error) throw new Error(error.message);
    try {
      await recordActivity({
        action: "Hapus Permanen",
        user_name: session?.user.name ?? "Admin",
        document_title: a.title,
        details: `Hapus permanen dokumen ${a.title}`,
        archive_id: a.id,
      });
    } catch {}
    await fetchArchives();
  }

  async function restoreArchive(a: ArchiveRow) {
    const { error } = await supabase
      .from("archives")
      .update({ deleted_at: null })
      .eq("id", a.id);
    if (error) throw new Error(error.message);
    try {
      await recordActivity({
        action: "Memulihkan Arsip",
        user_name: session?.user.name ?? "Admin",
        document_title: a.title,
        details: `Memulihkan dokumen ${a.title} dari Sampah`,
        archive_id: a.id,
      });
    } catch {}
    await fetchArchives();
  }

  async function updateArchive(a: ArchiveRow, patch: Partial<ArchiveRow>) {
    const { error } = await supabase.from("archives").update(patch).eq("id", a.id);
    if (error) throw new Error(error.message);
    try {
      await recordActivity({
        action: "Memperbarui Arsip",
        user_name: session?.user.name ?? "Admin",
        document_title: (patch.title as string) ?? a.title,
        details: `Memperbarui metadata arsip ${(patch.title as string) ?? a.title}`,
        archive_id: a.id,
      });
    } catch {}
    await fetchArchives();
  }

  if (!session) {
    return <LoginView onLogin={(s) => setSession(s)} />;
  }

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        {/* TOP NAV */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 dark:bg-slate-900/80 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {settings.logo_url ? (
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
                  <img
                    src={settings.logo_url}
                    alt="Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
                  <Archive className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">
                  {settings.company_name || "SYTEM ARSIP"}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate">
                  Sistem manajemen dokumen
                </p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1 ml-4 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                    tab === t.key
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              {loading && tab === "arsip" && (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              )}
              {session && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                    {session.user.name.charAt(0)}
                  </div>
                  <div className="leading-tight">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">
                      {session.user.name}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {session.user.role}
                    </p>
                  </div>
                </div>
              )}
              {session && (
                <button
                  onClick={() => {
                    logout();
                    setSession(null);
                  }}
                  title="Keluar"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-rose-900/20"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setDark((d) => !d)}
                className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                title="Toggle dark mode"
              >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Mobile tab bar */}
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
            <div className="flex items-center gap-1 px-2 py-2 min-w-max">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    tab === t.key
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </header>

         <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <style jsx-global>{`
              @media print {
                header { display: none !important; }
                footer { display: none !important; }
                .no-print { display: none !important; }
                .print-area { display: block !important; }
              }
            `}</style>

            <ToastContainer />
            {tab === "arsip" && (
             <div className="mb-6 no-print">
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                 {(() => {
                   const active = archives.filter((a) => !a.deleted_at);
                   const totalSize = active.reduce((acc, a) => acc + (a.file_size ?? 0), 0);
                   const now = new Date();
                   const thisMonth = active.filter((a) => {
                     const d = new Date(a.created_at);
                     return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                   }).length;
                   const cats = new Set(active.map((a) => a.category));
                   const formatBytes = (bytes?: number | null) => {
                     if (bytes == null) return "-";
                     if (bytes < 1024) return `${bytes} B`;
                     if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                     return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
                   };
                   const cards = [
                     { label: "Total Arsip", value: active.length.toLocaleString("id-ID"), sub: "dokumen tersimpan", icon: <Archive className="w-5 h-5 text-white" />, iconClass: "from-violet-600 to-indigo-600" },
                     { label: "Penyimpanan", value: formatBytes(totalSize), sub: "total ukuran file", icon: <HardDrive className="w-5 h-5 text-white" />, iconClass: "from-sky-500 to-cyan-500" },
                     { label: "Bulan Ini", value: thisMonth.toLocaleString("id-ID"), sub: "unggahan terbaru", icon: <Layers className="w-5 h-5 text-white" />, iconClass: "from-emerald-500 to-teal-500" },
                     { label: "Kategori", value: cats.size.toLocaleString("id-ID"), sub: "kategori terpakai", icon: <Archive className="w-5 h-5 text-white" />, iconClass: "from-amber-500 to-orange-500" },
                   ];
                   return cards.map((c) => (
                     <div key={c.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex items-center gap-3">
                       <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.iconClass} flex items-center justify-center flex-shrink-0`}>
                         {c.icon}
                       </div>
                       <div>
                         <p className="text-2xl font-semibold text-slate-900 dark:text-white">{c.value}</p>
                         <p className="text-xs text-slate-500 dark:text-slate-400">{c.label} · {c.sub}</p>
                       </div>
                     </div>
                   ));
                 })()}
               </div>
             </div>
           )}
           {tab === "arsip" && (
            <ArsipView
              archives={archives}
              loading={loading}
              onChange={fetchArchives}
              onSoftDelete={softDelete}
              onPermanentDelete={permanentDelete}
              onRestore={restoreArchive}
              onUpdate={updateArchive}
              companyName={settings.company_name}
            />
          )}
          {tab === "sampah" && (
            <SampahView archives={archives} loading={loading} onChange={fetchArchives} />
          )}
          {tab === "laporan" && <LaporanView archives={archives} />}
          {tab === "riwayat" && <RiwayatView />}
          {tab === "pengguna" && <PenggunaView session={session} />}
          {tab === "pengaturan" && <PengaturanView />}

          <footer className="text-center text-xs text-slate-400 py-6">
            © {new Date().getFullYear()} · SYTEM ARSIP — Sistem Manajemen Arsip Digital
          </footer>
        </main>
      </div>
    </div>
  );
}