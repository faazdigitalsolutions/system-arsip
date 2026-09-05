"use client";

import { useState } from "react";
import { Archive, LogIn, ShieldCheck, User as UserIcon, X } from "lucide-react";
import { MOCK_USERS } from "@/lib/users";
import { login, type AuthSession } from "@/lib/auth";

export function LoginView({ onLogin }: { onLogin: (s: AuthSession) => void }) {
  const [selectedId, setSelectedId] = useState<string>(MOCK_USERS[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const u = MOCK_USERS.find((m) => m.id === selectedId);
    if (!u) {
      setErr("Pengguna tidak ditemukan.");
      return;
    }
    if (!u.active) {
      setErr("Akun ini non-aktif. Hubungi Admin.");
      return;
    }
    // Demo: cukup ketik "demo" untuk lanjut, atau kosongkan = bypass.
    if (password && password !== "demo") {
      setErr("Password salah. (Demo: ketik \"demo\")");
      return;
    }
    const session = login(selectedId);
    if (!session) {
      setErr("Login gagal.");
      return;
    }
    onLogin(session);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 items-center justify-center shadow-lg mb-3">
            <Archive className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">SYTEM ARSIP</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Masuk untuk mengelola arsip dokumen Anda.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Pilih Pengguna
            </label>
            <div className="space-y-2">
              {MOCK_USERS.map((u) => {
                const active = selectedId === u.id;
                return (
                  <button
                    type="button"
                    key={u.id}
                    disabled={!u.active}
                    onClick={() => setSelectedId(u.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition ${
                      active
                        ? "border-violet-400 bg-violet-50 dark:bg-violet-900/20"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                    } ${!u.active ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        u.role === "Admin"
                          ? "bg-violet-100 text-violet-700"
                          : u.role === "Staff"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {u.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {u.email} · {u.role}
                      </p>
                    </div>
                    {active && (
                      <ShieldCheck className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    )}
                    {!u.active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Non-aktif
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Password (Demo: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">demo</code>)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="demo"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </div>

          {err && (
            <div className="flex items-center gap-2 text-sm text-rose-600 font-medium">
              <X className="w-4 h-4" />
              {err}
            </div>
          )}

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:from-violet-700 hover:to-indigo-700 shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            Masuk
          </button>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Mode demo · sesi tersimpan di localStorage · tidak butuh Supabase Auth.
          </p>
        </form>
      </div>
    </div>
  );
}