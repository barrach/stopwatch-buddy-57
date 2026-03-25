import { supabase } from "@/integrations/supabase/client";
import { normalizeDescriptionName } from "@/lib/categoryNormalization";

const PT_DESCRIPTION = "Aguardando Liberação de PT";
const NPE_DESCRIPTIONS = new Set([
  "Fatores Climáticos e Consequências",
  "Interferências Operacionais",
]);

type ObservationForReprocessing = {
  id: string;
  data: string;
  obra_id: string;
  descricao: string;
  is_dinamico: boolean | null;
  quantidade: number | null;
  quantidade_base: number | null;
  duracao_horas: number | null;
  categorias_observacao?: {
    nome?: string | null;
    impacta_produtividade?: boolean | null;
  } | null;
};

const getBaseQuantity = (record: ObservationForReprocessing) => Number(record.quantidade_base ?? record.quantidade ?? 1);
const getDuration = (record: ObservationForReprocessing) => Number(record.duracao_horas ?? 1);

const isDynamicObservationTarget = (record: ObservationForReprocessing) => {
  if (record.is_dinamico !== true) return false;

  const normalizedDescription = normalizeDescriptionName(record.descricao);
  const categoryName = record.categorias_observacao?.nome ?? "";
  const isSupplementarPt = categoryName === "Suplementar" && normalizedDescription === PT_DESCRIPTION;
  const isExternalNpe =
    (categoryName === "Não Produtivo Externo" || record.categorias_observacao?.impacta_produtividade === false) &&
    NPE_DESCRIPTIONS.has(normalizedDescription);

  return isSupplementarPt || isExternalNpe;
};

export async function reprocessarObservacoesDoDia(data: string, obraId: string) {
  console.log("REPROCESSANDO DIA:", data, obraId);

  const { data: records, error } = await supabase
    .from("observacoes")
    .select("id, data, obra_id, descricao, is_dinamico, quantidade, quantidade_base, duracao_horas, categorias_observacao(nome, impacta_produtividade)")
    .eq("data", data)
    .eq("obra_id", obraId)
    .is("deleted_at", null);

  if (error) throw error;

  const dayRecords = (records ?? []) as ObservationForReprocessing[];
  const hhTotalDia = dayRecords.reduce((sum, record) => sum + getBaseQuantity(record) * getDuration(record), 0);
  const totalAmostras = dayRecords.reduce((sum, record) => sum + getBaseQuantity(record), 0);

  console.log("TOTAL HH:", hhTotalDia, "TOTAL AMOSTRAS:", totalAmostras);

  dayRecords
    .filter(isDynamicObservationTarget)
    .forEach((record) => {
      const hh = getBaseQuantity(record) * getDuration(record);
      console.log("ATUALIZANDO REGISTRO:", record.id, "HH =", hh);
    });

  const { error: rpcError } = await supabase.rpc("recalculate_dynamic_observations", {
    p_date: data,
    p_obra_id: obraId,
  });

  if (rpcError) throw rpcError;
}