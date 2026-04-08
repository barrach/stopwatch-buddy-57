import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches ALL rows from a Supabase query, bypassing the default 1000-row limit.
 * Uses range-based pagination internally.
 */
export async function fetchAllObservacoes(
  select: string,
  filters: { deletedNull: boolean },
  orderBy?: { column: string; ascending: boolean }[]
) {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("observacoes")
      .select(select);

    if (filters.deletedNull) {
      query = query.is("deleted_at", null);
    } else {
      query = query.not("deleted_at", "is", null);
    }

    if (orderBy) {
      for (const o of orderBy) {
        query = query.order(o.column, { ascending: o.ascending });
      }
    }

    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) break;
    allData = allData.concat(data);

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}
