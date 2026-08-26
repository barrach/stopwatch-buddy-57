import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;
const CONCURRENCY = 12;

type LookupRow = Record<string, any> & { id: string };

const LOOKUP_TABLES: Record<string, { table: string; columns: string }> = {
  rotas: { table: "rotas", columns: "id, nome" },
  especialidades: { table: "especialidades", columns: "id, nome" },
  obras: { table: "obras", columns: "id, nome" },
  categorias_observacao: {
    table: "categorias_observacao",
    columns: "id, nome, categoria_pai_id, impacta_produtividade",
  },
};

const FK_BY_RELATION: Record<string, string> = {
  rotas: "rota_id",
  especialidades: "especialidade_id",
  obras: "obra_id",
  categorias_observacao: "categoria_id",
};

/** Extract embedded relation names (e.g. "especialidades(nome)") from a select string. */
function parseRelations(select: string): string[] {
  const relations: string[] = [];
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(select)) !== null) {
    if (LOOKUP_TABLES[match[1]]) relations.push(match[1]);
  }
  return [...new Set(relations)];
}

async function fetchLookup(relation: string): Promise<Map<string, LookupRow>> {
  const cfg = LOOKUP_TABLES[relation];
  const { data, error } = await supabase.from(cfg.table as any).select(cfg.columns);
  if (error) throw error;
  const map = new Map<string, LookupRow>();
  (data as any[] | null)?.forEach((row) => map.set(row.id, row));
  return map;
}

/**
 * Fetches ALL rows from the observacoes table, bypassing the default 1000-row limit.
 *
 * Performance strategy:
 * - Embedded joins in `select` are stripped and resolved client-side from tiny
 *   lookup tables. Joining 4 tables across tens of thousands of rows on the
 *   server is the single slowest part of the request; flat reads are far faster.
 * - Pages are fetched in parallel batches.
 * The returned shape stays identical to a joined query (nested objects present).
 */
export async function fetchAllObservacoes(
  select: string,
  filters: { deletedNull: boolean },
  orderBy?: { column: string; ascending: boolean }[]
) {
  const relations = parseRelations(select);

  const buildQuery = (opts?: { head?: boolean }) => {
    let query = supabase
      .from("observacoes")
      .select("*", opts?.head ? { count: "exact", head: true } : undefined);

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

  // 1) Row count + lookup tables in parallel
  const [countResult, lookupEntries] = await Promise.all([
    buildQuery({ head: true }),
    Promise.all(
      relations.map(async (rel) => [rel, await fetchLookup(rel)] as const)
    ),
  ]);

  if (countResult.error) throw countResult.error;
  const lookups = new Map(lookupEntries);

  const total = countResult.count ?? 0;
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
        results[pageIndex] = (data as any[]) ?? [];
      })
    );
  }

  const rows = results.flat();

  // 3) Attach nested relation objects client-side
  if (relations.length > 0) {
    for (const row of rows) {
      for (const rel of relations) {
        const fk = FK_BY_RELATION[rel];
        const id = fk ? row[fk] : null;
        row[rel] = id ? lookups.get(rel)?.get(id) ?? null : null;
      }
    }
  }

  return rows;
}
