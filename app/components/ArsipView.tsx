"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Archive,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileText,
  Filter as FilterIcon,
  HardDrive,
  Key,
  Layers,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";
import type { Archive as ArchiveRow, Category, SortKey, Status } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { recordActivity } from "@/lib/activity";

const SORTS = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "title_asc", label: "Judul A-Z" },
  { value: "title_desc", label: "Judul Z-A" },
] as const;

const STATUSES: Status[] = ["Draft", "Disetujui", "Ditolak", "Diproses"];

const CATEGORY_STYLES: Record<Category, { bg: string; text: string; ring: string }> = {
  "Surat Masuk": { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200" },
  "Surat Keluar": { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200" },
  "Keuangan": { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  "Lainnya": { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
};

const STATUS_STYLES: Record<Status, { bg: string; text: string; ring: string }> = {
  "Draft": { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" },
  "Disetujui": { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  "Ditolak": { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" },
  "Diproses": { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
};

function formatBytes(bytes?: number | null) {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

function isPdf(mime?: string | null, name?: string | null) {
  if (mime?.toLowerCase().includes("pdf")) return true;
  if (name?.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_");
}

function escapeCsv(v: string) {
  const s = (v ?? "").replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export interface ArsipViewProps {
  archives: ArchiveRow[];
  loading: boolean;
  onChange: () => void;
  onSoftDelete: (a: ArchiveRow) => Promise<void>;
  onPermanentDelete: (a: ArchiveRow) => Promise<void>;
  onRestore: (a: ArchiveRow) => Promise<void>;
  onUpdate?: (a: ArchiveRow, patch: Partial<ArchiveRow>) => Promise<void>;
  companyName?: string;
}

function sanitizeForFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function ArsipView({
  archives,
  loading,
  onChange,
  onSoftDelete,
  onUpdate,
  companyName = "arsip",
}: ArsipViewProps) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<"Semua" | Category>("Semua");
  const [filterStatus, setFilterStatus] = useState<"Semua" | Status>("Semua");
  const [sort, setSort] = useState<SortKey>("newest");
  const [showAdv, setShowAdv] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [openUpload, setOpenUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<ArchiveRow | null>(null);
  const [previewItem, setPreviewItem] = useState<ArchiveRow | null>(null);
  const [editItem, setEditItem] = useState<ArchiveRow | null>(null);
  const [shareItem, setShareItem] = useState<ArchiveRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = archives.filter((a) => {
      if (a.deleted_at) return false;
      const matchCat = filterCat === "Semua" || a.category === filterCat;
      if (!matchCat) return false;
      const matchStatus = filterStatus === "Semua" || a.status === filterStatus;
      if (!matchStatus) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.document_number.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        (a.file_name ?? "").toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "title_asc":
          return a.title.localeCompare(b.title);
        case "title_desc":
          return b.title.localeCompare(a.title);
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [archives, search, filterCat, filterStatus, sort]);

  const stats = useMemo(() => {
    const active = archives.filter((a) => !a.deleted_at);
    const totalSize = active.reduce((acc, a) => acc + (a.file_size ?? 0), 0);
    const now = new Date();
    const thisMonth = active.filter((a) => {
      const d = new Date(a.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const cats = new Set(active.map((a) => a.category));
    return {
      total: active.length,
      size: totalSize,
      month: thisMonth,
      categories: cats.size,
    };
  }, [archives]);

  function exportCsv() {
    const header = [
      "Judul",
      "Nomor Arsip",
      "Kategori",
      "Status",
      "Retensi",
      "Ukuran",
      "Tanggal Upload",
      "Pengunggah",
      "URL",
    ];
    const rows = filtered.map((a) => [
      a.title,
      a.document_number,
      a.category,
      a.status,
      a.retention ?? "",
      formatBytes(a.file_size ?? null),
      formatDate(a.created_at),
      a.uploader ?? "",
      a.file_url,
    ]);
    const csv =
      [header, ...rows]
        .map((r) => r.map((v) => escapeCsv(String(v))).join(","))
        .join("\n") + "\n";
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `arsip-${sanitizeForFilename(companyName)}-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    const header = [
      "Judul",
      "Nomor Arsip",
      "Kategori",
      "Status",
      "Retensi",
      "Ukuran",
      "Tanggal Upload",
      "Pengunggah",
      "URL",
    ];
    const rows = filtered.map((a) => [
      a.title,
      a.document_number,
      a.category,
      a.status,
      a.retention ?? "",
      formatBytes(a.file_size ?? null),
      formatDate(a.created_at),
      a.uploader ?? "",
      a.file_url,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Arsip");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([new Uint8Array(wbout)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `arsip-${sanitizeForFilename(companyName)}-${Date.now()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const allChecked = filtered.length > 0 && filtered.every((a) => selected[a.id]);
  const someChecked = selectedCount > 0 && !allChecked;

  function toggleAll() {
    if (allChecked) setSelected({});
    else {
      const next: Record<string, boolean> = {};
      filtered.forEach((a) => (next[a.id] = true));
      setSelected(next);
    }
  }

  async function handleDelete(item: ArchiveRow) {
    if (!window.confirm(`Hapus dokumen "${item.title}"?`)) return;
    setDeletingId(item.id);
    try {
      await onSoftDelete(item);
    } catch (err: any) {
      console.error("Delete gagal:", err);
      window.alert(`Gagal menghapus: ${err?.message || "unknown error"}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    const items = filtered.filter((a) => selected[a.id]);
    if (items.length === 0) return;
    if (
      !window.confirm(
        `Hapus ${items.length} dokumen yang dipilih?\nSemua dokumen akan dipindahkan ke Sampah.`
      )
    )
      return;
    setDeletingId("__bulk__");
    try {
      for (const item of items) {
        try {
          await onSoftDelete(item);
        } catch (err: any) {
          console.error(`Delete gagal untuk ${item.id}:`, err);
        }
      }
      setSelected({});
      onChange();
    } finally {
      setDeletingId(null);
    }
  }

  const [bulkStatus, setBulkStatus] = useState<Status>("Draft");

  async function handleBulkStatus() {
    const items = filtered.filter((a) => selected[a.id]);
    if (items.length === 0) return;
    if (!window.confirm(`Ubah status ${items.length} dokumen yang dipilih ke "${bulkStatus}"?`))
      return;
    setDeletingId("__status__");
    try {
      for (const item of items) {
        try {
          if (onUpdate) await onUpdate(item, { status: bulkStatus });
        } catch (err: any) {
          console.error(`Update status gagal untuk ${item.id}:`, err);
        }
      }
      setSelected({});
      onChange();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">
            Daftar Arsip
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {filtered.length} dokumen ditampilkan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 no-print"
          >
            <Download className="w-4 h-4" />
            Ekspor Excel
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 no-print"
          >
            <Download className="w-4 h-4" />
            Ekspor CSV
          </button>
          <button
            onClick={exportPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 no-print"
          >
            <Printer className="w-4 h-4" />
            Cetak / PDF
          </button>
             <button
               onClick={() => setOpenUpload(true)}
               className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:from-violet-700 hover:to-indigo-700 shadow-sm no-print"
          >
            <Plus className="w-4 h-4" />
            Unggah Arsip Baru
          </button>
        </div>
      </div>

      {/* STATS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Arsip" value={stats.total.toLocaleString("id-ID")} sub="dokumen tersimpan" icon={<Archive className="w-5 h-5" />} iconClass="from-violet-600 to-indigo-600" />
        <StatCard label="Penyimpanan Terpakai" value={formatBytes(stats.size)} sub="total ukuran file" icon={<HardDrive className="w-5 h-5" />} iconClass="from-sky-500 to-cyan-500" />
        <StatCard label="Arsip Bulan Ini" value={stats.month.toLocaleString("id-ID")} sub="unggahan terbaru" icon={<Calendar className="w-5 h-5" />} iconClass="from-emerald-500 to-teal-500" />
        <StatCard label="Total Kategori" value={stats.categories.toLocaleString("id-ID")} sub="kategori terpakai" icon={<Layers className="w-5 h-5" />} iconClass="from-amber-500 to-orange-500" />
      </section>

      {/* FILTER */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col lg:flex-row gap-3 lg:items-center no-print">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul, nama file, atau deskripsi..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value as "Semua" | Category)}
              className="appearance-none pl-3 pr-9 py-2.5 text-sm rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            >
              <option value="Semua">Semua Kategori</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as "Semua" | Status)}
              className="appearance-none pl-3 pr-9 py-2.5 text-sm rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            >
              <option value="Semua">Semua Status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none pl-3 pr-9 py-2.5 text-sm rounded-lg border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={() => setShowAdv((s) => !s)}
            className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Lanjutan
          </button>
        </div>
      </section>

      {showAdv && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <FilterIcon className="w-4 h-4" />
          Filter lanjutan akan tersedia di pembaruan berikutnya.
        </section>
      )}

      {/* TABLE */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {selectedCount > 0 && (
          <div className="px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-900/40 text-sm text-violet-700 dark:text-violet-200 flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4" />
            {selectedCount} dokumen dipilih
            <button
              onClick={handleBulkDelete}
              disabled={deletingId === "__bulk__"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60"
            >
              {deletingId === "__bulk__" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Hapus Terpilih
             </button>
             <div className="inline-flex items-center gap-2">
               <select
                 value={bulkStatus}
                 onChange={(e) => setBulkStatus(e.target.value as Status)}
                 className="text-xs rounded border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
               >
                 {STATUSES.map((s) => (
                   <option key={s} value={s}>{s}</option>
                 ))}
               </select>
               <button
                 onClick={handleBulkStatus}
                 disabled={deletingId === "__status__"}
                 className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-60"
               >
                 {deletingId === "__status__" ? (
                   <Loader2 className="w-3 h-3.5 animate-spin" />
                 ) : (
                   <Save className="w-3.5 h-3.5" />
                 )}
                 Terapkan
               </button>
             </div>
              <button
                onClick={() => {
                  const items = filtered.filter((a) => selected[a.id]);
                  if (items.length === 0) return;
                  const header = ["Judul", "Nomor Arsip", "Kategori", "Status", "Retensi", "Tanggal Upload", "Pengunggah", "URL"];
                const rows = items.map((a) => [
                  a.title,
                  a.document_number,
                  a.category,
                  a.status,
                  a.retention ?? "",
                  formatDate(a.created_at),
                  a.uploader ?? "",
                  a.file_url,
                ]);
                const csv = [header, ...rows].map((r) => r.map((v) => escapeCsv(String(v))).join(",")).join("\n") + "\n";
                const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `arsip-terpilih-${Date.now()}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="w-3.5 h-3.5" />
              Ekspor Terpilih
            </button>
            <button className="ml-auto text-xs underline" onClick={() => setSelected({})}>
              Bersihkan
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Memuat data arsip...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Archive className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm">
              {archives.length === 0
                ? "Belum ada dokumen. Klik tombol Unggah Arsip Baru."
                : "Tidak ada dokumen yang cocok dengan filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={toggleAll}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                  </th>
                  <th className="text-left font-medium px-4 py-3">Nama Dokumen</th>
                  <th className="text-left font-medium px-4 py-3">Kategori</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Retensi</th>
                  <th className="text-left font-medium px-4 py-3">Ukuran</th>
                  <th className="text-left font-medium px-4 py-3">Tanggal Diunggah</th>
                  <th className="text-left font-medium px-4 py-3">Pengunggah</th>
                  <th className="text-right font-medium px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((a) => {
                  const cat = CATEGORY_STYLES[a.category];
                  const stt = STATUS_STYLES[a.status];
                  const pdf = isPdf(a.mime_type, a.file_name);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={!!selected[a.id]}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [a.id]: e.target.checked }))
                          }
                          className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              pdf ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                            }`}
                          >
                            {pdf ? <FileText className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-xs">
                              {a.title}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                              {a.document_number}
                            </p>
                            {a.description && (
                              <p className="text-xs text-slate-500 mt-1 line-clamp-1 max-w-xs">
                                {a.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${cat.bg} ${cat.text} ${cat.ring}`}
                        >
                          {a.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${stt.bg} ${stt.text} ${stt.ring}`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          {a.retention || "Aktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                        {formatBytes(a.file_size ?? null)}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(a.created_at)}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                        {a.uploader || "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditItem(a)}
                            title="Edit Arsip"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => setDetailItem(a)}
                            title="Detail Keseluruhan"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Detail
                          </button>
                          <button
                            onClick={() => setPreviewItem(a)}
                            title="Lihat Tanpa Download"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                          </button>
                          <a
                            href={a.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={a.file_name || undefined}
                            title="Unduh / Buka di tab baru"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Unduh
                          </a>
                          <button
                            onClick={() => handleDelete(a)}
                            disabled={deletingId === a.id}
                            title="Hapus"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60"
                          >
                            {deletingId === a.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Hapus
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

       {openUpload && (
         <UploadModal
           archives={archives.filter((a) => !a.deleted_at)}
           onClose={() => setOpenUpload(false)}
           onUploaded={onChange}
         />
       )}

      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onShare={(it) => {
            setDetailItem(null);
            setShareItem(it);
          }}
        />
      )}

      {previewItem && (
        <PreviewDrawer
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onShare={(it) => {
            setPreviewItem(null);
            setShareItem(it);
          }}
        />
      )}

       {editItem && (
         <EditModal
           item={editItem}
           archives={archives.filter((a) => !a.deleted_at)}
           onClose={() => setEditItem(null)}
           onSaved={() => {
             setEditItem(null);
             onChange();
           }}
           onSave={async (patch) => {
             if (onUpdate) await onUpdate(editItem, patch);
             else {
               await supabase.from("archives").update(patch).eq("id", editItem.id);
               onChange();
             }
           }}
         />
       )}

      {shareItem && (
        <ShareModal item={shareItem} onClose={() => setShareItem(null)} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  iconClass,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
          {label}
        </p>
        <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>
      </div>
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${iconClass} text-white flex items-center justify-center shadow-sm`}>
        {icon}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
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

function formatBytesModal(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function UploadModal({
  archives,
  onClose,
  onUploaded,
}: {
  archives: ArchiveRow[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [uTitle, setUTitle] = useState("");
  const [uNumber, setUNumber] = useState("");
  const [uDesc, setUDesc] = useState("");
  const [uCategory, setUCategory] = useState<Category>("Surat Masuk");
  const [uStatus, setUStatus] = useState<Status>("Draft");
  const [uRetention, setURetention] = useState("Aktif");
  const [uUploader, setUUploader] = useState("");
  const [uFile, setUFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uError, setUError] = useState<string | null>(null);

  function reset() {
    setUTitle("");
    setUNumber("");
    setUDesc("");
    setUCategory("Surat Masuk");
    setUStatus("Draft");
    setURetention("Aktif");
    setUUploader("");
    setUFile(null);
    setUError(null);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setUError(null);
    if (!uTitle.trim() || !uNumber.trim())
      return setUError("Judul dan Nomor Arsip wajib diisi.");
    if (!uFile) return setUError("Silakan pilih file terlebih dahulu.");

    const dup = archives.find(
      (a) => a.document_number.trim().toLowerCase() === uNumber.trim().toLowerCase()
    );
    if (dup) {
      if (
        !window.confirm(
          `Nomor arsip "${uNumber}" sudah dipakai oleh dokumen "${dup.title}".\nLanjutkan upload?`
        )
      )
        return;
    }

    const MAX_BYTES = 10 * 1024 * 1024;
    if (uFile.size > MAX_BYTES)
      return setUError(`Ukuran file melebihi batas (maks ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB).`);

    setUploading(true);
    try {
      const ext = uFile.name.includes(".") ? uFile.name.split(".").pop() : "";
      const safe = sanitizeFileName(uFile.name.replace(/\.[^.]+$/, "")) || "file";
      const path = `${uCategory.replace(/[^a-zA-Z0-9]/g, "_")}/${Date.now()}_${safe}${ext ? "." + ext : ""}`;

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, uFile, { upsert: false, contentType: uFile.type || "application/octet-stream" });
      if (upErr) throw new Error(`Upload storage gagal: ${upErr.message}`);

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      if (!pub?.publicUrl) throw new Error("Gagal mendapatkan URL publik file.");

      const baseRow: Record<string, any> = {
          title: uTitle.trim(),
          document_number: uNumber.trim(),
          description: uDesc.trim() || "",
          category: uCategory || "Surat Masuk",
          status: uStatus || "Draft",
          retention: uRetention.trim() || "Aktif",
          file_url: pub.publicUrl,
          file_path: path,
          file_size: Number(uFile.size) || 0,
        };

      const candidateCols: Record<string, any> = {
          uploader: uUploader.trim() || "Admin",
          file_name: uFile.name,
          mime_type: uFile.type || "application/octet-stream",
        };

      const { error: probeErr } = await supabase
        .from("archives")
        .select(Object.keys(candidateCols).join(","))
        .limit(1);
      const row = { ...baseRow };
      if (!probeErr) Object.assign(row, candidateCols);

      const { data: inserted, error: insErr } = await supabase
        .from("archives")
        .insert(row)
        .select()
        .single();
      if (insErr) throw new Error(`Simpan database gagal: ${insErr.message}`);

      try {
        await recordActivity({
          action: "Mengunggah Arsip",
          user_name: uUploader.trim() || "Admin",
          document_title: uTitle.trim(),
          details: `Mengunggah dokumen ${uTitle.trim()} (${uNumber.trim()})`,
          archive_id: inserted.id,
        });
      } catch (actErr) {
        console.warn("Activity log gagal:", actErr);
      }

      reset();
      onClose();
      onUploaded();
    } catch (err: any) {
      const errorMsg = err?.message || "Terjadi kesalahan saat mengunggah.";
      setUError(errorMsg);
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Unggah Arsip Baru</h2>
          </div>
          <button
            onClick={() => {
              onClose();
              reset();
            }}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleUpload} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
          <Field label="Judul Dokumen" required>
            <input
              value={uTitle}
              onChange={(e) => setUTitle(e.target.value)}
              placeholder="Contoh: Kontrak Kerjasama Vendor"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Nomor Arsip" required>
            <input
              value={uNumber}
              onChange={(e) => setUNumber(e.target.value)}
              placeholder="ARSIP-DOKUMEN-SM-2026-0001"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Kategori">
            <select
              value={uCategory}
              onChange={(e) => setUCategory(e.target.value as Category)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={uStatus}
              onChange={(e) => setUStatus(e.target.value as Status)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            >
              <option>Draft</option>
              <option>Disetujui</option>
              <option>Ditolak</option>
              <option>Diproses</option>
            </select>
          </Field>
          <Field label="Retensi">
            <input
              value={uRetention}
              onChange={(e) => setURetention(e.target.value)}
              placeholder="Aktif"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Pengunggah">
            <input
              value={uUploader}
              onChange={(e) => setUUploader(e.target.value)}
              placeholder="Nama pengunggah"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Deskripsi" className="md:col-span-2">
            <textarea
              rows={2}
              value={uDesc}
              onChange={(e) => setUDesc(e.target.value)}
              placeholder="Deskripsi singkat dokumen (opsional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="File Dokumen (Semua Format)" required className="md:col-span-2">
            <div
              className={`relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-xl transition-colors ${
                isDragging
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                  : "border-slate-300 hover:border-violet-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  setUFile(e.dataTransfer.files[0]);
                }
              }}
            >
              <input
                type="file"
                accept="*/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={(e) => setUFile(e.target.files?.[0] || null)}
                title=""
              />
              
              {!uFile ? (
                <div className="flex flex-col items-center text-center pointer-events-none">
                  <div className="w-14 h-14 mb-4 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-violet-600 dark:text-violet-400" />
                  </div>
                  <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Tarik & lepas file di sini
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    atau klik untuk memilih &middot; PDF, DOCX, XLSX, PNG, JPG, ZIP &middot; maks 10 MB
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full max-w-md p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg z-20 relative shadow-sm">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {uFile.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatBytesModal(uFile.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setUFile(null);
                    }}
                    className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </Field>

          {uError && (
            <div className="md:col-span-2 text-sm text-rose-600 font-medium">{uError}</div>
          )}

          <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                onClose();
                reset();
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mengunggah...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Simpan Arsip
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailModal({ item, onClose, onShare }: { item: ArchiveRow; onClose: () => void; onShare?: (a: ArchiveRow) => void }) {
  const rows: { label: string; value: string }[] = [
    { label: "Judul Dokumen", value: item.title },
    { label: "Nomor Arsip", value: item.document_number },
    { label: "Kategori", value: item.category },
    { label: "Status", value: item.status },
    { label: "Retensi", value: item.retention || "Aktif" },
    { label: "Deskripsi", value: item.description || "—" },
    { label: "Nama File Asli", value: item.file_name || "—" },
    { label: "Ukuran File", value: formatBytes(item.file_size ?? null) },
    { label: "Tipe File", value: item.mime_type || "—" },
    { label: "Tanggal Upload", value: formatDate(item.created_at) },
    { label: "Pengunggah", value: item.uploader || "—" },
    { label: "Diperbarui", value: item.updated_at ? formatDate(item.updated_at) : "—" },
    { label: "Path Penyimpanan", value: item.file_path || "—" },
    { label: "URL Publik", value: item.file_url },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <ExternalLink className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Detail Keseluruhan</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                {item.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {rows.map((r) => (
              <div key={r.label} className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0">
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {r.label}
                </dt>
                <dd className="sm:col-span-2 text-sm text-slate-900 dark:text-slate-100 break-words mt-1 sm:mt-0">
                  {r.label === "URL Publik" || r.label === "Path Penyimpanan" ? (
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded break-all">
                      {r.value}
                    </code>
                  ) : (
                    r.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={() => onShare?.(item)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-100"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
          <div className="flex items-center gap-2">
            <a
              href={item.file_url}
              target="_blank"
              rel="noopener noreferrer"
              download={item.file_name || undefined}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:from-violet-700 hover:to-indigo-700"
            >
              <Download className="w-4 h-4" />
              Unduh File
            </a>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isImageExt(name?: string | null) {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function isOfficeDoc(name?: string | null, mime?: string | null) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.includes("word") || m.includes("excel") || m.includes("presentation") || m.includes("officedocument")) return true;
  return /\.(docx?|xlsx?|xlsb?|pptx?|csv|ods|odt|odp)$/i.test(n);
}

function isSpreadsheet(name?: string | null, mime?: string | null) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.includes("excel") || m.includes("spreadsheet")) return true;
  if (m === "text/csv" || m.includes("csv")) return true;
  return /\.(xlsx?|xlsb?|csv|ods)$/i.test(n);
}

function isWordDoc(name?: string | null, mime?: string | null) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.includes("word") || m.includes("officedocument.word")) return true;
  return /\.(docx?|odt)$/i.test(n);
}

type SheetData = { name: string; rows: (string | number | null)[][] };

async function loadSpreadsheet(url: string): Promise<SheetData[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengambil file (${res.status})`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    });
    return { name, rows: rows.map((r) => r.map((c) => (c == null ? null : (c as string | number)))) };
  });
}

function SpreadsheetViewer({ item }: { item: ArchiveRow }) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSheets(null);
    setActive(0);
    loadSpreadsheet(item.file_url)
      .then((data) => {
        if (!cancelled) setSheets(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Gagal memuat spreadsheet");
      });
    return () => {
      cancelled = true;
    };
  }, [item.file_url]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <p className="text-sm text-rose-600 font-medium">{error}</p>
      </div>
    );
  }

  if (!sheets) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Membaca spreadsheet...
      </div>
    );
  }

  const current = sheets[active] ?? sheets[0];

  return (
    <div className="flex flex-col h-full">
      {sheets.length > 1 && (
        <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-1">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActive(i)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                i === active
                  ? "bg-violet-600 text-white"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-950">
        {current.rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            Sheet kosong.
          </div>
        ) : (
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 w-12 text-center font-medium">
                  #
                </th>
                {current.rows[0]?.map((_, c) => (
                  <th
                    key={c}
                    className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    {XLSX.utils.encode_col(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.rows.map((row, r) => (
                <tr key={r} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10">
                  <td className="px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-center text-slate-400 bg-slate-50 dark:bg-slate-900 font-mono">
                    {r + 1}
                  </td>
                  {current.rows[0]?.map((_, c) => {
                    const v = row[c];
                    const isNum = typeof v === "number";
                    return (
                      <td
                        key={c}
                        className={`px-3 py-1.5 border border-slate-200 dark:border-slate-700 align-top whitespace-nowrap ${
                          r === 0
                            ? "bg-slate-50 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100"
                            : "text-slate-700 dark:text-slate-200"
                        } ${isNum ? "text-right font-mono" : ""}`}
                      >
                        {v == null || v === "" ? <span className="text-slate-300">—</span> : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <span>
          Sheet {active + 1}/{sheets.length} · {current.rows.length} baris · {current.rows[0]?.length ?? 0} kolom
        </span>
        <span className="font-mono">{item.file_name}</span>
      </div>
    </div>
  );
}

function PreviewDrawer({ item, onClose, onShare }: { item: ArchiveRow; onClose: () => void; onShare?: (a: ArchiveRow) => void }) {
  const pdf = isPdf(item.mime_type, item.file_name);
  const image = isImageExt(item.file_name) || (item.mime_type?.toLowerCase().startsWith("image/") ?? false);
  const spreadsheet = !pdf && isSpreadsheet(item.file_name, item.mime_type);
  const word = !pdf && !spreadsheet && isWordDoc(item.file_name, item.mime_type);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <button
        aria-label="Tutup preview"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center flex-shrink-0">
              <Eye className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900 dark:text-white truncate">
                Preview Arsip
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {item.file_name || item.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
          {pdf ? (
            <iframe
              src={item.file_url}
              title={item.title}
              className="w-full h-full min-h-[60vh]"
            />
          ) : image ? (
            <div className="flex items-center justify-center p-4 min-h-[60vh]">
              <img
                src={item.file_url}
                alt={item.title}
                className="max-w-full max-h-[80vh] rounded-lg shadow-sm object-contain"
              />
            </div>
          ) : spreadsheet ? (
            <SpreadsheetViewer item={item} />
          ) : word ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <div className="w-16 h-16 mb-4 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <FileText className="w-8 h-8 text-sky-600" />
              </div>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
                Dokumen Word
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
                Untuk melihat isi dokumen .docx, silakan unduh file. Pratinjau daring khusus Word belum diaktifkan.
              </p>
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                download={item.file_name || undefined}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:from-violet-700 hover:to-indigo-700"
              >
                <Download className="w-4 h-4" />
                Unduh File
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <div className="w-16 h-16 mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <FileIcon className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
                Format file ini belum didukung untuk pratinjau langsung.
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
                Tipe <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">{item.mime_type || "tidak diketahui"}</code> tidak dapat ditampilkan di browser. Silakan unduh untuk melihat isinya.
              </p>
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                download={item.file_name || undefined}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:from-violet-700 hover:to-indigo-700"
              >
                <Download className="w-4 h-4" />
                Unduh File
              </a>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">{item.file_path}</span>
          <div className="flex items-center gap-3 flex-shrink-0">
            {onShare && (
              <button
                onClick={() => onShare(item)}
                className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-800 font-medium"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            )}
            <span>{formatBytes(item.file_size ?? null)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditModal({
  item,
  archives,
  onClose,
  onSaved,
  onSave,
}: {
  item: ArchiveRow;
  archives: ArchiveRow[];
  onClose: () => void;
  onSaved: () => void;
  onSave: (patch: Partial<ArchiveRow>) => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title);
  const [number, setNumber] = useState(item.document_number);
  const [desc, setDesc] = useState(item.description ?? "");
  const [category, setCategory] = useState<Category>(item.category);
  const [status, setStatus] = useState<Status>(item.status);
  const [retention, setRetention] = useState(item.retention ?? "Aktif");
  const [uploader, setUploader] = useState(item.uploader ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim() || !number.trim()) {
      setErr("Judul dan Nomor Arsip wajib diisi.");
      return;
    }
    const dup = archives.find(
      (a) =>
        a.id !== item.id &&
        a.document_number.trim().toLowerCase() === number.trim().toLowerCase()
    );
    if (dup) {
      if (
        !window.confirm(
          `Nomor arsip "${number}" sudah dipakai oleh dokumen "${dup.title}".\nLanjutkan?`
        )
      )
        return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        document_number: number.trim(),
        description: desc.trim(),
        category,
        status,
        retention: retention.trim() || "Aktif",
        uploader: uploader.trim() || null,
      });
      try {
        await recordActivity({
          action: "Memperbarui Arsip",
          user_name: "Admin",
          document_title: title.trim(),
          details: `Memperbarui metadata arsip ${title.trim()} (${number.trim()})`,
          archive_id: item.id,
        });
      } catch {}
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Gagal menyimpan perubahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <Edit3 className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Edit Arsip</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
          <Field label="Judul Dokumen" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Nomor Arsip" required>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Kategori">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            >
              <option>Draft</option>
              <option>Disetujui</option>
              <option>Ditolak</option>
              <option>Diproses</option>
            </select>
          </Field>
          <Field label="Retensi">
            <input
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Pengunggah">
            <input
              value={uploader}
              onChange={(e) => setUploader(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>
          <Field label="Deskripsi" className="md:col-span-2">
            <textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </Field>

          {err && <div className="md:col-span-2 text-sm text-rose-600 font-medium">{err}</div>}

          <div className="md:col-span-2 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              File tidak dapat diubah. Hanya metadata yang dapat diperbarui.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Perubahan
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShareModal({ item, onClose }: { item: ArchiveRow; onClose: () => void }) {
  const [copied, setCopied] = useState<"url" | "embed" | null>(null);
  const [expiryDays, setExpiryDays] = useState<string>("");
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const publicUrl = item.file_url;
  const effectiveUrl = sharedUrl ?? publicUrl;
  const embed = `<iframe src="${effectiveUrl}" width="100%" height="600" frameborder="0"></iframe>`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${item.title}\n${item.document_number}\n${effectiveUrl}`)}`;
  const mailto = `mailto:?subject=${encodeURIComponent(`Arsip: ${item.title}`)}&body=${encodeURIComponent(`${item.document_number}\n${effectiveUrl}`)}`;

  async function generateSignedUrl() {
    if (!expiryDays) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(item.file_path, parseInt(expiryDays) * 24 * 60 * 60);
      if (error) throw error;
      setSharedUrl(data?.signedUrl ?? null);
    } catch (err: any) {
      window.alert(`Gagal buat signed URL: ${err?.message || "unknown error"}`);
    } finally {
      setGenerating(false);
    }
  }

  function resetUrl() {
    setSharedUrl(null);
    setExpiryDays("");
  }

  async function copy(text: string, key: "url" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Salin manual:", text);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Bagikan Arsip</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                {item.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Tautan Publik
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={effectiveUrl}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
              <button
                onClick={() => copy(effectiveUrl, "url")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100"
              >
                {copied === "url" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === "url" ? "Tersalin" : "Salin"}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Siapa pun dengan tautan ini dapat mengunduh file.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Kapuhsari (hari)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="365"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value.replace(/\D/g, ""))}
                placeholder="Mis. 7"
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
              <button
                onClick={generateSignedUrl}
                disabled={!expiryDays || generating}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-60 dark:hover:bg-violet-900/30"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                Buat Link Kadaluarsa
              </button>
              {sharedUrl && (
                <button
                  onClick={resetUrl}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 underline"
                >
                  Reset
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {sharedUrl
                ? `Link kadaluarsa akan valid ${expiryDays} hari.`
                : "Buat link dengan masa aktif terbatas (signed URL)."}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Kode Embed (untuk website internal)
            </label>
            <div className="flex items-start gap-2">
              <textarea
                readOnly
                rows={3}
                value={embed}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 resize-none"
              />
              <button
                onClick={() => copy(embed, "embed")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100"
              >
                {copied === "embed" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === "embed" ? "Tersalin" : "Salin"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100"
            >
              <Share2 className="w-4 h-4" />
              WhatsApp
            </a>
            <a
              href={mailto}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-100"
            >
              <Mail className="w-4 h-4" />
              Email
            </a>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-semibold mb-1">Informasi berbagi</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Tautan publik permanen (selama bucket storage tetap publik).</li>
              <li>Tidak ada masa aktif — untuk kedaluwarsa, gunakan signed URL Supabase.</li>
              <li>Pembagian lewat WhatsApp/Email hanya membuka aplikasi klien.</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}