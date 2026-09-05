// lib/users.ts — Users helpers (users table)
import { supabase } from "./supabase";
import type { User, UserRole } from "./types";

export const MOCK_USERS: User[] = [
  { id: "u1", name: "Andi Wijaya", email: "andi@ohsung-ei.co.id", role: "Admin", active: true, created_at: new Date().toISOString() },
  { id: "u2", name: "Siti Rahayu", email: "siti@ohsung-ei.co.id", role: "Staff", active: true, created_at: new Date().toISOString() },
  { id: "u3", name: "Budi Santoso", email: "budi@ohsung-ei.co.id", role: "Viewer", active: false, created_at: new Date().toISOString() },
];

export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });
  if (!error && data) return data as User[];
  // Fallback: kalau tabel users belum ada, pakai mock
  return MOCK_USERS;
}

export async function upsertUser(u: Partial<User> & { name: string; email: string; role: UserRole }) {
  if (u.id) {
    const { error } = await supabase
      .from("users")
      .update({ name: u.name, email: u.email, role: u.role, active: u.active ?? true })
      .eq("id", u.id);
    if (!error) return { ...u, id: u.id } as User;
    // Fallback: update MOCK_USERS in memory
    const idx = MOCK_USERS.findIndex((x) => x.id === u.id);
    if (idx >= 0) {
      MOCK_USERS[idx] = {
        ...MOCK_USERS[idx],
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active ?? true,
      };
      return MOCK_USERS[idx];
    }
    return { ...u, id: u.id } as User;
  } else {
    const { data, error } = await supabase
      .from("users")
      .insert({ name: u.name, email: u.email, role: u.role, active: u.active ?? true })
      .select()
      .single();
    if (!error && data) return data as User;
    // Fallback: add to MOCK_USERS in memory
    const newUser: User = {
      id: `mock-${Date.now()}`,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active ?? true,
      created_at: new Date().toISOString(),
    };
    MOCK_USERS.unshift(newUser);
    return newUser;
  }
}

export async function deleteUser(id: string) {
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) {
    // Fallback: remove from MOCK_USERS in memory
    const idx = MOCK_USERS.findIndex((x) => x.id === id);
    if (idx >= 0) MOCK_USERS.splice(idx, 1);
  }
}
