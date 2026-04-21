import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserObra } from "@/hooks/useUserObra";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllObservacoes } from "@/lib/supabaseAllRows";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, Archive, CloudOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  CANONICAL_ORDER_FULL, canonicalDescription,
  WEEKDAY_NAMES, MONTH_NAMES, timeIndex, getTimeBucketLabel,
} from "@/lib/chartConstants";
import { computeHourlyAdjustedPercentages, computeHHMedioDia, getRecordHHWithContext, normalizeToHundred } from "@/lib/hourlyAverageCalc";
import {
  StackedBarChartSection, ParetoChartSection, ExternalPieSection,
} from "@/components/ReportCharts";
import { generateSavedReportPDF } from "@/lib/savedReportPdf";
import { captureSavedReportCharts } from "@/lib/savedReportChartCapture";
import type { SavedReport } from "@/components/SavedReportsList";

export default function RelatoriosPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { obraFilter: userObraRestriction } = useUserObra();
  const [dateMode, setDateMode] = useState<"single" | "period">("single");
  const [date, setDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [obraId, setObraId] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState("");
  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [excludeClimatic, setExcludeClimatic] = useState(false);

  // Auto-set obra for restricted users
  useEffect(() => {
    if (userObraRestriction && !obraId) {
      setObraId(userObraRestriction);
    }
  }, [userObraRestriction]);

  // ── Data fetching ──
  const { data: obras = [] } = useQuery({
    queryKey: ["obras", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: especialidades = [] } = useQuery({
    queryKey: ["especialidades", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("especialidades").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: parentCats = [] } = useQuery({
    queryKey: ["categorias_observacao", "parents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("id, nome, impacta_produtividade").is("categoria_pai_id", null);
      if (error) throw error;
      return data;
    },
  });

  const { data: allCats = [] } = useQuery({
    queryKey: ["categorias_observacao", "all_with_impact"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("id, nome, categoria_pai_id, impacta_produtividade");
      if (error) throw error;
      return data;
    },
  });

  const { data: allRecords = [] } = useQuery({
    queryKey: ["observacoes"],
    queryFn: () => fetchAllObservacoes(
      "*, especialidades(nome), categorias_observacao(nome, categoria_pai_id, impacta_produtividade), obras(nome)",
      { deletedNull: true },
      [{ column: "data", ascending: false }]
    ),
  });

  // ── Category helpers ──
  const parentCatMap = useMemo(() => {
    const map: Record<string, string> = {};
    parentCats.forEach((c: any) => { map[c.id] = c.nome; });
    return map;
  }, [parentCats]);

  const parentCatImpactMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    parentCats.forEach((c: any) => { map[c.id] = c.impacta_produtividade !== false; });
    return map;
  }, [parentCats]);

  const npeDescriptions = useMemo(() => {
    const npeParentIds = new Set(parentCats.filter((c: any) => c.impacta_produtividade === false).map((c: any) => c.id));
    const descs = new Set<string>();
    allCats.forEach((c: any) => {
      if (c.impacta_produtividade === false || (c.categoria_pai_id && npeParentIds.has(c.categoria_pai_id))) {
        descs.add(c.nome);
      }
    });
    return descs;
  }, [allCats, parentCats]);

  const isExternalRecord = useCallback((r: any) => {
    const catData = r.categorias_observacao as any;
    if (!catData) return false;
    if (catData.impacta_produtividade === false) return true;
    if (catData.categoria_pai_id && parentCatImpactMap[catData.categoria_pai_id] === false) return true;
    if (r.descricao && npeDescriptions.has(r.descricao)) return true;
    return false;
  }, [parentCatImpactMap, npeDescriptions]);

  // ── Filtered records ──
  const records = useMemo(() => {
    if (!generated) return [];
    return allRecords.filter((r: any) => {
      if (dateMode === "single") {
        if (r.data !== date) return false;
      } else {
        if (r.data < startDate || r.data > endDate) return false;
      }
      if (r.obra_id !== obraId) return false;
      if (especialidadeId && r.especialidade_id !== especialidadeId) return false;
      if (excludeClimatic) {
        const desc = canonicalDescription(r.descricao || "");
        if (desc === "Fatores Climáticos e Consequências") return false;
      }
      return true;
    });
  }, [generated, dateMode, date, startDate, endDate, obraId, especialidadeId, allRecords, excludeClimatic]);

  // ── HH medio per day ──
  const hhMedioByDay = useMemo(() => {
    const dayGroups = new Map<string, any[]>();
    for (const r of records) {
      const key = `${r.data}|${r.obra_id}`;
      if (!dayGroups.has(key)) dayGroups.set(key, []);
      dayGroups.get(key)!.push(r);
    }
    const map = new Map<string, number>();
    for (const [key, recs] of dayGroups) {
      map.set(key, computeHHMedioDia(recs, records));
    }
    return map;
  }, [records]);

  const getHH = useCallback((r: any) => {
    const key = `${r.data}|${r.obra_id}`;
    return getRecordHHWithContext(r, hhMedioByDay.get(key) || 0, records.filter((rec: any) => `${rec.data}|${rec.obra_id}` === key), records);
  }, [hhMedioByDay, records]);

  // ── Summary ──
  const summary = useMemo(() => {
    const dates = new Set<string>();
    const times = new Set<string>();
    let totalMeasurements = 0;
    records.forEach((r: any) => {
      dates.add(r.data);
      times.add(r.horario);
      totalMeasurements += getHH(r);
    });
    const sortedTimes = Array.from(times).sort((a, b) => timeIndex(a) - timeIndex(b));
    const sortedDates = Array.from(dates).sort();
    return {
      totalDays: dates.size,
      totalMeasurements,
      times: sortedTimes,
      dateStart: sortedDates[0] || "",
      dateEnd: sortedDates[sortedDates.length - 1] || "",
    };
  }, [records, getHH]);

  // ── Chart Data ──
  const totalSamples = useMemo(() => records.reduce((s: number, r: any) => s + getHH(r), 0), [records, getHH]);

  // Build dynamic description list from data
  const dynamicDescriptions = useMemo(() => {
    const extraDescs = new Set<string>();
    records.forEach((r: any) => {
      const desc = canonicalDescription(r.descricao || "Sem descrição");
      if (!CANONICAL_ORDER_FULL.includes(desc) && desc !== "Sem descrição") {
        extraDescs.add(desc);
      }
    });
    return [...CANONICAL_ORDER_FULL, ...Array.from(extraDescs).sort()];
  }, [records]);

  const byObra = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    records.forEach((r: any) => {
      const oName = (r.obras as any)?.nome || "Sem contrato";
      if (!grouped[oName]) grouped[oName] = [];
      grouped[oName].push(r);
    });
    return Object.entries(grouped).map(([name, recs]) => {
      const total = recs.reduce((s: number, r: any) => s + getHH(r), 0);
      const pcts = computeHourlyAdjustedPercentages(recs, dynamicDescriptions);
      const row: any = { name, total };
      for (const desc of dynamicDescriptions) row[desc] = pcts[desc] || 0;
      return row;
    }).sort((a, b) => (b["Trabalhando"] || 0) - (a["Trabalhando"] || 0));
  }, [records, dynamicDescriptions]);

  const bySpecialty = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    records.forEach((r: any) => {
      const sName = (r.especialidades as any)?.nome || "Sem especialidade";
      if (!result[sName]) result[sName] = Object.fromEntries(dynamicDescriptions.map((d) => [d, 0]));
      const desc = canonicalDescription(r.descricao || "Sem descrição");
      if (!(desc in result[sName])) result[sName][desc] = 0;
      result[sName][desc] += getHH(r);
    });
    return Object.entries(result)
      .filter(([_, descs]) => Object.values(descs).reduce((s, v) => s + v, 0) > 0)
      .map(([name, descs]) => {
        const keys = dynamicDescriptions;
        const vals = keys.map(d => descs[d] || 0);
        const pcts = normalizeToHundred(keys, vals);
        const row: any = { name };
        for (const desc of keys) row[desc] = pcts[desc] || 0;
        return row;
      }).sort((a, b) => (b["Trabalhando"] || 0) - (a["Trabalhando"] || 0));
  }, [records, dynamicDescriptions]);

  const byHorario = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    records.forEach((r: any) => {
      const key = getTimeBucketLabel(r, "horario");
      if (!key) return;
      if (!result[key]) result[key] = Object.fromEntries(dynamicDescriptions.map((d) => [d, 0]));
      const desc = canonicalDescription(r.descricao || "Sem descrição");
      if (!(desc in result[key])) result[key][desc] = 0;
      result[key][desc] += getHH(r);
    });
    return Object.entries(result).sort(([a], [b]) => timeIndex(a) - timeIndex(b)).map(([label, descs]) => {
      const keys = dynamicDescriptions;
      const vals = keys.map(d => descs[d] || 0);
      const pcts = normalizeToHundred(keys, vals);
      const row: any = { time: label };
      for (const desc of keys) row[desc] = pcts[desc] || 0;
      return row;
    });
  }, [records, dynamicDescriptions]);

  const byDiaSemana = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    records.forEach((r: any) => {
      const key = getTimeBucketLabel(r, "diasemana");
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });
    return Object.entries(grouped).sort(([a], [b]) => WEEKDAY_NAMES.indexOf(a) - WEEKDAY_NAMES.indexOf(b)).map(([label, recs]) => {
      const total = recs.reduce((s: number, r: any) => s + getHH(r), 0);
      const pcts = computeHourlyAdjustedPercentages(recs, dynamicDescriptions);
      const row: any = { time: label, total };
      for (const desc of dynamicDescriptions) row[desc] = pcts[desc] || 0;
      return row;
    });
  }, [records, dynamicDescriptions]);

  const byMes = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    records.forEach((r: any) => {
      const key = getTimeBucketLabel(r, "mes");
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });
    return Object.entries(grouped).sort(([a], [b]) => MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b)).map(([label, recs]) => {
      const total = recs.reduce((s: number, r: any) => s + getHH(r), 0);
      const pcts = computeHourlyAdjustedPercentages(recs, dynamicDescriptions);
      const row: any = { time: label, total };
      for (const desc of dynamicDescriptions) row[desc] = pcts[desc] || 0;
      return row;
    });
  }, [records, dynamicDescriptions]);

  const paretoData = useMemo(() => {
    const totals: Record<string, number> = {};
    records.forEach((r: any) => {
      const key = r.descricao || "Sem descrição";
      totals[key] = (totals[key] || 0) + getHH(r);
    });
    const sorted = Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    let cumulative = 0;
    return sorted.slice(0, 10).map((item) => {
      cumulative += item.value;
      return {
        ...item,
        percent: totalSamples > 0 ? Math.round((item.value / totalSamples) * 100) : 0,
        cumPercent: totalSamples > 0 ? +((cumulative / totalSamples) * 100).toFixed(1) : 0,
      };
    });
  }, [records, totalSamples]);

  const externalCausas = useMemo(() => {
    const AG_PT = "Aguardando Liberação de PT";
    const KNOWN_NPE = new Set([
      "Fatores Climáticos e Consequências",
      "Interferências Operacionais",
    ]);
    const totals: Record<string, number> = {};
    records.forEach((r: any) => {
      const desc = canonicalDescription(r.descricao || "Sem descrição");
      const isNPE = isExternalRecord(r);
      const isAgPT = desc === AG_PT;
      const isKnownNPE = KNOWN_NPE.has(desc);
      if (!isNPE && !isAgPT && !isKnownNPE) return;
      let hh = getHH(r);
      // Fallback: if HH is 0 but record has quantidade_base, use it so NPE records aren't invisible
      if (hh === 0 && r.quantidade_base > 0) {
        hh = r.quantidade_base;
      }
      totals[desc] = (totals[desc] || 0) + hh;
    });
    const sorted = Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, c) => s + c.value, 0);
    return sorted.map(item => ({
      ...item,
      percent: total > 0 ? +((item.value / total) * 100).toFixed(1) : 0,
    }));
  }, [records, isExternalRecord, getHH]);

  // ── Validation & generation ──
  const handleGenerate = () => {
    if (!obraId) {
      toast({ title: "Campo obrigatório", description: "Selecione um contrato.", variant: "destructive" });
      return;
    }
    if (dateMode === "single" && !date) {
      toast({ title: "Campo obrigatório", description: "Selecione uma data.", variant: "destructive" });
      return;
    }
    if (dateMode === "period") {
      if (!startDate || !endDate) {
        toast({ title: "Campos obrigatórios", description: "Selecione data inicial e final.", variant: "destructive" });
        return;
      }
      if (startDate > endDate) {
        toast({ title: "Período inválido", description: "Data inicial deve ser menor ou igual à data final.", variant: "destructive" });
        return;
      }
    }
    setGenerated(true);
  };

  // ── Save report ──
  const handleSave = async () => {
    if (!user) {
      toast({ title: "Erro", description: "Você precisa estar autenticado.", variant: "destructive" });
      return;
    }
    if (records.length === 0) {
      toast({ title: "Sem dados", description: "Gere o relatório antes de salvar.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const obraName = obras.find((o) => o.id === obraId)?.nome || "";
    const specName = especialidades.find((e) => e.id === especialidadeId)?.nome || "";
    const periodLabel = dateMode === "single" ? date : `${startDate} até ${endDate}`;

    const snapshot = {
      summary,
      byObra,
      bySpecialty,
      byHorario,
      byDiaSemana,
      byMes,
      paretoData,
      externalCausas,
    };

    const { error } = await supabase.from("relatorios_salvos").insert({
      criado_por: user.id,
      titulo: `${obraName} — ${periodLabel}${excludeClimatic ? " (Sem Fatores Climáticos)" : ""}`,
      date_mode: dateMode,
      data_unica: dateMode === "single" ? date : null,
      data_inicio: dateMode === "period" ? startDate : null,
      data_fim: dateMode === "period" ? endDate : null,
      obra_id: obraId,
      obra_nome: obraName,
      especialidade_id: especialidadeId || null,
      especialidade_nome: specName || null,
      snapshot,
      tipo_relatorio: excludeClimatic ? "sem_fatores_climaticos" : "padrao",
    } as any);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Relatório salvo com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["relatorios_salvos"] });
    }
  };

  // ── Export PDF from saved report ──
  const handleExportPDF = async (report: SavedReport) => {
    toast({ title: "Gerando PDF...", description: "Capturando gráficos, aguarde..." });
    try {
      const { images, dimensions } = await captureSavedReportCharts(report);
      generateSavedReportPDF(report, images, dimensions);
      toast({ title: "PDF gerado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar PDF", description: err.message, variant: "destructive" });
    }
  };

  const obraName = obras.find((o) => o.id === obraId)?.nome || "";
  const specName = especialidades.find((e) => e.id === especialidadeId)?.nome || "";
  const periodLabel = dateMode === "single" ? date : `${startDate} até ${endDate}`;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Relatórios</h1>
            <p className="text-sm text-muted-foreground mt-1">Gere relatórios detalhados de produtividade</p>
          </div>
          <Button onClick={() => navigate("/relatorios-salvos")} className="gap-2">
            <Archive className="w-4 h-4" />
            Relatórios Salvos
          </Button>
        </div>

        {/* Filters */}
        <div className="stat-card mb-6 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4">Filtros</h3>

          <div className="mb-4">
            <Label className="text-xs text-muted-foreground mb-2 block">Modo de seleção</Label>
            <RadioGroup value={dateMode} onValueChange={(v) => { setDateMode(v as any); setGenerated(false); }} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="mode-single" />
                <Label htmlFor="mode-single" className="text-sm cursor-pointer">Data única</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="period" id="mode-period" />
                <Label htmlFor="mode-period" className="text-sm cursor-pointer">Período</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            {dateMode === "single" ? (
              <div>
                <Label className="text-xs text-muted-foreground">Data *</Label>
                <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setGenerated(false); }} className="mt-1" />
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">Data Inicial *</Label>
                  <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setGenerated(false); }} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data Final *</Label>
                  <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setGenerated(false); }} className="mt-1" />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Contrato *</Label>
              <Select value={obraId} onValueChange={(v) => { setObraId(v); setGenerated(false); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Especialidade</Label>
              <Select value={especialidadeId || "all"} onValueChange={(v) => { setEspecialidadeId(v === "all" ? "" : v); setGenerated(false); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {especialidades.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={handleGenerate} className="gap-2">
              <FileText className="w-4 h-4" />
              Gerar Relatório
            </Button>
            {generated && records.length > 0 && (
              <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" />
                {saving ? "Salvando..." : "Salvar Relatório"}
              </Button>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border/50">
            <label className="flex items-start gap-3 cursor-pointer group">
              <Checkbox
                checked={excludeClimatic}
                onCheckedChange={(v) => { setExcludeClimatic(!!v); setGenerated(false); }}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    Excluir Fatores Climáticos e Consequências
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Gera o relatório desconsiderando registros desta categoria. Útil para comparar o impacto real do clima na produtividade.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Empty state */}
        {generated && records.length === 0 && (
          <div className="stat-card text-center py-12 animate-fade-in">
            <p className="text-muted-foreground">Nenhum dado encontrado para o período selecionado.</p>
          </div>
        )}

        {/* Report */}
        {generated && records.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            <div className="stat-card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">
                  Relatório — {periodLabel} — {obraName}
                  {specName && <span className="text-muted-foreground font-normal text-sm ml-2">({specName})</span>}
                </h2>
                {excludeClimatic && (
                  <Badge variant="outline" className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <CloudOff className="w-3 h-3" />
                    Sem Fatores Climáticos
                  </Badge>
                )}
              </div>
            </div>

            <div className="stat-card">
              <h3 className="text-sm font-semibold text-foreground mb-3">Resumo do Período</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Período analisado</p>
                  <p className="text-sm font-medium text-foreground">{summary.dateStart} até {summary.dateEnd}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de dias analisados</p>
                  <p className="text-sm font-medium text-foreground">{summary.totalDays}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de medições</p>
                  <p className="text-sm font-medium text-foreground">{Math.round(summary.totalMeasurements)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Horários registrados:</p>
              <div className="flex flex-wrap gap-2">
                {summary.times.map((t) => (
                  <span key={t} className="px-2.5 py-1 rounded-md bg-muted text-xs font-mono font-medium text-foreground">{t}</span>
                ))}
              </div>
            </div>

            <StackedBarChartSection data={byObra} dataKeyX="name" descriptions={dynamicDescriptions} title="Visão Geral por Contrato" xAngle={-15} />
            <StackedBarChartSection data={bySpecialty} dataKeyX="name" descriptions={dynamicDescriptions} title="Produtividade por Especialidade" xAngle={-25} />
            <StackedBarChartSection data={byHorario} dataKeyX="time" descriptions={dynamicDescriptions} title="Produtividade por Horário" />
            <StackedBarChartSection data={byDiaSemana} dataKeyX="time" descriptions={dynamicDescriptions} title="Produtividade por Dia da Semana" />
            <StackedBarChartSection data={byMes} dataKeyX="time" descriptions={dynamicDescriptions} title="Produtividade por Mês" />
            <ParetoChartSection data={paretoData} title="Top Causas (Pareto)" mode="categoria" />
            <ExternalPieSection data={externalCausas} title="Causas Externas de Parada" />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
