// lib/auth.ts — Login sesi sederhana (localStorage)
// Karena Supabase auth dimatikan (persistSession:false), kita pakai
// daftar user mock + localStorage untuk sesi login demo.

import { MOCK_USERS } from "./users";
import type { User } from "./types";

const SESSION_KEY = "sytem-arsip:session";

export interface AuthSession {
  user: User;
  loggedInAt: string;
}

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function login(userId: string): AuthSession | null {
  const user = MOCK_USERS.find((u) => u.id === userId && u.active);
  if (!user) return null;
  const session: AuthSession = { user, loggedInAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
  return session;
}

export function logout() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function canManage(role?: string): boolean {
  return role === "Admin" || role === "Staff";
}

export function canAdmin(role?: string): boolean {
  return role === "Admin";
}