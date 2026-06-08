import { supabase } from "@/integrations/supabase/client";

export type BackupPayload = {
  version: 1;
  createdAt: string;
  items: Array<Record<string, unknown>>;
  reminders: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
};

export async function fetchUserData(userId: string) {
  const [items, reminders, documents] = await Promise.all([
    supabase.from("items").select("*").eq("user_id", userId),
    supabase.from("reminders").select("*").eq("user_id", userId),
    supabase.from("documents").select("*").eq("user_id", userId),
  ]);
  if (items.error) throw items.error;
  if (reminders.error) throw reminders.error;
  if (documents.error) throw documents.error;
  return {
    items: items.data ?? [],
    reminders: reminders.data ?? [],
    documents: documents.data ?? [],
  };
}

export async function createBackup(userId: string) {
  const data = await fetchUserData(userId);
  const payload: BackupPayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    ...data,
  };
  const json = JSON.stringify(payload);
  const { data: row, error } = await supabase
    .from("backups")
    .insert({ user_id: userId, size: json.length, payload: payload as never })
    .select("id, created_at, size")
    .single();
  if (error) throw error;
  return { row, payload, json };
}

export async function latestBackup(userId: string) {
  const { data, error } = await supabase
    .from("backups")
    .select("id, created_at, size, payload")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function restoreBackup(userId: string, payload: BackupPayload) {
  if (payload.version !== 1) throw new Error("Unsupported backup version");
  // Replace user's items/reminders/documents with backup contents.
  await supabase.from("documents").delete().eq("user_id", userId);
  await supabase.from("reminders").delete().eq("user_id", userId);
  await supabase.from("items").delete().eq("user_id", userId);
  if (payload.items.length) {
    const rows = payload.items.map((i) => ({ ...i, user_id: userId }));
    const { error } = await supabase.from("items").insert(rows as never);
    if (error) throw error;
  }
  if (payload.reminders.length) {
    const rows = payload.reminders.map((r) => ({ ...r, user_id: userId }));
    const { error } = await supabase.from("reminders").insert(rows as never);
    if (error) throw error;
  }
  if (payload.documents.length) {
    const rows = payload.documents.map((d) => ({ ...d, user_id: userId }));
    const { error } = await supabase.from("documents").insert(rows as never);
    if (error) throw error;
  }
}

export function downloadBackupJson(payload: BackupPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `one-home-backup-${payload.createdAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
