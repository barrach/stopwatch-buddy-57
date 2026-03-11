import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList, Line, ComposedChart,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import StatCard, { Users, Clock, BarChart3, AlertTriangle } from "@/components/StatCard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, X, Sparkles, Loader2, FileText, ChevronDown, ChevronUp, TrendingUp, CloudRain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ── Color constants (BI-grade palette) ───────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: "#16A34A",
  Suplementar: "#F59E0B",
  "Não Produtivo": "#DC2626",
  "Não Produtivo Externo": "#3B82F6",
};

const PIE_COLORS = [
  "#2563EB", "#B91C1C", "#047857", "#1F2937", "#9CA3AF",
  "#EAB308", "#7C3AED", "#EC4899", "#38BDF8", "#22C55E",
];

const SPECIALTY_COLORS: Record<string, string> = {
  "Elétrica": "#2563EB",
  "Instrumentação": "#B91C1C",
  "Mecânica": "#047857",
  "Caldeiraria": "#1F2937",
  "Caldeiraria/Solda": "#1F2937",
  "Andaime": "#9CA3AF",
  "Civil": "#EAB308",
  "Isolamento": "#7C3AED",
  "Pintura": "#EC4899",
  "Equip./Elevação": "#38BDF8",
  "Equipamentos / Elevação": "#38BDF8",
  "Lubrificação": "#22C55E",
};

