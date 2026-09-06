"use client";

import { supabase } from "./supabase";
import type { User, UserRole } from "./types";

const LS_USERS_KEY = "sytem-arsip:users";

function loadLocalUsers(): User[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_USERS_KEY);
    return raw ? (JSON.parse(raw) as User[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalUsers(users: User[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_USERS_KEY, JSON.stringify(users));
  } catch {}
}

export const MOCK_USERS: User[] = loadLocalUsers();

export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });
  if (!error && data) return data as User[];
  // Fallback: kalau tabel users belum ada, pakai mock (copy agar React detect perubahan)
  return [...MOCK_USERS];
}

export async function upsertUser(u: Partial<User> & { name: string; email: string; role: UserRole }) {
  if (u.id) {
    const { error } = await supabase
      .from("users")
      .update({ name: u.name, email: u.email, role: u.role, active: u.active ?? true, password: u.password ?? null })
      .eq("id", u.id);
    if (!error) return { ...u, id: u.id } as User;
    // Fallback: update MOCK_USERS in memory + localStorage
    const idx = MOCK_USERS.findIndex((x) => x.id === u.id);
    if (idx >= 0) {
      MOCK_USERS[idx] = {
        ...MOCK_USERS[idx],
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active ?? true,
        password: u.password ?? MOCK_USERS[idx].password,
      };
      saveLocalUsers(MOCK_USERS);
      return MOCK_USERS[idx];
    }
    return { ...u, id: u.id } as User;
  } else {
    const { data, error } = await supabase
      .from("users")
      .insert({ name: u.name, email: u.email, role: u.role, active: u.active ?? true, password: u.password ?? null })
      .select()
      .single();
    if (!error && data) return data as User;
    // Fallback: add to MOCK_USERS in memory + localStorage
    const newUser: User = {
      id: `local-${Date.now()}`,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active ?? true,
      password: u.password ?? null,
      created_at: new Date().toISOString(),
    };
    MOCK_USERS.unshift(newUser);
    saveLocalUsers(MOCK_USERS);
    return newUser;
  }
}

export async function registerUser(data: {
  name: string;
  email: string;
  role: UserRole;
  password: string;
}): Promise<User> {
  const { data: inserted, error } = await supabase
    .from("users")
    .insert({
      name: data.name,
      email: data.email,
      role: data.role,
      active: true,
      password: data.password,
    })
    .select()
    .single();

  if (!error && inserted) {
    return inserted as User;
  }

  // Fallback: add to MOCK_USERS + localStorage
  const newUser: User = {
    id: `local-${Date.now()}`,
    name: data.name,
    email: data.email,
    role: data.role,
    active: true,
    password: data.password,
    created_at: new Date().toISOString(),
  };
  MOCK_USERS.unshift(newUser);
  saveLocalUsers(MOCK_USERS);
  return newUser;
}

export async function deleteUser(id: string) {
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) {
    // Fallback: remove from MOCK_USERS in memory + localStorage
    const idx = MOCK_USERS.findIndex((x) => x.id === id);
    if (idx >= 0) MOCK_USERS.splice(idx, 1);
    saveLocalUsers(MOCK_USERS);
  }
}
