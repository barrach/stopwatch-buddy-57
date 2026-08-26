import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;
const CONCURRENCY = 6;

/**
 * Fetches ALL rows from a Supabase query, bypassing the default 1000-row limit.
 * Uses range-based pagination and fetches pages in parallel batches so that
 * large tables (tens of thousands of rows) load in a fraction of the time.
 */
export async function fetchAllObservacoes(
  select: string,
  filters: { deletedNull: boolean },
  orderBy?: { column: string; ascending: boolean }[]
) {
  const buildQuery = (opts?: { head?: boolean }) => {
    let query = supabase
      .from("observacoes")
      .select(select, opts?.head ? { count: "exact", head: true } : undefined);

    if (filters.deletedNull) {
      query = query.is("deleted_at", null);
    } else {
      query = query.not("deleted_at", "is", null);
    }

    return query;
  };

  const applyOrder = (query: any) => {
    if (orderBy) {
      for (const o of orderBy) {
        query = query.order(o.column, { ascending: o.ascending });
      }
    }
    // Stable tiebreaker so parallel ranges don't overlap/skip rows
    return query.order("id", { ascending: true });
  };

  // 1) How many rows are there?
  const { count, error: countError } = await buildQuery({ head: true });
  if (countError) throw countError;

  const total = count ?? 0;
  if (total === 0) return [];

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const pages = Array.from({ length: pageCount }, (_, i) => i);
  const results: any[][] = new Array(pageCount);

  // 2) Fetch pages in parallel batches
  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const batch = pages.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (pageIndex) => {
        const from = pageIndex * PAGE_SIZE;
        const query = applyOrder(buildQuery()).range(from, from + PAGE_SIZE - 1);
        const { data, error } = await query;
        if (error) throw error;
        results[pageIndex] = data ?? [];
      })
    );
  }

  return results.flat();
}
