import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cacheData, getCachedData } from "@/lib/offlineQueue";

/**
 * Fetches data from Supabase and caches it for offline use.
 * When offline, returns cached data.
 */
export function useOfflineQuery<T>(
  queryKey: string[],
  tableName: string,
  selectColumns: string,
  filters?: { column: string; value: string }[],
  orderBy?: string
) {
  return useQuery<T[]>({
    queryKey,
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = await getCachedData<T[]>(queryKey.join("_"));
        if (cached) return cached;
        throw new Error("Sem conexão e sem dados em cache");
      }

      let query = supabase.from(tableName as any).select(selectColumns);
      if (filters) {
        for (const f of filters) {
          query = query.eq(f.column, f.value);
        }
      }
      if (orderBy) {
        query = query.order(orderBy);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Cache for offline use
      await cacheData(queryKey.join("_"), data);
      return data as T[];
    },
    retry: (failureCount) => navigator.onLine && failureCount < 3,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
