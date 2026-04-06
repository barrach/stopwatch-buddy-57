import type { SavedReport } from "@/components/SavedReportsList";
import { supabase } from "@/integrations/supabase/client";
import { canonicalDescription } from "@/lib/chartConstants";
import { computeHHMedioDia, getRecordHHWithContext, normalizeToHundred } from "@/lib/hourlyAverageCalc";

interface CategoryRow {
  id: string;
  nome: string;
  categoria_pai_id: string | null;
  impacta_produtividade: boolean;
}

interface ObservationRow {
  categoria_id: string;
  categorias_observacao: {
    nome: string;
    categoria_pai_id: string | null;
    impacta_produtividade: boolean | null;
  } | null;
  data: string;
  descricao: string;
  duracao_horas: number | null;
  especialidade_id: string | null;
  horario: string;
  obra_id: string;
  quantidade: number | null;
  quantidade_base: number | null;
}

export interface SavedReportExternalCause {
  name: string;
  value: number;
  percent: number;
}

async function fetchAllCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categorias_observacao")
    .select("id, nome, categoria_pai_id, impacta_produtividade");

  if (error) throw error;
  return (data || []) as CategoryRow[];
}

async function fetchAllReportRecords(report: SavedReport): Promise<ObservationRow[]> {
  const pageSize = 1000;
  let from = 0;
  const records: ObservationRow[] = [];

  while (true) {
    let query = supabase
      .from("observacoes")
      .select("categoria_id, categorias_observacao(nome, categoria_pai_id, impacta_produtividade), data, descricao, duracao_horas, especialidade_id, horario, obra_id, quantidade, quantidade_base")
      .eq("obra_id", report.obra_id)
      .is("deleted_at", null)
      .order("data", { ascending: true })
      .range(from, from + pageSize - 1);

    if (report.date_mode === "single" && report.data_unica) {
      query = query.eq("data", report.data_unica);
    } else {
      if (report.data_inicio) query = query.gte("data", report.data_inicio);
      if (report.data_fim) query = query.lte("data", report.data_fim);
    }

    if (report.especialidade_id) {
      query = query.eq("especialidade_id", report.especialidade_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = (data || []) as ObservationRow[];
    records.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return records;
}

function buildExternalContext(categories: CategoryRow[]) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const externalParentIds = new Set(
    categories
      .filter((category) => category.categoria_pai_id === null && category.impacta_produtividade === false)
      .map((category) => category.id)
  );

  const externalDescriptions = new Set<string>();
  categories.forEach((category) => {
    if (category.impacta_produtividade === false || (category.categoria_pai_id && externalParentIds.has(category.categoria_pai_id))) {
      externalDescriptions.add(category.nome);
    }
  });

  return { categoriesById, externalDescriptions };
}

function isExternalRecord(
  record: ObservationRow,
  categoriesById: Map<string, CategoryRow>,
  externalDescriptions: Set<string>
): boolean {
  const category = record.categorias_observacao;
  if (category?.impacta_produtividade === false) return true;
  if (category?.categoria_pai_id && categoriesById.get(category.categoria_pai_id)?.impacta_produtividade === false) return true;
  if (record.descricao && externalDescriptions.has(record.descricao)) return true;
  return false;
}

export async function calculateSavedReportExternalCauses(report: SavedReport): Promise<SavedReportExternalCause[]> {
  const [categories, records] = await Promise.all([
    fetchAllCategories(),
    fetchAllReportRecords(report),
  ]);

  const { categoriesById, externalDescriptions } = buildExternalContext(categories);
  const dayGroups = new Map<string, ObservationRow[]>();

  for (const record of records) {
    const key = `${record.data}|${record.obra_id}`;
    if (!dayGroups.has(key)) dayGroups.set(key, []);
    dayGroups.get(key)?.push(record);
  }

  const hhMedioByDay = new Map<string, number>();
  for (const [key, dayRecords] of dayGroups) {
    hhMedioByDay.set(key, computeHHMedioDia(dayRecords, records));
  }

  const totals = new Map<string, number>();
  const sourceDescriptions = new Set<string>();

  for (const record of records) {
    const description = canonicalDescription(record.descricao || "Sem descrição");
    const external = isExternalRecord(record, categoriesById, externalDescriptions);
    const operationalPt = description === "Aguardando Liberação de PT";

    if (!external && !operationalPt) continue;

    sourceDescriptions.add(description);

    const dayKey = `${record.data}|${record.obra_id}`;
    let hh = getRecordHHWithContext(
      record,
      hhMedioByDay.get(dayKey) || 0,
      dayGroups.get(dayKey) || [],
      records
    );

    if (hh === 0 && Number(record.quantidade_base) > 0) {
      hh = Number(record.quantidade_base);
    }

    totals.set(description, (totals.get(description) || 0) + hh);
  }

  const items = Array.from(totals.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sourceDescriptions.size > 0 && items.length === 0) {
    throw new Error("Nenhuma categoria externa pôde ser consolidada para o PDF.");
  }

  const names = items.map(([name]) => name);
  const values = items.map(([, value]) => value);
  const normalized = normalizeToHundred(names, values);

  const result = items.map(([name, value]) => ({
    name,
    value,
    percent: normalized[name] ?? 0,
  }));

  const renderedDescriptions = new Set(result.map((item) => item.name));
  for (const description of sourceDescriptions) {
    if (!renderedDescriptions.has(description) && (totals.get(description) || 0) > 0) {
      throw new Error(`Categoria externa ausente no PDF: ${description}`);
    }
  }

  if (result.length > 0) {
    const percentSum = Number(result.reduce((sum, item) => sum + item.percent, 0).toFixed(1));
    if (percentSum !== 100) {
      throw new Error(`Percentuais de NPE inválidos para o PDF: ${percentSum}%`);
    }
  }

  return result;
}