// Auto-generate contrasting colors for unknown specialties
const AUTO_COLORS = ["#0EA5E9", "#D946EF", "#F97316", "#14B8A6", "#6366F1", "#A3E635", "#FB7185", "#FBBF24"];
let autoColorIdx = 0;
const getSpecialtyColor = (name: string): string => {
  if (SPECIALTY_COLORS[name]) return SPECIALTY_COLORS[name];
  // Check partial matches
  for (const [key, color] of Object.entries(SPECIALTY_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  // Generate and cache a new contrasting color
  const color = AUTO_COLORS[autoColorIdx % AUTO_COLORS.length];
  SPECIALTY_COLORS[name] = color;
  autoColorIdx++;
  return color;
};

// ── Per-description unique colors (high contrast, category-tinted) ──
const DESCRIPTION_COLORS: Record<string, string> = {
  // Produtivo (greens & cool tones)
  "Trabalhando": "#16A34A",
  "Planejando": "#2563EB",
  // Suplementar (warm tones & purples)
  "Aguardando Instruções": "#F59E0B",
  "Assistindo": "#7C3AED",
  "Aguardando Ferramenta ou Material": "#EAB308",
  "Aguardando Liberação": "#EA580C",
  "Transitando no local de trabalho - com ferramenta": "#0891B2",
  "Transitando no local de trabalho - sem ferramenta": "#D946EF",
  "Preparando, Organizando": "#0D9488",
  // Não Produtivo (reds & dark tones)
  "Pessoal": "#DC2626",
  "Ocioso": "#1F2937",
  "Retrabalho": "#9F1239",
  "Deslocamento": "#78350F",
  // Não Produtivo Externo (blue tones)
  "Causas Naturais": "#3B82F6",
  "Vazamento / Interferência da Planta": "#2563EB",
  "Cliente": "#6366F1",
};

// Map description to its unique color, falling back to parent category color
const getDescriptionCategoryColor = (cat: string, descricao?: string): string => {
  if (descricao && DESCRIPTION_COLORS[descricao]) return DESCRIPTION_COLORS[descricao];
  return CATEGORY_COLORS[cat] || "#6B7280";
};

const tooltipStyle: React.CSSProperties = {
  background: "#111827", border: "1px solid #374151",
  borderRadius: "8px", color: "#F9FAFB", fontSize: "12px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
};
const tooltipLabelStyle: React.CSSProperties = { color: "#F9FAFB" };

const TICK_COLOR = "#9CA3AF";
const GRID_COLOR = "#374151";

const renderPieLabel = ({ percent, x, y, textAnchor }: any) => (
  <text x={x} y={y} textAnchor={textAnchor} fill="#F9FAFB" fontSize={12} fontWeight={500}>
    {(percent * 100).toFixed(1)}%
  </text>
);

// ── Auto-highlight helpers (Power BI style) ──────────────────────
const getHighlightBorder = (type: "best" | "worst" | "none") => {
  if (type === "best") return "ring-2 ring-green-500/50 shadow-green-500/10 shadow-lg";
  if (type === "worst") return "ring-2 ring-red-500/50 shadow-red-500/10 shadow-lg";
  return "";
};

type ParetoMode = "especialidade" | "categoria" | "funcao";

interface CrossFilters {
  categoria?: string;
  rota?: string;
  especialidade?: string;
  contrato?: string;
  horario?: string;
  descricao?: string;
  pareto?: string;
  funcao?: string;
}

// Chronological time ordering helper — parses "8:00" or "08:00" to minutes
const timeIndex = (t: string) => {
  const parts = t.split(":");
  if (parts.length < 2) return 9999;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
};

export default function Dashboard() {
  const { toast } = useToast();
  const [obraFilter, setObraFilter] = useState("all");
  const [aiReport, setAiReport] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReportExpanded, setAiReportExpanded] = useState(false);
  const [dateMode, setDateMode] = useState<"all" | "day" | "period">("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const applyQuickFilter = (preset: "today" | "week" | "month") => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    if (preset === "today") {
      setDateMode("day");
      setSelectedDate(todayStr);
    } else if (preset === "week") {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      setStartDate(start.toISOString().slice(0, 10));
      setEndDate(todayStr);
      setDateMode("period");
    } else if (preset === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(start.toISOString().slice(0, 10));
      setEndDate(todayStr);
      setDateMode("period");
    }
  };
  const [crossFilters, setCrossFilters] = useState<CrossFilters>({});
  const [paretoMode, setParetoMode] = useState<ParetoMode>(() => {
    try { return (sessionStorage.getItem("paretoMode") as ParetoMode) || "categoria"; } catch { return "categoria"; }
  });

  const handleParetoModeChange = (mode: ParetoMode) => {
    setParetoMode(mode);
    try { sessionStorage.setItem("paretoMode", mode); } catch {}
    setCrossFilters(prev => ({ ...prev, pareto: undefined }));
  };

  const hasActiveFilters = Object.values(crossFilters).some(Boolean);

  const toggleCrossFilter = (key: keyof CrossFilters, value: string) => {
    setCrossFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value,
    }));
  };

  const clearAllFilters = () => setCrossFilters({});

  // ── Data fetching ──────────────────────────────────────────────
  const { data: obras = [] } = useQuery({
    queryKey: ["obras", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, nome").eq("status", "Ativo").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: allRecords = [] } = useQuery({
    queryKey: ["observacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("observacoes")
        .select("*, rotas(nome), especialidades(nome), categorias_observacao(nome, categoria_pai_id, impacta_produtividade), obras(nome), funcoes(nome)")
        .is("deleted_at", null)
        .order("data", { ascending: false });
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

  const parentCatMap = useMemo(() => {
    const map: Record<string, string> = {};
    parentCats.forEach((c) => { map[c.id] = c.nome; });
    return map;
  }, [parentCats]);

  const parentCatImpactMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    parentCats.forEach((c: any) => { map[c.id] = c.impacta_produtividade !== false; });
    return map;
  }, [parentCats]);

  const getParentCatName = useCallback((r: any) => {
    const catData = r.categorias_observacao as any;
    if (!catData) return "Sem categoria";
    if (catData.categoria_pai_id) {
      return parentCatMap[catData.categoria_pai_id] || catData.nome;
    }
    return catData.nome;
  }, [parentCatMap]);

  const isExternalRecord = useCallback((r: any) => {
    const catData = r.categorias_observacao as any;
    if (!catData) return false;
    // Check the record's own flag first
    if (catData.impacta_produtividade === false) return true;
    // Check parent category flag
    if (catData.categoria_pai_id && parentCatImpactMap[catData.categoria_pai_id] === false) return true;
    return false;
  }, [parentCatImpactMap]);

  // ── Filtering ──────────────────────────────────────────────────
  const baseRecords = useMemo(() => {
    let filtered = obraFilter === "all" ? allRecords : allRecords.filter((r: any) => r.obra_id === obraFilter);
    if (dateMode === "day") {
      filtered = filtered.filter((r: any) => r.data === selectedDate);
    } else if (dateMode === "period") {
      filtered = filtered.filter((r: any) => r.data >= startDate && r.data <= endDate);
    }
    return filtered;
  }, [allRecords, obraFilter, dateMode, selectedDate, startDate, endDate]);

  const records = useMemo(() => {
    return baseRecords.filter((r: any) => {
      if (crossFilters.categoria && getParentCatName(r) !== crossFilters.categoria) return false;
      if (crossFilters.rota && ((r.rotas as any)?.nome || "Sem rota") !== crossFilters.rota) return false;
      if (crossFilters.especialidade && ((r.especialidades as any)?.nome || "Sem especialidade") !== crossFilters.especialidade) return false;
      if (crossFilters.contrato && ((r.obras as any)?.nome || "Sem contrato") !== crossFilters.contrato) return false;
      if (crossFilters.horario && r.horario !== crossFilters.horario) return false;
      if (crossFilters.funcao && ((r as any).funcoes?.nome || "Sem função") !== crossFilters.funcao) return false;
      if (crossFilters.descricao && r.descricao !== crossFilters.descricao) return false;
      if (crossFilters.pareto) {
        if (paretoMode === "especialidade" && ((r.especialidades as any)?.nome || "Sem especialidade") !== crossFilters.pareto) return false;
        if (paretoMode === "categoria" && r.descricao !== crossFilters.pareto) return false;
        if (paretoMode === "funcao" && ((r as any).funcoes?.nome || "Sem função") !== crossFilters.pareto) return false;
      }
      return true;
    });
  }, [baseRecords, crossFilters, getParentCatName, paretoMode]);

  // ── KPI Metrics ────────────────────────────────────────────────
  const totalSamples = useMemo(() => records.reduce((s: number, r: any) => s + (r.quantidade || 0), 0), [records]);
  const externalCount = useMemo(
    () => records.filter((r: any) => isExternalRecord(r)).reduce((s: number, r: any) => s + (r.quantidade || 0), 0),
    [records, isExternalRecord]
  );
  const productiveCount = useMemo(
    () => records.filter((r: any) => getParentCatName(r) === "Produtivo").reduce((s: number, r: any) => s + (r.quantidade || 0), 0),
    [records, getParentCatName]
  );
  const supplementaryCount = useMemo(
    () => records.filter((r: any) => getParentCatName(r) === "Suplementar").reduce((s: number, r: any) => s + (r.quantidade || 0), 0),
    [records, getParentCatName]
  );
  const unproductiveCount = useMemo(
    () => records.filter((r: any) => getParentCatName(r) === "Não Produtivo").reduce((s: number, r: any) => s + (r.quantidade || 0), 0),
    [records, getParentCatName]
  );
  // Adjusted productivity: excludes external non-productive
  const controllableTotal = totalSamples - externalCount;
  const productivePercent = controllableTotal > 0 ? Math.round((productiveCount / controllableTotal) * 100) : 0;
  const efficiencyPercent = (productiveCount + supplementaryCount) > 0 ? Math.round((productiveCount / (productiveCount + supplementaryCount)) * 100) : 0;
  const unproductivePercent = controllableTotal > 0 ? Math.round((unproductiveCount / controllableTotal) * 100) : 0;
  const externalPercent = totalSamples > 0 ? Math.round((externalCount / totalSamples) * 100) : 0;

  // ── Chart data ─────────────────────────────────────────────────

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = { Produtivo: 0, Suplementar: 0, "Não Produtivo": 0, "Não Produtivo Externo": 0 };
    records.forEach((r: any) => {
      const cat = getParentCatName(r);
      if (totals[cat] !== undefined) totals[cat] += r.quantidade || 0;
    });
    return Object.entries(totals).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [records, getParentCatName]);

  // External causes chart data
  const externalCausas = useMemo(() => {
    const totals: Record<string, number> = {};
    const hoursSet: Record<string, Set<string>> = {};
    const totalHoursSet = new Set<string>();
    records.forEach((r: any) => {
      if (!isExternalRecord(r)) return;
      const desc = r.descricao || "Sem descrição";
      totals[desc] = (totals[desc] || 0) + (r.quantidade || 0);
      if (!hoursSet[desc]) hoursSet[desc] = new Set();
      const key = `${r.data}_${r.horario}`;
      hoursSet[desc].add(key);
      totalHoursSet.add(key);
    });
    const sorted = Object.entries(totals)
      .map(([name, value]) => ({ name, value, hours: hoursSet[name]?.size || 0 }))
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, c) => s + c.value, 0);
    return sorted.map(item => ({
      ...item,
      percent: total > 0 ? +((item.value / total) * 100).toFixed(1) : 0,
      _totalHours: totalHoursSet.size,
    }));
  }, [records, isExternalRecord]);


  // 5) Causas de Não Produtividade — includes Suplementar + Não Produtivo
  const nonprodCausas = useMemo(() => {
    const totals: Record<string, { value: number; cat: string }> = {};
    records.forEach((r: any) => {
      const cat = getParentCatName(r);
      if (cat !== "Não Produtivo" && cat !== "Suplementar") return;
      const desc = r.descricao || "Sem descrição";
      if (!totals[desc]) totals[desc] = { value: 0, cat };
      totals[desc].value += r.quantidade || 0;
    });
    const sorted = Object.entries(totals)
      .map(([name, { value, cat }]) => ({ name, value, cat }))
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, c) => s + c.value, 0);
    let cumulative = 0;
    return sorted.map(item => {
      cumulative += item.value;
      return {
        ...item,
        percent: total > 0 ? +((item.value / total) * 100).toFixed(1) : 0,
        cumPercent: total > 0 ? +((cumulative / total) * 100).toFixed(1) : 0,
      };
    });
  }, [records, getParentCatName]);

  // Pareto data
  const paretoData = useMemo(() => {
    const totals: Record<string, number> = {};
    records.forEach((r: any) => {
      let key: string;
      if (paretoMode === "especialidade") key = (r.especialidades as any)?.nome || "Sem especialidade";
      else if (paretoMode === "funcao") key = (r as any).funcoes?.nome || "Sem função";
      else key = r.descricao || "Sem descrição";
      totals[key] = (totals[key] || 0) + (r.quantidade || 0);
    });
    const sorted = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const total = sorted.reduce((s, c) => s + c.value, 0);
    let cumulative = 0;
    return sorted.slice(0, 10).map((item) => {
      cumulative += item.value;
      return {
        ...item,
        percent: total > 0 ? Math.round((item.value / total) * 100) : 0,
        cumPercent: total > 0 ? +((cumulative / total) * 100).toFixed(1) : 0,
      };
    });
  }, [records, paretoMode]);

  // By Contrato — with description breakdown for tooltip
  const byObra = useMemo(() => {
    const result: Record<string, { productive: number; supplementary: number; unproductive: number; external: number; descByCategory: Record<string, Record<string, number>> }> = {};
    records.forEach((r: any) => {
      const oName = (r.obras as any)?.nome || "Sem contrato";
      if (!result[oName]) result[oName] = { productive: 0, supplementary: 0, unproductive: 0, external: 0, descByCategory: { Produtivo: {}, Suplementar: {}, "Não Produtivo": {}, "Não Produtivo Externo": {} } };
      const cat = getParentCatName(r);
      const qty = r.quantidade || 0;
      const desc = r.descricao || "Sem descrição";
      if (cat === "Produtivo") result[oName].productive += qty;
      else if (cat === "Suplementar") result[oName].supplementary += qty;
      else if (cat === "Não Produtivo Externo") result[oName].external += qty;
      else result[oName].unproductive += qty;
      if (result[oName].descByCategory[cat]) {
        result[oName].descByCategory[cat][desc] = (result[oName].descByCategory[cat][desc] || 0) + qty;
      }
    });
    return Object.entries(result)
      .map(([name, v]) => {
        const controllable = v.productive + v.supplementary + v.unproductive;
        const total = controllable + v.external;
        return {
          name, total,
          productive: controllable > 0 ? +((v.productive / controllable) * 100).toFixed(1) : 0,
          supplementary: controllable > 0 ? +((v.supplementary / controllable) * 100).toFixed(1) : 0,
          unproductive: controllable > 0 ? +((v.unproductive / controllable) * 100).toFixed(1) : 0,
          prodPercent: controllable > 0 ? Math.round((v.productive / controllable) * 100) : 0,
          rawProd: v.productive, rawSupl: v.supplementary, rawNprod: v.unproductive, rawExternal: v.external,
          descByCategory: v.descByCategory,
        };
      })
      .sort((a, b) => b.prodPercent - a.prodPercent);
  }, [records, getParentCatName]);




  // By Specialty — sorted by productivity desc
  const bySpecialty = useMemo(() => {
    const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
    records.forEach((r: any) => {
      if (isExternalRecord(r)) return; // Exclude NPE from specialty productivity
      const sName = (r.especialidades as any)?.nome || "Sem especialidade";
      if (!result[sName]) result[sName] = { productive: 0, supplementary: 0, unproductive: 0 };
      const cat = getParentCatName(r);
      if (cat === "Produtivo") result[sName].productive += r.quantidade || 0;
      else if (cat === "Suplementar") result[sName].supplementary += r.quantidade || 0;
      else result[sName].unproductive += r.quantidade || 0;
    });
    return Object.entries(result)
      .filter(([_, v]) => v.productive + v.supplementary + v.unproductive > 0)
      .map(([name, v]) => {
        const total = v.productive + v.supplementary + v.unproductive;
        return {
          name, total,
          productive: total > 0 ? +((v.productive / total) * 100).toFixed(1) : 0,
          supplementary: total > 0 ? +((v.supplementary / total) * 100).toFixed(1) : 0,
          unproductive: total > 0 ? +((v.unproductive / total) * 100).toFixed(1) : 0,
        };
      })
      .sort((a, b) => b.productive - a.productive);
  }, [records, getParentCatName, isExternalRecord]);

  // By Function — sorted by productivity desc
  const byFunction = useMemo(() => {
    const result: Record<string, { productive: number; supplementary: number; unproductive: number }> = {};
    records.forEach((r: any) => {
      if (isExternalRecord(r)) return; // Exclude NPE from function productivity
      const fName = (r as any).funcoes?.nome || "Sem função";
      if (!result[fName]) result[fName] = { productive: 0, supplementary: 0, unproductive: 0 };
      const cat = getParentCatName(r);
      if (cat === "Produtivo") result[fName].productive += r.quantidade || 0;
      else if (cat === "Suplementar") result[fName].supplementary += r.quantidade || 0;
      else result[fName].unproductive += r.quantidade || 0;
    });
    return Object.entries(result)
      .filter(([_, v]) => v.productive + v.supplementary + v.unproductive > 0)
      .map(([name, v]) => {
        const total = v.productive + v.supplementary + v.unproductive;
        return {
          name, total,
          productive: total > 0 ? +((v.productive / total) * 100).toFixed(1) : 0,
          supplementary: total > 0 ? +((v.supplementary / total) * 100).toFixed(1) : 0,
          unproductive: total > 0 ? +((v.unproductive / total) * 100).toFixed(1) : 0,
        };
      })
      .sort((a, b) => b.productive - a.productive);
  }, [records, getParentCatName, isExternalRecord]);

  // 6) By Time — chronological order
  const byTime = useMemo(() => {
    const result: Record<string, { total: number; productive: number; supplementary: number; unproductive: number }> = {};
    records.forEach((r: any) => {
      if (isExternalRecord(r)) return; // Exclude NPE from time-based productivity
      const t = r.horario || "";
      if (!result[t]) result[t] = { total: 0, productive: 0, supplementary: 0, unproductive: 0 };
      const qty = r.quantidade || 0;
      result[t].total += qty;
      const cat = getParentCatName(r);
      if (cat === "Produtivo") result[t].productive += qty;
      else if (cat === "Suplementar") result[t].supplementary += qty;
      else result[t].unproductive += qty;
    });
    return Object.entries(result)
      .sort(([a], [b]) => timeIndex(a) - timeIndex(b))
      .map(([time, v]) => ({ time, ...v }));
  }, [records, getParentCatName, isExternalRecord]);

  // ── Click handlers ─────────────────────────────────────────────
  const handleContratoClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("contrato", e.activePayload[0].payload.name);
  };


  const handleSpecialtyClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("especialidade", e.activePayload[0].payload.name);
  };
  const handleTimeClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("horario", e.activePayload[0].payload.time);
  };
  const handleParetoClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("pareto", e.activePayload[0].payload.name);
  };
  const handleFunctionClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("funcao", e.activePayload[0].payload.name);
  };
  const handlePieClick = (_: any, index: number) => {
    const entry = categoryTotals[index];
    if (entry) toggleCrossFilter("categoria", entry.name);
  };
  const handleCausaClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("descricao", e.activePayload[0].payload.name);
  };
  const handleNonprodClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("descricao", e.activePayload[0].payload.name);
  };

  // ── Export ─────────────────────────────────────────────────────
  const exportToExcel = () => {
    import("xlsx").then((XLSX) => {
      const exportData = records.map((r: any) => ({
        Data: r.data, Horário: r.horario,
        Contrato: (r.obras as any)?.nome || "",
        Rota: (r.rotas as any)?.nome || "",
        Especialidade: (r.especialidades as any)?.nome || "",
        Função: (r as any).funcoes?.nome || "",
        Categoria: getParentCatName(r),
        Descrição: r.descricao,
        Quantidade: r.quantidade,
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
      XLSX.writeFile(wb, `dashboard_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    });
  };

  const exportToPDF = () => window.print();

  // ── AI Report ──────────────────────────────────────────────────
  const aiStats = useMemo(() => {
    const total = records.reduce((s: number, r: any) => s + (r.quantidade || 0), 0);
    let prod = 0, supl = 0, naoProd = 0;
    const byEsp: Record<string, { prod: number; total: number }> = {};
    const byCat: Record<string, number> = {};
    records.forEach((r: any) => {
      const qty = r.quantidade || 0;
      const cat = getParentCatName(r);
      if (cat === "Produtivo") prod += qty;
      else if (cat === "Suplementar") supl += qty;
      else naoProd += qty;
      const espName = (r.especialidades as any)?.nome || "Sem especialidade";
      if (!byEsp[espName]) byEsp[espName] = { prod: 0, total: 0 };
      byEsp[espName].total += qty;
      if (cat === "Produtivo") byEsp[espName].prod += qty;
      byCat[r.descricao || "Sem descrição"] = (byCat[r.descricao || "Sem descrição"] || 0) + qty;
    });
    const porEspecialidade = Object.entries(byEsp)
      .sort(([, a], [, b]) => b.total - a.total).slice(0, 8)
      .map(([nome, v]) => `${nome}: ${v.total} amostras (${v.total > 0 ? Math.round((v.prod / v.total) * 100) : 0}% produtivo)`)
      .join("\n");
    const topCategorias = Object.entries(byCat)
      .sort(([, a], [, b]) => b - a).slice(0, 8)
      .map(([nome, qty]) => `${nome}: ${qty} amostras`).join("\n");
    const obraName = obraFilter === "all" ? "Todos os contratos" : obras.find(o => o.id === obraFilter)?.nome || "";
    return {
      totalAmostras: total, produtivo: prod, suplementar: supl, naoProdutivo: naoProd,
      produtivoPct: total > 0 ? Math.round((prod / total) * 100) : 0,
      suplementarPct: total > 0 ? Math.round((supl / total) * 100) : 0,
      naoProdutivoPct: total > 0 ? Math.round((naoProd / total) * 100) : 0,
      periodo: dateMode === "day" ? selectedDate : dateMode === "period" ? `${startDate} a ${endDate}` : "Todo o período",
      obra: obraName, porEspecialidade, topCategorias,
    };
  }, [records, getParentCatName, obraFilter, obras, dateMode, selectedDate, startDate, endDate]);

  const handleGenerateAIReport = async () => {
    if (records.length === 0) {
      toast({ title: "Sem dados", description: "Nenhuma observação encontrada para o período selecionado.", variant: "destructive" });
      return;
    }
    setIsGeneratingReport(true);
    setAiReport("");
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ type: "report", context: aiStats }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        toast({ title: resp.status === 429 ? "Limite atingido" : resp.status === 402 ? "Créditos insuficientes" : "Erro", description: err.error, variant: "destructive" });
        return;
      }
      if (!resp.body) throw new Error("Sem resposta da IA");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const { done: sd, value } = await reader.read();
        if (sd) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) setAiReport((prev) => prev + content);
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setIsGeneratingReport(false);
      setAiReportExpanded(true);
    }
  };

  const formatAIReport = (text: string) =>
    text.split("\n").map((line, i) => {
      if (line.startsWith("## ") || line.startsWith("# "))
        return <h2 key={i} className="text-base font-bold text-foreground mt-5 mb-2">{line.replace(/^#+\s*/, "").replace(/\*\*/g, "")}</h2>;
      if (line.startsWith("**") && line.endsWith("**"))
        return <h3 key={i} className="font-semibold text-foreground mt-4 mb-1">{line.replace(/\*\*/g, "")}</h3>;
      if (line.startsWith("- ") || line.startsWith("• "))
        return <li key={i} className="ml-4 text-sm text-foreground/80 list-disc">{line.replace(/^[-•]\s*/, "")}</li>;
      if (line.trim() === "") return <br key={i} />;
      const parts = line.split(/\*\*([^*]+)\*\*/g);
      return (
        <p key={i} className="text-sm text-foreground/80 leading-relaxed">
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
        </p>
      );
    });

  const chartCardClass = (filterKey: keyof CrossFilters) =>
    `stat-card animate-fade-in mb-6 transition-all ${crossFilters[filterKey] ? "ring-2 ring-primary/50" : ""}`;

  const paretoLabel = paretoMode === "especialidade" ? "Especialidades" : paretoMode === "funcao" ? "Funções" : "Categorias";

  // ── Custom tooltip for Contrato chart ──────────────────────────
  const ContratoTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    const categories = ["Produtivo", "Suplementar", "Não Produtivo", "Não Produtivo Externo"] as const;
    const rawKeys = { Produtivo: "rawProd", Suplementar: "rawSupl", "Não Produtivo": "rawNprod", "Não Produtivo Externo": "rawExternal" } as const;
    return (
      <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 220, maxWidth: 300 }}>
        <strong style={{ fontSize: 13, marginBottom: 8, display: "block" }}>{data.name}</strong>
        <div style={{ fontSize: 11, marginBottom: 4 }}>Total: <strong>{data.total} amostras</strong></div>
        {categories.map(cat => {
          const raw = data[rawKeys[cat]] || 0;
          if (raw === 0) return null;
          const pct = data.total > 0 ? ((raw / data.total) * 100).toFixed(1) : "0";
          const descs = data.descByCategory?.[cat] as Record<string, number> | undefined;
          const topDescs = descs ? Object.entries(descs).sort(([,a],[,b]) => b - a).slice(0, 3) : [];
          return (
            <div key={cat} style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ color: CATEGORY_COLORS[cat] || "#64748B", fontWeight: 600 }}>
                {cat} — {pct}% ({raw})
                {cat === "Não Produtivo Externo" && <span style={{ fontSize: 9, opacity: 0.7 }}> (não impacta prod.)</span>}
              </div>
              {topDescs.length > 0 && (
                <div style={{ marginLeft: 8, marginTop: 2, fontSize: 10, opacity: 0.8 }}>
                  {topDescs.map(([desc, qty]) => (
                    <div key={desc}>• {desc}: {qty}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header + Filters */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard de Produtividade</h1>
            <p className="text-sm text-muted-foreground mt-1">Painel analítico de produtividade industrial — MEGASTEAM</p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex gap-2 items-end flex-wrap">
              <div>
                <Label className="text-xs text-muted-foreground">Atalhos</Label>
                <div className="flex gap-1 mt-1">
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={() => applyQuickFilter("today")}>Hoje</Button>
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={() => applyQuickFilter("week")}>Semana</Button>
                  <Button variant="outline" size="sm" className="h-10 px-3 text-xs" onClick={() => applyQuickFilter("month")}>Mês</Button>
                  {dateMode !== "all" && (
                    <Button variant="ghost" size="sm" className="h-10 px-2 text-xs text-muted-foreground" onClick={() => setDateMode("all")}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Período</Label>
                <Select value={dateMode} onValueChange={(v) => setDateMode(v as any)}>
                  <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="day">Dia</SelectItem>
                    <SelectItem value="period">Período</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dateMode === "day" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Data</Label>
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-40 mt-1" />
                </div>
              )}
              {dateMode === "period" && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Início</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40 mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Fim</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40 mt-1" />
                  </div>
                </>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contrato</Label>
              <Select value={obraFilter} onValueChange={setObraFilter}>
                <SelectTrigger className="w-48 mt-1"><SelectValue placeholder="Filtrar por Contrato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Contratos</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportToPDF} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Active cross-filters bar */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 animate-fade-in">
            <span className="text-xs font-semibold text-muted-foreground">Filtros ativos:</span>
            {crossFilters.categoria && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("categoria", crossFilters.categoria!)}>
                Categoria: {crossFilters.categoria} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.contrato && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("contrato", crossFilters.contrato!)}>
                Contrato: {crossFilters.contrato} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.rota && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("rota", crossFilters.rota!)}>
                Rota: {crossFilters.rota} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.especialidade && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("especialidade", crossFilters.especialidade!)}>
                Especialidade: {crossFilters.especialidade} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.horario && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("horario", crossFilters.horario!)}>
                Horário: {crossFilters.horario} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.funcao && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("funcao", crossFilters.funcao!)}>
                Função: {crossFilters.funcao} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.descricao && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("descricao", crossFilters.descricao!)}>
                Descrição: {crossFilters.descricao} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.pareto && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("pareto", crossFilters.pareto!)}>
                Pareto ({paretoLabel}): {crossFilters.pareto} <X className="w-3 h-3" />
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs h-6 px-2">
              Limpar todos
            </Button>
          </div>
        )}

        {/* 7) Strategic KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          <StatCard title="Total de Amostras" value={totalSamples} subtitle="Observações registradas" icon={Users} />
          <StatCard title="Produtividade" value={`${productivePercent}%`} subtitle={`Prod / (Total - Externo) = ${productiveCount}/${controllableTotal}`} icon={TrendingUp} variant="success" />
          <StatCard title="Suplementar" value={supplementaryCount} subtitle={`${controllableTotal > 0 ? Math.round((supplementaryCount / controllableTotal) * 100) : 0}% (s/ NPE)`} icon={Clock} variant="warning" />
          <StatCard title="Não Produtivo" value={unproductiveCount} subtitle={`${unproductivePercent}% (s/ NPE)`} icon={AlertTriangle} variant="danger" />
          <StatCard title="Não Prod. Externo" value={externalCount} subtitle={`${externalPercent}% do total — não penaliza`} icon={CloudRain} />
        </div>

        {/* AI Analysis Section */}
        <div className="stat-card animate-fade-in mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Análise Inteligente</h3>
                <p className="text-[11px] text-muted-foreground">A IA analisa os dados do período atual e gera insights acionáveis</p>
              </div>
            </div>
            <Button onClick={handleGenerateAIReport} disabled={isGeneratingReport || records.length === 0} size="sm" className="gap-2">
              {isGeneratingReport ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> {aiReport ? "Atualizar Análise" : "Gerar Análise com IA"}</>
              )}
            </Button>
          </div>
          {(aiReport || isGeneratingReport) && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Análise gerada — {aiStats.periodo} {aiStats.obra && `• ${aiStats.obra}`}</span>
                {isGeneratingReport && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                {!isGeneratingReport && aiReport && (
                  <button onClick={() => setAiReportExpanded((v) => !v)} className="ml-auto flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium">
                    {aiReportExpanded ? <><ChevronUp className="w-4 h-4" /> Recolher</> : <><ChevronDown className="w-4 h-4" /> Expandir</>}
                  </button>
                )}
              </div>
              {aiReportExpanded && <div className="prose prose-sm max-w-none">{formatAIReport(aiReport)}</div>}
              {isGeneratingReport && !aiReport && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Analisando dados...</div>
              )}
            </div>
          )}
          {records.length === 0 && <p className="text-xs text-muted-foreground mt-3">Selecione um período com dados para habilitar a análise.</p>}
        </div>

        {/* 2) Visão Geral por Contrato — enhanced tooltip */}
        <div className={chartCardClass("contrato")}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Visão Geral por Contrato
            {crossFilters.contrato && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.contrato}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Clique em uma barra para filtrar • Passe o mouse para detalhes</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byObra} margin={{ bottom: 20 }} onClick={handleContratoClick}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: TICK_COLOR }} angle={-15} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ContratoTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#F9FAFB" }} />
              <Bar dataKey="productive" name="Produtivo" fill="#16A34A" stackId="a" className="cursor-pointer" />
              <Bar dataKey="supplementary" name="Suplementar" fill="#F59E0B" stackId="a" className="cursor-pointer" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="#DC2626" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer">
                <LabelList dataKey="prodPercent" position="top" formatter={(v: number) => `${v}% prod`} style={{ fontSize: 10, fill: TICK_COLOR }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Row: Pie + Pareto */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Distribution Pie */}
          <div className={`stat-card animate-fade-in transition-all ${crossFilters.categoria ? "ring-2 ring-primary/50" : ""}`}>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Distribuição por Categoria
              {crossFilters.categoria && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.categoria}</span>}
            </h3>
            <p className="text-[10px] text-muted-foreground mb-2">Clique em uma fatia para filtrar</p>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categoryTotals} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={renderPieLabel} labelLine={false} onClick={handlePieClick}>
                  {categoryTotals.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#666"} className="cursor-pointer"
                      opacity={crossFilters.categoria && crossFilters.categoria !== entry.name ? 0.3 : 1}
                      stroke={crossFilters.categoria === entry.name ? "#1E3A5F" : "none"}
                      strokeWidth={crossFilters.categoria === entry.name ? 3 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={{ color: "#F9FAFB" }} formatter={(value: number) => {
                  const total = categoryTotals.reduce((s, c) => s + c.value, 0);
                  return [`${value} (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, "Amostras"];
                }} />
                <Legend wrapperStyle={{ fontSize: "12px", color: "#F9FAFB" }} formatter={(value: string) => <span className="text-muted-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Pareto — configurable */}
          <div className={`stat-card animate-fade-in transition-all ${crossFilters.pareto ? "ring-2 ring-primary/50" : ""}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Top Causas (Pareto)
                  {crossFilters.pareto && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.pareto}</span>}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Clique em uma barra para filtrar</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground mr-1">Por:</span>
                {(["categoria", "especialidade", "funcao"] as ParetoMode[]).map(mode => (
                  <button key={mode} onClick={() => handleParetoModeChange(mode)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                      paretoMode === mode ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {mode === "categoria" ? "Categorias" : mode === "especialidade" ? "Especialidades" : "Funções"}
                  </button>
                ))}
              </div>
            </div>
            {paretoData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[240px] text-center gap-2">
                <BarChart3 className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Sem dados para o Pareto</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={paretoData} layout="vertical" margin={{ left: 10, right: 60 }} onClick={handleParetoClick}>
                   <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                   <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: TICK_COLOR }} />
                   <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 10, fill: TICK_COLOR }}
                     tickFormatter={(v: string) => v.length > 22 ? v.substring(0, 22) + "…" : v} />
                   <YAxis yAxisId="right" hide />
                   <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={{ color: "#F9FAFB" }} formatter={(value: number, name: string, entry: any) => {
                     if (name === "% Acumulado") return [`${value}%`, name];
                     return [`${value}% (${entry.payload.value} amostras)`, "Amostras"];
                   }} />
                   <Bar dataKey="percent" name="Amostras" radius={[0, 4, 4, 0]} className="cursor-pointer">
                     {paretoData.map((item, i) => (
                       <Cell key={i} fill={paretoMode === "especialidade" ? getSpecialtyColor(item.name) : PIE_COLORS[i % PIE_COLORS.length]}
                         opacity={crossFilters.pareto && crossFilters.pareto !== item.name ? 0.3 : 1} />
                     ))}
                     <LabelList dataKey="percent" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: TICK_COLOR }} />
                   </Bar>
                   <Line yAxisId="right" type="monotone" dataKey="cumPercent" name="% Acumulado" stroke="#DC2626" strokeWidth={2} dot={{ r: 3, fill: "#DC2626" }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>


        {/* 3) Produtividade por Especialidade */}
        <div className={chartCardClass("especialidade")}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Produtividade por Especialidade
            {crossFilters.especialidade && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.especialidade}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Ordenado por produtividade (maior → menor) — clique para filtrar</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
            {[
              { name: "Elétrica", color: "#2563EB" },
              { name: "Instrumentação", color: "#B91C1C" },
              { name: "Mecânica", color: "#047857" },
              { name: "Caldeiraria/Solda", color: "#1F2937" },
              { name: "Andaime", color: "#9CA3AF" },
              { name: "Civil", color: "#EAB308" },
              { name: "Isolamento", color: "#7C3AED" },
              { name: "Pintura", color: "#EC4899" },
              { name: "Equip./Elevação", color: "#38BDF8" },
              { name: "Lubrificação", color: "#22C55E" },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm shrink-0 border border-border" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={bySpecialty} margin={{ bottom: 20 }} onClick={handleSpecialtyClick}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: TICK_COLOR }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0]?.payload;
                  if (!data) return null;
                  const total = data.total || 0;
                  const prod = total > 0 ? Math.round(data.productive * total / 100) : 0;
                  const supl = total > 0 ? Math.round(data.supplementary * total / 100) : 0;
                  const nprod = total > 0 ? Math.round(data.unproductive * total / 100) : 0;
                  const isBest = bySpecialty.length > 0 && data.name === bySpecialty[0]?.name;
                  const isWorst = bySpecialty.length > 1 && data.name === bySpecialty[bySpecialty.length - 1]?.name;
                  return (
                    <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 200, borderLeft: isBest ? "3px solid #16A34A" : isWorst ? "3px solid #DC2626" : undefined }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: getSpecialtyColor(data.name), display: "inline-block", border: "1px solid rgba(255,255,255,0.2)" }} />
                        <strong style={{ fontSize: 13 }}>{data.name}</strong>
                        {isBest && <span style={{ fontSize: 10, color: "#4ADE80", fontWeight: 600 }}>★ Melhor</span>}
                        {isWorst && <span style={{ fontSize: 10, color: "#F87171", fontWeight: 600 }}>⚠ Pior</span>}
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                        <div>Total: <strong>{total} amostras</strong></div>
                        <div style={{ color: "#4ADE80" }}>Produtivo: {data.productive}% ({prod})</div>
                        <div style={{ color: "#FBBF24" }}>Suplementar: {data.supplementary}% ({supl})</div>
                        <div style={{ color: "#F87171" }}>Não Produtivo: {data.unproductive}% ({nprod})</div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#F9FAFB" }} />
              <Bar dataKey="productive" name="Produtivo" fill="#16A34A" stackId="a" className="cursor-pointer" />
              <Bar dataKey="supplementary" name="Suplementar" fill="#F59E0B" stackId="a" className="cursor-pointer" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="#DC2626" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 4) Produtividade por Função */}
        <div className={`stat-card animate-fade-in mb-6 transition-all ${crossFilters.funcao ? "ring-2 ring-primary/50" : ""}`}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Produtividade por Função
            {crossFilters.funcao && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.funcao}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Ordenado por produtividade — clique para filtrar</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={byFunction} margin={{ bottom: 20 }} onClick={handleFunctionClick}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: TICK_COLOR }} angle={-25} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0]?.payload;
                  if (!data) return null;
                  const total = data.total || 0;
                  const prod = total > 0 ? Math.round(data.productive * total / 100) : 0;
                  const supl = total > 0 ? Math.round(data.supplementary * total / 100) : 0;
                  const nprod = total > 0 ? Math.round(data.unproductive * total / 100) : 0;
                  return (
                    <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 200 }}>
                      <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{data.name}</strong>
                      <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                        <div>Total: <strong>{total} amostras</strong></div>
                        <div style={{ color: "#4ADE80" }}>Produtivo: {data.productive}% ({prod})</div>
                        <div style={{ color: "#FBBF24" }}>Suplementar: {data.supplementary}% ({supl})</div>
                        <div style={{ color: "#F87171" }}>Não Produtivo: {data.unproductive}% ({nprod})</div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#F9FAFB" }} />
              <Bar dataKey="productive" name="Produtivo" fill="#16A34A" stackId="a" className="cursor-pointer" />
              <Bar dataKey="supplementary" name="Suplementar" fill="#F59E0B" stackId="a" className="cursor-pointer" />
              <Bar dataKey="unproductive" name="Não Produtivo" fill="#DC2626" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 5) Causas de Não Produtividade */}
        <div className="mb-8">
          {/* 5) Causas de Não Produtividade */}
          <div className={`stat-card animate-fade-in transition-all`}>
            <h3 className="text-sm font-semibold text-foreground mb-4">Causas de Não Produtividade</h3>
            <p className="text-[10px] text-muted-foreground mb-2">Registros "Suplementar" e "Não Produtivo" — clique para filtrar</p>
            {nonprodCausas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[240px] text-center gap-2">
                <BarChart3 className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Sem registros de não produtividade</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={nonprodCausas} margin={{ left: 10, right: 10, bottom: 60 }} onClick={handleNonprodClick}>
                   <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                   <XAxis dataKey="name" tick={(props: any) => {
                     const { x, y, payload } = props;
                     return (
                       <text x={x} y={y + 10} textAnchor="end" fill={TICK_COLOR} fontSize={9} transform={`rotate(-45, ${x}, ${y})`}>
                         {payload.value.length > 20 ? payload.value.slice(0, 20) + "…" : payload.value}
                       </text>
                     );
                   }} interval={0} height={80} />
                   <YAxis tick={{ fontSize: 11, fill: TICK_COLOR }} />
                   <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: TICK_COLOR }} domain={[0, 100]} unit="%" />
                   <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={{ color: "#F9FAFB" }} formatter={(value: number, name: string) => {
                     if (name === "% Acumulado") return [`${value}%`, name];
                     const item = nonprodCausas.find(c => c.value === value);
                     return [`${value} amostras (${item?.percent || 0}%) — ${item?.cat || ""}`, ""];
                   }} />
                   <Bar dataKey="value" name="Amostras" radius={[4, 4, 0, 0]} className="cursor-pointer">
                     {nonprodCausas.map((item, i) => (
                       <Cell key={i} fill={item.cat === "Não Produtivo" ? "#DC2626" : "#F59E0B"} />
                     ))}
                     <LabelList dataKey="percent" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 9, fill: TICK_COLOR }} />
                   </Bar>
                   <Line yAxisId="right" type="monotone" dataKey="cumPercent" name="% Acumulado" stroke="#2563EB" strokeWidth={2} dot={{ r: 3, fill: "#2563EB" }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <div className="flex items-center gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#F59E0B" }} /><span className="text-[10px] text-muted-foreground">Suplementar</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#DC2626" }} /><span className="text-[10px] text-muted-foreground">Não Produtivo</span></div>
            </div>
          </div>
        </div>

        {/* Causas Externas de Parada */}
        {externalCausas.length > 0 && (
          <div className="stat-card animate-fade-in mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-muted-foreground" />
              Causas Externas de Parada
            </h3>
            <p className="text-[10px] text-muted-foreground mb-3">Eventos fora do controle da equipe — NÃO impactam o cálculo de produtividade</p>
            
            {/* Summary: total lost hours */}
            {(() => {
              const totalHours = externalCausas.length > 0 ? externalCausas[0]._totalHours : 0;
              return (
                <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-semibold text-foreground">
                      {totalHours} hora{totalHours !== 1 ? "s" : ""} perdida{totalHours !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Baseado em <strong className="text-blue-500">{totalHours} horário{totalHours !== 1 ? "s" : ""}</strong> com registros de causas externas
                  </span>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {externalCausas.map((causa: any, i: number) => {
                const PIE_COLORS = ["#16A34A", "#2563EB", "#7C3AED", "#F59E0B", "#EC4899", "#059669"];
                return (
                  <div key={causa.name} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{causa.name}</p>
                      <p className="text-[10px] text-muted-foreground">{causa.value} amostras · {causa.hours}h perdida{causa.hours !== 1 ? "s" : ""} · {causa.percent}%</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={externalCausas}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, payload, x, y, textAnchor }: any) => (
                    <text x={x} y={y} textAnchor={textAnchor} fill="#F9FAFB" fontSize={12} fontWeight={500}>
                      {name} ({payload.percent.toFixed(1)}%)
                    </text>
                  )}
                  labelLine={{ stroke: "#6B7280" }}
                >
                  {externalCausas.map((_: any, i: number) => {
                    const PIE_COLORS = ["#16A34A", "#2563EB", "#7C3AED", "#F59E0B", "#EC4899", "#059669"];
                    return <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />;
                  })}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={{ color: "#F9FAFB" }} formatter={(value: number, name: string, entry: any) => [
                  `${value} amostras · ${entry.payload.hours}h perdida${entry.payload.hours !== 1 ? "s" : ""} · ${entry.payload.percent}%`, "Causa externa"
                ]} />
                <Legend
                  wrapperStyle={{ fontSize: "12px", color: "#F9FAFB" }}
                  formatter={(value: string) => {
                    const item = externalCausas.find((c: any) => c.name === value);
                    return `${value} — ${item?.percent ?? 0}%`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 6) Amostras por Horário — chronological + stacked */}
        <div className={chartCardClass("horario")}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Amostras por Horário
            {crossFilters.horario && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.horario}</span>}
          </h3>
          <p className="text-[10px] text-muted-foreground mb-2">Ordenação cronológica — clique para filtrar</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byTime} onClick={handleTimeClick}>
               <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
               <XAxis dataKey="time" tick={{ fontSize: 11, fill: TICK_COLOR }} />
               <YAxis tick={{ fontSize: 11, fill: TICK_COLOR }} />
               <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={{ color: "#F9FAFB" }} formatter={(value: number, name: string) => [`${value}`, name]} />
               <Legend wrapperStyle={{ fontSize: "12px", color: "#F9FAFB" }} />
               <Bar dataKey="productive" name="Produtivo" fill="#16A34A" stackId="a" className="cursor-pointer" />
               <Bar dataKey="supplementary" name="Suplementar" fill="#F59E0B" stackId="a" className="cursor-pointer" />
               <Bar dataKey="unproductive" name="Não Produtivo" fill="#DC2626" stackId="a" radius={[4, 4, 0, 0]} className="cursor-pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppLayout>
  );
}
