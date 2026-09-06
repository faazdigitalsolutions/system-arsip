"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

const listeners: ((toasts: Toast[]) => void)[] = [];
const STORAGE_KEY = "sytem-arsip:toasts";
let toasts: Toast[] = [];

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toasts));
  } catch {}
}

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

export function getToasts(): Toast[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Toast[];
  } catch {
    return [];
  }
}

export interface ShowToastOptions {
  duration?: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

export function showToast(
  message: string,
  type: ToastType = "info",
  opts?: number | ShowToastOptions
): string {
  let duration = 4000;
  let actionLabel: string | undefined;
  let onAction: (() => void | Promise<void>) | undefined;

  if (typeof opts === "number") {
    duration = opts;
  } else if (opts) {
    if (opts.duration !== undefined) duration = opts.duration;
    actionLabel = opts.actionLabel;
    onAction = opts.onAction;
  }

  const id = `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const toast: Toast = { id, message, type, duration, actionLabel, onAction };
  toasts = [...toasts, toast];
  persist();
  notify();

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  persist();
  notify();
}

export function clearAllToasts() {
  toasts = [];
  persist();
  notify();
}

export function useToast() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    setItems(getToasts());
    listeners.push(setItems);
    return () => {
      const idx = listeners.indexOf(setItems);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  const show = useCallback((message: string, type: ToastType = "info", opts?: number | ShowToastOptions) => {
    return showToast(message, type, opts);
  }, []);

  const dismiss = useCallback((id: string) => dismissToast(id), []);

  return { toasts: items, show, dismiss, clearAll: clearAllToasts };
}

export function ToastContainer() {
  const { toasts: items, dismiss } = useToast();

  if (items.length === 0) return null;

  const TYPE_COLORS: Record<ToastType, string> = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200",
    error: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-200",
    info: "bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200",
    warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200",
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
       {items.map((t) => (
         <div
           key={t.id}
           className={`rounded-xl border px-4 py-3 text-sm shadow-lg flex items-start gap-2.5 ${TYPE_COLORS[t.type]}`}
         >
           <div className="flex-1 min-w-0">{t.message}</div>
           {t.actionLabel && t.onAction && (
             <button
               onClick={async () => {
                 try { await t.onAction?.(); } catch {}
                 dismiss(t.id);
               }}
               className="flex-shrink-0 px-2 py-1 rounded text-xs font-medium bg-white/30 hover:bg-white/50 transition-colors"
             >
               {t.actionLabel}
             </button>
           )}
           <button
             onClick={() => dismiss(t.id)}
             className="w-5 h-5 flex-shrink-0 inline-flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
           >
             <X className="w-3.5 h-3.5" />
           </button>
         </div>
       ))}
    </div>
  );
}
