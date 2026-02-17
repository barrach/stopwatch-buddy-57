import { get, set, del, keys } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

export interface QueuedItem {
  id: string;
  table: string;
  operation: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  createdAt: string;
}

const QUEUE_PREFIX = "offline_queue_";

export async function addToQueue(item: Omit<QueuedItem, "id" | "createdAt">) {
  const queueItem: QueuedItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await set(`${QUEUE_PREFIX}${queueItem.id}`, queueItem);
  return queueItem;
}

export async function getQueuedItems(): Promise<QueuedItem[]> {
  const allKeys = await keys();
  const queueKeys = allKeys.filter((k) => String(k).startsWith(QUEUE_PREFIX));
  const items: QueuedItem[] = [];
  for (const key of queueKeys) {
    const item = await get<QueuedItem>(key);
    if (item) items.push(item);
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeFromQueue(id: string) {
  await del(`${QUEUE_PREFIX}${id}`);
}

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const items = await getQueuedItems();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      if (item.operation === "insert") {
        const { error } = await supabase.from(item.table as any).insert([item.payload] as any);
        if (error) throw error;
      } else if (item.operation === "update") {
        const { id: recordId, ...rest } = item.payload;
        const { error } = await supabase.from(item.table as any).update(rest as any).eq("id", recordId as string);
        if (error) throw error;
      } else if (item.operation === "delete") {
        const { error } = await supabase.from(item.table as any).delete().eq("id", item.payload.id as string);
        if (error) throw error;
      }
      await removeFromQueue(item.id);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

// Cache dimension data for offline use
const CACHE_PREFIX = "offline_cache_";

export async function cacheData(key: string, data: unknown) {
  await set(`${CACHE_PREFIX}${key}`, { data, cachedAt: new Date().toISOString() });
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  const cached = await get<{ data: T; cachedAt: string }>(`${CACHE_PREFIX}${key}`);
  return cached?.data ?? null;
}
