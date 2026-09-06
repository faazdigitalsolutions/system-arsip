"use client";

import { useState } from "react";
import { Archive, LogIn, ShieldCheck, User as UserIcon, X, Eye, EyeOff, UserPlus } from "lucide-react";
import { MOCK_USERS, registerUser } from "@/lib/users";
import { login, type AuthSession } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export function LoginView({ onLogin }: { onLogin: (s: AuthSession) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [selectedId, setSelectedId] = useState<string>(MOCK_USERS[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const isFirstRun = MOCK_USERS.length === 0;
  const selectedUser = MOCK_USERS.find((m) => m.id === selectedId);
  const passwordRequired = !!selectedUser?.password;

  async function submit(e: React.FormEvent) {
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
    const session = login(selectedId, passwordRequired ? password : undefined);
    if (!session) {
      setErr(passwordRequired ? "Password salah." : "Login gagal.");
      return;
    }
    onLogin(session);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setErr("Nama, email, dan password wajib diisi.");
      return;
    }
    if (regPassword !== regConfirm) {
      setErr("Konfirmasi password tidak cocok.");
      return;
    }
    try {
      const role: UserRole = isFirstRun ? "Admin" : "Staff";
      const user = await registerUser({
        name: regName.trim(),
        email: regEmail.trim(),
        role,
        password: regPassword,
      });
      const session = login(user.id, regPassword);
      if (!session) throw new Error("Gagal masuk otomatis setelah pendaftaran.");
      onLogin(session);
    } catch (e: any) {
      setErr(e?.message || "Gagal mendaftar.");
    }
  }

  if (isFirstRun || mode === "register") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 items-center justify-center shadow-lg mb-3">
              <Archive className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">SYTEM ARSIP</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {isFirstRun
                ? "Selamat datang! Daftarkan akun pertama Anda."
                : "Daftar akun pengguna baru"}
            </p>
          </div>

          <form
            onSubmit={handleRegister}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Contoh: Andi Wijaya"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="nama@perusahaan.co.id"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Buat password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Konfirmasi Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Ulangi password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />
            </div>

            {isFirstRun && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-200 p-3 rounded-lg">
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                Akun pertama ini akan otomatis menjadi <strong>Admin</strong>.
              </div>
            )}

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
              <UserPlus className="w-4 h-4" />
              {isFirstRun ? "Buat Akun Pertama" : "Daftar Akun"}
            </button>

            {!isFirstRun && (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setRegName("");
                  setRegEmail("");
                  setRegPassword("");
                  setRegConfirm("");
                  setErr(null);
                }}
                className="w-full text-center text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400"
              >
                Sudah punya akun? Masuk
              </button>
            )}
          </form>
        </div>
      </div>
    );
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
                    onClick={() => {
                      setSelectedId(u.id);
                      setPassword("");
                      setErr(null);
                    }}
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

          {passwordRequired && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
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
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Daftar Akun Tersedia
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {MOCK_USERS.filter((u) => u.active).map((u) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs transition cursor-pointer ${
                    selectedId === u.id
                      ? "border-violet-400 bg-violet-50 dark:bg-violet-900/20"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                  }`}
                  onClick={() => {
                    setSelectedId(u.id);
                    setPassword("");
                    setErr(null);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {u.name}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 truncate">
                      {u.email}
                    </p>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      u.role === "Admin"
                        ? "bg-violet-100 text-violet-700"
                        : u.role === "Staff"
                        ? "bg-sky-100 text-sky-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {u.role}
                  </span>
                  {u.password ? (
                    <ShieldCheck className="w-3 h-3 text-amber-500" aria-label="Password diatur" />
                  ) : (
                    <span className="w-3 h-3 rounded-full bg-emerald-400" aria-label="Login tanpa password" />
                  )}
                </div>
              ))}
              {MOCK_USERS.filter((u) => u.active).length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">
                  Belum ada pengguna aktif. Hubungi administrator.
                </p>
              )}
            </div>
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

          <button
            type="button"
            onClick={() => {
              setMode("register");
              setRegName("");
              setRegEmail("");
              setRegPassword("");
              setRegConfirm("");
              setErr(null);
            }}
            className="w-full text-center text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400"
          >
            Belum punya akun? Daftar
          </button>
        </form>
      </div>
    </div>
  );
}
