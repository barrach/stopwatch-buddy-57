import { useMemo, useState, useCallback } from "react"; // refreshed-v2
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
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
import { Download, X, Sparkles, Loader2, FileText, ChevronDown, ChevronUp, TrendingUp, CloudRain, Presentation, Trophy } from "lucide-react";
import { ChartZoomDialog, ZoomButton } from "@/components/ChartZoomDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { normalizeDescriptionName } from "@/lib/categoryNormalization";
import { LegendTooltip } from "@/components/LegendTooltip";

// ── Color constants (BI-grade palette) ───────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: "#2563EB",
  Suplementar: "#16A34A",
  "Não Produtivo": "#DC2626",
  "Não Produtivo Externo": "#F97316",
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

// ── Canonical stacking order (bottom → top) — FIXED for all charts ──
// Full order including NPE (used for Contrato chart)
const CANONICAL_ORDER_FULL: string[] = [
  // Produtivo
  "Trabalhando",
  "Planejando",
  // Suplementar
  "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta",
  "Transitando no local de trabalho - sem ferramenta",
  "Transitando fora do local de trabalho - com ferramenta",
  "Transitando fora do local de trabalho - sem ferramenta",
  "Assistindo / Stand By",
  "Aguardando Liberação de PT",
  // Não Produtivo
  "Pessoal",
  "Ocioso",
  // Não Produtivo Externo
  "Interferências Operacionais",
  "Fatores Climáticos e Consequências",
];
// All charts now use the full order including NPE descriptions
const CANONICAL_ORDER: string[] = [...CANONICAL_ORDER_FULL];

// ── Per-description unique colors (engessadas) ──────────
const DESCRIPTION_COLORS: Record<string, string> = {
  "Trabalhando": "#2563EB",
  "Planejando": "#60A5FA",
  "Aguardando Ferramenta ou Material": "#4ADE80",
  "Transitando no local de trabalho - com ferramenta": "#22C55E",
  "Transitando no local de trabalho - sem ferramenta": "#16A34A",
  "Transitando fora do local de trabalho - com ferramenta": "#65A30D",
  "Transitando fora do local de trabalho - sem ferramenta": "#84CC16",
  "Assistindo / Stand By": "#15803D",
  "Assistindo": "#15803D",
  "Aguardando Movimentação de Carga": "#15803D",
  "Aguardando movimentação de carga": "#15803D",
  "Aguardando Liberação de PT": "#34D399",
  "Interferências Operacionais": "#C8A882",
  "Vazamento / Interferência da Planta": "#C8A882",
  "Pessoal": "#EF4444",
  "Ocioso": "#DC2626",
  // NPE extras
  "Fatores Climáticos e Consequências": "#F97316",
  "Causas Naturais": "#F97316",
  // Legacy
  "Aguardando Instruções": "#16A34A",
  "Preparando, Organizando": "#65A30D",
  "Retrabalho": "#9F1239",
  "Deslocamento": "#B91C1C",
};

// Display name normalization — renames legacy names for UI
const DISPLAY_NAME_MAP: Record<string, string> = {
  "Aguardando Movimentação de Carga": "Assistindo / Stand By",
  "Aguardando movimentação de carga": "Assistindo / Stand By",
};
const displayName = (desc: string): string => normalizeDescriptionName(desc);
const canonicalDescription = (desc: string): string => displayName(desc);

// Map description to its unique color — single source of truth for ALL charts
const getDescColor = (desc: string): string => {
  const normalized = displayName(desc);
  if (DESCRIPTION_COLORS[normalized]) return DESCRIPTION_COLORS[normalized];
  if (DESCRIPTION_COLORS[desc]) return DESCRIPTION_COLORS[desc];
  for (const [key, color] of Object.entries(DESCRIPTION_COLORS)) {
    if (desc.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#6B7280";
};
// Legend text color: use gray for white items so text is readable
const getLegendTextColor = (desc: string): string => {
  const c = getDescColor(desc);
  return c === "#FFFFFF" || c === "#C8A882" ? "#9CA3AF" : c;
};
const getDescriptionCategoryColor = (cat: string, descricao?: string): string => {
  if (descricao) return getDescColor(descricao);
  return CATEGORY_COLORS[cat] || "#6B7280";
};

// Determine if a color is "light" (needs dark text for contrast)
const isLightColor = (hex: string): boolean => {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
};

const STACKED_CHART_HEIGHT = 600;
const STACKED_CHART_MARGIN = { top: 50, right: 12, bottom: 20, left: 0 };
const ZOOM_STACKED_CHART_MARGIN = { top: 44, right: 20, bottom: 30, left: 0 };

const DESCRIPTION_GROUPS = {
  Produtivo: ["Trabalhando", "Planejando"],
  Suplementar: [
    "Aguardando Ferramenta ou Material",
    "Transitando no local de trabalho - com ferramenta",
    "Transitando no local de trabalho - sem ferramenta",
    "Transitando fora do local de trabalho - com ferramenta",
    "Transitando fora do local de trabalho - sem ferramenta",
    "Assistindo / Stand By",
    "Aguardando Liberação de PT",
  ],
  "Não Produtivo": ["Pessoal", "Ocioso"],
  "Não Produtivo Externo": ["Interferências Operacionais", "Fatores Climáticos e Consequências"],
} as const;

const DESCRIPTION_GROUP_ORDER = Object.keys(DESCRIPTION_GROUPS) as Array<keyof typeof DESCRIPTION_GROUPS>;

const getDescriptionGroup = (desc: string): keyof typeof DESCRIPTION_GROUPS => {
  const normalized = displayName(desc);
  for (const group of DESCRIPTION_GROUP_ORDER) {
    if ((DESCRIPTION_GROUPS[group] as readonly string[]).includes(normalized)) return group;
  }
  return "Suplementar";
};

const BarPercentLabel = (props: any & { labelKey?: string }) => {
  const { x, y, width, height, value, fill } = props;
  const numVal = Number(value);
  if (value === undefined || value === null || numVal === 0 || !width) return null;

  const h = Math.max(Number(height) || 0, 1);
  const w = Math.max(Number(width) || 0, 1);
  const label = numVal.toFixed(1) + "%";

  // Always place label centered inside the segment, regardless of size
  const textColor = fill && isLightColor(fill) ? "#1F2937" : "#FFFFFF";
  const fontSize = h >= 16 ? Math.min(11, h * 0.55) : 7.5;

  return (
    <text
      x={x + w / 2}
      y={y + h / 2}
      fill={textColor}
      fontSize={fontSize}
      fontWeight={700}
      textAnchor="middle"
      dominantBaseline="middle"
      paintOrder="stroke"
      stroke={textColor === "#FFFFFF" ? "rgba(17,24,39,0.5)" : "rgba(255,255,255,0.7)"}
      strokeWidth={h >= 16 ? 2.5 : 2}
      style={{ pointerEvents: "none" }}
    >
      {label}
    </text>
  );
};

const renderLegendList = (descriptions: string[], tooltipMap?: Record<string, string>) => {
  // Keep the legend vertically aligned with the visual stack order on screen.
  // Bars are rendered bottom→top, so the legend must be shown top→bottom.
  const legendOrder = [...descriptions].reverse();

  return (
    <div
      className="flex flex-col justify-start gap-[5px] overflow-y-auto pr-1"
      style={{
        height: STACKED_CHART_HEIGHT - STACKED_CHART_MARGIN.top - STACKED_CHART_MARGIN.bottom,
        marginTop: STACKED_CHART_MARGIN.top,
        marginBottom: STACKED_CHART_MARGIN.bottom,
      }}
    >
      {legendOrder.map((desc) => (
        <LegendTooltip key={desc} name={displayName(desc)} description={tooltipMap?.[desc] || tooltipMap?.[displayName(desc)]}>
          <div className="flex items-center gap-2">
            <span className="w-[10px] h-[10px] rounded-sm shrink-0 border border-border/50" style={{ backgroundColor: getDescColor(desc) }} />
            <span className="text-[14px] leading-normal" style={{ color: getLegendTextColor(desc) }}>{displayName(desc)}</span>
          </div>
        </LegendTooltip>
      ))}
    </div>
  );
};

// Helper: render Bar components from a description list with proper stroke for white bars
const renderStackedBars = (descriptions: string[], isLast?: (i: number) => boolean) =>
  descriptions.map((desc, i) => {
    const color = getDescColor(desc);
    const isWhite = color === "#FFFFFF";
    return (
      <Bar
        key={desc}
        dataKey={desc}
        name={displayName(desc)}
        fill={color}
        stackId="a"
        className="cursor-pointer"
        stroke={isWhite ? "#D1D5DB" : undefined}
        strokeWidth={isWhite ? 1 : undefined}
        radius={(isLast ? isLast(i) : i === descriptions.length - 1) ? [4, 4, 0, 0] : undefined}
      >
        <LabelList dataKey={desc} content={(props: any) => <BarPercentLabel {...props} labelKey={desc} />} />
      </Bar>
    );
  });

const tooltipStyle: React.CSSProperties = {
  background: "#111827", border: "1px solid #374151",
  borderRadius: "8px", color: "#F9FAFB", fontSize: "12px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
};
const tooltipLabelStyle: React.CSSProperties = { color: "#F9FAFB" };

const TICK_COLOR = "#9CA3AF";
const GRID_COLOR = "#374151";

const renderCategoryPieLabel = ({ cx, cy, midAngle, outerRadius, percent }: any) => {
  const safePercent = Number((percent * 100).toFixed(1));
  if (safePercent <= 0) return null;

  const radius = (outerRadius || 0) + 18;
  const radians = Math.PI / 180;
  const x = cx + radius * Math.cos(-midAngle * radians);
  const y = cy + radius * Math.sin(-midAngle * radians);
  const textAnchor = x > cx ? "start" : "end";

  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      fill="hsl(var(--foreground))"
      fontSize={11}
      fontWeight={700}
      stroke="hsl(var(--background))"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {safePercent.toFixed(1)}%
    </text>
  );
};

const renderExternalPieLabel = ({ cx, cy, midAngle, outerRadius, name, value, payload }: any) => {
  // Use the pre-calculated percent from our data (already in 0-100 range)
  // Recharts' own `percent` prop gets overridden by our data's `percent` field
  const dataPercent = payload?.percent;
  if (!dataPercent || dataPercent <= 0) return null;

  const radius = (outerRadius || 0) + 22;
  const radians = Math.PI / 180;
  const x = cx + radius * Math.cos(-midAngle * radians);
  const y = cy + radius * Math.sin(-midAngle * radians);
  const textAnchor = x > cx ? "start" : "end";

  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      fill="hsl(var(--foreground))"
      fontSize={11}
      fontWeight={700}
      stroke="hsl(var(--background))"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {`${name} ${dataPercent}%`}
    </text>
  );
};

// ── Auto-highlight helpers (Power BI style) ──────────────────────
const getHighlightBorder = (type: "best" | "worst" | "none") => {
  if (type === "best") return "ring-2 ring-green-500/50 shadow-green-500/10 shadow-lg";
  if (type === "worst") return "ring-2 ring-red-500/50 shadow-red-500/10 shadow-lg";
  return "";
};

type TimeViewMode = "horario" | "diasemana" | "mes";

interface CrossFilters {
  categoria?: string;
  rota?: string;
  especialidade?: string;
  contrato?: string;
  tempo?: string;
  tempoMode?: TimeViewMode;
  descricao?: string;
  pareto?: string;
}

const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Chronological time ordering helper — parses "8:00" or "08:00" to minutes
const timeIndex = (t: string) => {
  const parts = t.split(":");
  if (parts.length < 2) return 9999;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
};

const getTimeBucketLabel = (record: any, mode: TimeViewMode) => {
  if (mode === "horario") return record.horario || "";
  const d = new Date(`${record.data}T12:00:00`);
  if (mode === "diasemana") return WEEKDAY_NAMES[d.getDay()] || "";
  return MONTH_NAMES[d.getMonth()] || "";
};

export default function Dashboard() {
  const isMobileView = useIsMobile();
  const { toast } = useToast();
  const { user } = useAuth();
  const [obraFilter, setObraFilter] = useState("all");
  const [aiReport, setAiReport] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReportExpanded, setAiReportExpanded] = useState(false);
  const [dateMode, setDateMode] = useState<"all" | "day" | "period">("all");
  const [timeViewMode, setTimeViewMode] = useState<"horario" | "diasemana" | "mes">("horario");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [zoomChart, setZoomChart] = useState<string | null>(null);
  const [npeExclude, setNpeExclude] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingPPTX, setIsGeneratingPPTX] = useState(false);
  const canExportPPTX = user?.email === "michel.zabalia@megasteam.com.br";

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
  const paretoMode = "categoria" as const;

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
        .select("*, rotas(nome), especialidades(nome), categorias_observacao(nome, categoria_pai_id, impacta_produtividade), obras(nome)")
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

  // Fetch ALL categories (parents + subcategories) so we can build a complete NPE lookup
  const { data: allCats = [] } = useQuery({
    queryKey: ["categorias_observacao", "all_with_impact"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_observacao").select("id, nome, descricao, categoria_pai_id, impacta_produtividade");
      if (error) throw error;
      return data;
    },
  });

  // Map description names → their descricao text for legend tooltips
  const descriptionTooltipMap = useMemo(() => {
    const map: Record<string, string> = {};
    allCats.forEach((c: any) => {
      if (c.nome && c.descricao) map[c.nome] = c.descricao;
    });
    return map;
  }, [allCats]);

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

  // Build a set of NPE description names from subcategories under NPE parent
  const npeDescriptions = useMemo(() => {
    const npeParentIds = new Set(parentCats.filter((c: any) => c.impacta_produtividade === false).map(c => c.id));
    const descs = new Set<string>();
    allCats.forEach((c: any) => {
      if (c.impacta_produtividade === false || (c.categoria_pai_id && npeParentIds.has(c.categoria_pai_id))) {
        descs.add(c.nome);
      }
    });
    return descs;
  }, [allCats, parentCats]);

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
    // Fallback: check description against known NPE subcategory names
    if (r.descricao && npeDescriptions.has(r.descricao)) return true;
    return false;
  }, [parentCatImpactMap, npeDescriptions]);

  // ── Filtering ──────────────────────────────────────────────────
  // Pre-NPE filter: used to compute available NPE options
  const preNpeRecords = useMemo(() => {
    let filtered = obraFilter === "all" ? allRecords : allRecords.filter((r: any) => r.obra_id === obraFilter);
    if (dateMode === "day") {
      filtered = filtered.filter((r: any) => r.data === selectedDate);
    } else if (dateMode === "period") {
      filtered = filtered.filter((r: any) => r.data >= startDate && r.data <= endDate);
    }
    return filtered;
  }, [allRecords, obraFilter, dateMode, selectedDate, startDate, endDate]);

  // Apply global NPE exclusion filter
  const baseRecords = useMemo(() => {
    if (!npeExclude) return preNpeRecords;
    return preNpeRecords.filter((r: any) => {
      if (!isExternalRecord(r)) return true;
      return canonicalDescription(r.descricao || "Sem descrição") !== npeExclude;
    });
  }, [preNpeRecords, npeExclude, isExternalRecord]);

  const records = useMemo(() => {
    return baseRecords.filter((r: any) => {
      if (crossFilters.categoria && getParentCatName(r) !== crossFilters.categoria) return false;
      if (crossFilters.rota && ((r.rotas as any)?.nome || "Sem rota") !== crossFilters.rota) return false;
      if (crossFilters.especialidade && ((r.especialidades as any)?.nome || "Sem especialidade") !== crossFilters.especialidade) return false;
      if (crossFilters.contrato && ((r.obras as any)?.nome || "Sem contrato") !== crossFilters.contrato) return false;
      if (crossFilters.tempo) {
        const bucket = getTimeBucketLabel(r, crossFilters.tempoMode || "horario");
        if (bucket !== crossFilters.tempo) return false;
      }
      if (crossFilters.descricao && r.descricao !== crossFilters.descricao) return false;
      if (crossFilters.pareto) {
        if (r.descricao !== crossFilters.pareto) return false;
      }
      return true;
    });
  }, [baseRecords, crossFilters, getParentCatName]);

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
  // Global productivity: NPE included in denominator
  // Largest-remainder method to guarantee sum = 100%
  const efficiencyPercent = (productiveCount + supplementaryCount) > 0 ? Math.round((productiveCount / (productiveCount + supplementaryCount)) * 100) : 0;
  const [productivePercent, supplementaryPercent, unproductivePercent, externalPercent] = useMemo(() => {
    if (totalSamples === 0) return [0, 0, 0, 0];
    const counts = [productiveCount, supplementaryCount, unproductiveCount, externalCount];
    const rawPercents = counts.map(c => (c / totalSamples) * 100);
    const floored = rawPercents.map(p => Math.floor(p));
    let remainder = 100 - floored.reduce((a, b) => a + b, 0);
    const decimals = rawPercents.map((p, i) => ({ i, d: p - floored[i] })).sort((a, b) => b.d - a.d);
    for (const item of decimals) {
      if (remainder <= 0) break;
      floored[item.i]++;
      remainder--;
    }
    return floored as [number, number, number, number];
  }, [totalSamples, productiveCount, supplementaryCount, unproductiveCount, externalCount]);

  // ── Chart data ─────────────────────────────────────────────────

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = { Produtivo: 0, Suplementar: 0, "Não Produtivo": 0, "Não Produtivo Externo": 0 };
    records.forEach((r: any) => {
      const cat = getParentCatName(r);
      if (totals[cat] !== undefined) totals[cat] += r.quantidade || 0;
    });
    return Object.entries(totals).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [records, getParentCatName]);

  // External causes chart data — includes NPE + "Aguardando Liberação de PT" (Suplementar, shown for operational visibility)
  const externalCausas = useMemo(() => {
    const AG_PT = "Aguardando Liberação de PT";
    const totals: Record<string, number> = {};
    const hoursSet: Record<string, Set<string>> = {};
    const totalHoursSet = new Set<string>();
    records.forEach((r: any) => {
      const desc = canonicalDescription(r.descricao || "Sem descrição");
      const isNPE = isExternalRecord(r);
      const isAgPT = desc === AG_PT;
      if (!isNPE && !isAgPT) return;
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

  // Pareto data — percentages over TOTAL samples (including NPE) for consistency with KPIs
  const paretoData = useMemo(() => {
    const totals: Record<string, number> = {};
    records.forEach((r: any) => {
      const key = canonicalDescription(r.descricao || "Sem descrição");
      totals[key] = (totals[key] || 0) + (r.quantidade || 0);
    });
    const sorted = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    // Use totalSamples (all records including NPE) as denominator
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

  // By Contrato — description-level breakdown
  // Descriptions for non-external charts (exclude all NPE descriptions)
  // Sort by category group: Produtivo → Suplementar → Não Produtivo
  // Build ordered description lists strictly from canonical order
  // Only include descriptions that exist in the data, but always in canonical order
  const allDescriptions = useMemo(() => CANONICAL_ORDER_FULL, []);

  // All charts now use the full description list including Causas Naturais
  const nonNpeDescriptions = useMemo(() => CANONICAL_ORDER_FULL, []);

  const byObra = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    records.forEach((r: any) => {
      const oName = (r.obras as any)?.nome || "Sem contrato";
      if (!result[oName]) {
        result[oName] = Object.fromEntries(CANONICAL_ORDER_FULL.map((desc) => [desc, 0]));
      }
      const desc = canonicalDescription(r.descricao || "Sem descrição");
      const qty = r.quantidade || 0;
      if (desc in result[oName]) {
        result[oName][desc] = (result[oName][desc] || 0) + qty;
      }
    });
    return Object.entries(result)
      .map(([name, descs]) => {
        const total = Object.values(descs).reduce((s, v) => s + v, 0);
        const row: any = { name, total };
        for (const desc of CANONICAL_ORDER_FULL) {
          const qty = descs[desc] || 0;
          row[desc] = total > 0 ? +((qty / total) * 100).toFixed(1) : 0;
          row[`raw_${desc}`] = qty;
        }
        return row;
      })
      .sort((a, b) => {
        const aProd = a["Trabalhando"] || 0;
        const bProd = b["Trabalhando"] || 0;
        return bProd - aProd;
      });
  }, [records]);

  // NPE descriptions for comparison button
  // Compute available NPE options from pre-filter data so they remain visible
  const npeDescList = useMemo(() => {
    const descs = new Set<string>();
    preNpeRecords.forEach((r: any) => {
      if (isExternalRecord(r)) descs.add(canonicalDescription(r.descricao || ""));
    });
    return CANONICAL_ORDER_FULL.filter((desc) => descs.has(desc) && desc === "Fatores Climáticos e Consequências");
  }, [preNpeRecords, isExternalRecord]);




  // By Specialty — description-level breakdown, sorted by "Trabalhando" (productivity) desc
  const bySpecialty = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    records.forEach((r: any) => {
      const normalizedDesc = canonicalDescription(r.descricao || "Sem descrição");
      // Allow all NPE descriptions through
      const sName = (r.especialidades as any)?.nome || "Sem especialidade";
      if (!result[sName]) {
        result[sName] = Object.fromEntries(CANONICAL_ORDER_FULL.map((desc) => [desc, 0]));
      }
      const desc = canonicalDescription(r.descricao || "Sem descrição");
      const qty = r.quantidade || 0;
      if (desc in result[sName]) {
        result[sName][desc] = (result[sName][desc] || 0) + qty;
      }
    });
    return Object.entries(result)
      .filter(([_, descs]) => Object.values(descs).reduce((s, v) => s + v, 0) > 0)
      .map(([name, descs]) => {
        const total = Object.values(descs).reduce((s, v) => s + v, 0);
        const row: any = { name, total };
        for (const desc of CANONICAL_ORDER_FULL) {
          const qty = descs[desc] || 0;
          row[desc] = total > 0 ? +((qty / total) * 100).toFixed(1) : 0;
          row[`raw_${desc}`] = qty;
        }
        return row;
      })
      .sort((a, b) => (b["Trabalhando"] || 0) - (a["Trabalhando"] || 0));
  }, [records, isExternalRecord]);
  

  // 6) By Time — productivity % breakdown, supports horario/weekday/month
  const byTimeGrouped = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    records.forEach((r: any) => {
      const normalizedDesc = canonicalDescription(r.descricao || "Sem descrição");
      // Allow all NPE descriptions through

      const key = getTimeBucketLabel(r, timeViewMode);
      if (!key) return;

      if (!result[key]) {
        result[key] = Object.fromEntries(CANONICAL_ORDER_FULL.map((desc) => [desc, 0]));
      }

      const desc = canonicalDescription(r.descricao || "Sem descrição");
      const qty = r.quantidade || 0;
      if (desc in result[key]) {
        result[key][desc] = (result[key][desc] || 0) + qty;
      }
    });

    const entries = Object.entries(result);
    if (timeViewMode === "horario") {
      entries.sort(([a], [b]) => timeIndex(a) - timeIndex(b));
    } else if (timeViewMode === "diasemana") {
      entries.sort(([a], [b]) => WEEKDAY_NAMES.indexOf(a) - WEEKDAY_NAMES.indexOf(b));
    } else {
      entries.sort(([a], [b]) => MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b));
    }

    return entries.map(([label, descs]) => {
      const total = Object.values(descs).reduce((s, v) => s + v, 0);
      const row: any = { time: label, total };
      for (const desc of CANONICAL_ORDER_FULL) {
        const qty = descs[desc] || 0;
        row[desc] = total > 0 ? +((qty / total) * 100).toFixed(1) : 0;
        row[`raw_${desc}`] = qty;
      }
      return row;
    });
  }, [records, isExternalRecord, timeViewMode]);


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
    const bucket = e.activePayload[0].payload.time;
    setCrossFilters((prev) => ({
      ...prev,
      tempo: prev.tempo === bucket && prev.tempoMode === timeViewMode ? undefined : bucket,
      tempoMode: prev.tempo === bucket && prev.tempoMode === timeViewMode ? undefined : timeViewMode,
    }));
  };
  const handleParetoClick = (e: any) => {
    if (!e?.activePayload?.[0]?.payload) return;
    toggleCrossFilter("pareto", e.activePayload[0].payload.name);
  };
  const handlePieClick = (_: any, index: number) => {
    const entry = categoryTotals[index];
    if (entry) toggleCrossFilter("categoria", entry.name);
  };
  const handleCausaClick = (e: any) => {
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

  const exportToPDF = async () => {
    if (records.length === 0) {
      toast({ title: "Sem dados", description: "Nenhuma observação encontrada para o período.", variant: "destructive" });
      return;
    }
    setIsGeneratingPDF(true);
    toast({ title: "Capturando gráficos...", description: "Aguarde enquanto os gráficos são capturados e a IA analisa os dados." });

    try {
      // 1) Capture charts from DOM
      const { captureAllCharts } = await import("@/lib/chartCapture");
      const { images: chartImages, dimensions: chartDimensions } = await captureAllCharts(setTimeViewMode, timeViewMode);

      toast({ title: "Gerando análise IA...", description: "Os gráficos foram capturados. Gerando relatório." });

      // 2) Generate AI analysis
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let aiText = "";

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ type: "pdf-report", context: aiStats }),
      });

      if (resp.ok && resp.body) {
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
              if (content) aiText += content;
            } catch { /* ignore */ }
          }
        }
      }

      // 3) Generate PDF
      const { generatePDFReport } = await import("@/lib/pdfReport");
      // Compute time data for all 3 modes for PDF legends
      const computeTimeData = (mode: "horario" | "diasemana" | "mes") => {
        const result: Record<string, Record<string, number>> = {};
        records.forEach((r: any) => {
          const normalizedDesc = canonicalDescription(r.descricao || "Sem descrição");
          if (isExternalRecord(r) && !["Interferências Operacionais", "Fatores Climáticos e Consequências"].includes(normalizedDesc)) return;
          let key = "";
          if (mode === "horario") {
            key = r.horario || "";
          } else if (mode === "diasemana") {
            const d = new Date(r.data + "T12:00:00");
            key = WEEKDAY_NAMES[d.getDay()];
          } else {
            const d = new Date(r.data + "T12:00:00");
            key = MONTH_NAMES[d.getMonth()];
          }
          if (!result[key]) {
            result[key] = Object.fromEntries(CANONICAL_ORDER_FULL.map((desc) => [desc, 0]));
          }
          const desc = canonicalDescription(r.descricao || "Sem descrição");
          const qty = r.quantidade || 0;
          if (desc in result[key]) {
            result[key][desc] = (result[key][desc] || 0) + qty;
          }
        });
        const entries = Object.entries(result);
        if (mode === "horario") entries.sort(([a], [b]) => timeIndex(a) - timeIndex(b));
        else if (mode === "diasemana") entries.sort(([a], [b]) => WEEKDAY_NAMES.indexOf(a) - WEEKDAY_NAMES.indexOf(b));
        else entries.sort(([a], [b]) => MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b));
        return entries.map(([label, descs]) => {
          const total = Object.values(descs).reduce((s, v) => s + v, 0);
          const row: any = { time: label, total };
          for (const desc of CANONICAL_ORDER_FULL) {
            const qty = descs[desc] || 0;
            row[desc] = total > 0 ? +((qty / total) * 100).toFixed(1) : 0;
            row[`raw_${desc}`] = qty;
          }
          return row;
        });
      };

      toast({ title: "Montando PDF...", description: "Gerando o documento final." });
      await generatePDFReport({
        periodo: aiStats.periodo,
        obra: aiStats.obra,
        totalAmostras: aiStats.totalAmostras,
        totalControlaveis: aiStats.totalControlaveis,
        produtivo: aiStats.produtivo,
        suplementar: aiStats.suplementar,
        naoProdutivo: aiStats.naoProdutivo,
        externo: aiStats.externo,
        produtivoPct: aiStats.produtivoPct,
        suplementarPct: aiStats.suplementarPct,
        naoProdutivoPct: aiStats.naoProdutivoPct,
        externoPct: aiStats.externoPct,
        byObra,
        bySpecialty,
        byTimeHorario: computeTimeData("horario"),
        byTimeDiaSemana: computeTimeData("diasemana"),
        byTimeMes: computeTimeData("mes"),
        nonprodCausas,
        externalCausas,
        categoryTotals,
        aiAnalysis: aiText,
        chartImages,
        chartDimensions,
      });

      toast({ title: "PDF gerado!", description: "O relatório foi baixado com sucesso." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const exportToPPTX = async () => {
    if (records.length === 0) {
      toast({ title: "Sem dados", description: "Nenhuma observação encontrada para o período.", variant: "destructive" });
      return;
    }
    setIsGeneratingPPTX(true);
    toast({ title: "Capturando gráficos...", description: "Aguarde enquanto os gráficos são capturados e a IA analisa os dados." });

    try {
      // 1) Capture charts from DOM
      const { captureAllCharts } = await import("@/lib/chartCapture");
      const { images: chartImages, dimensions: chartDimensions } = await captureAllCharts(setTimeViewMode, timeViewMode);

      toast({ title: "Gerando análise IA...", description: "Os gráficos foram capturados. Gerando apresentação." });

      // 2) Generate AI analysis
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let aiText = "";

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ type: "pdf-report", context: aiStats }),
      });

      if (resp.ok && resp.body) {
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
              if (content) aiText += content;
            } catch { /* ignore */ }
          }
        }
      }

      // 3) Generate PPTX
      const { generatePPTXReport } = await import("@/lib/pptxReport");
      generatePPTXReport({
        periodo: aiStats.periodo,
        obra: aiStats.obra,
        totalAmostras: aiStats.totalAmostras,
        totalControlaveis: aiStats.totalControlaveis,
        produtivo: aiStats.produtivo,
        suplementar: aiStats.suplementar,
        naoProdutivo: aiStats.naoProdutivo,
        externo: aiStats.externo,
        produtivoPct: aiStats.produtivoPct,
        suplementarPct: aiStats.suplementarPct,
        naoProdutivoPct: aiStats.naoProdutivoPct,
        externoPct: aiStats.externoPct,
        byObra,
        bySpecialty,
        nonprodCausas,
        externalCausas,
        categoryTotals,
        aiAnalysis: aiText,
        chartImages,
        chartDimensions,
      });

      toast({ title: "Apresentação gerada!", description: "O arquivo PPTX foi baixado com sucesso." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PPTX", description: e.message, variant: "destructive" });
    } finally {
      setIsGeneratingPPTX(false);
    }
  };

  // ── AI Report ──────────────────────────────────────────────────
  const aiStats = useMemo(() => {
    let total = 0, prod = 0, supl = 0, naoProd = 0, externo = 0;
    const byEsp: Record<string, { prod: number; supl: number; naoProd: number; total: number }> = {};
    
    const byCat: Record<string, number> = {};
    const byParentCat: Record<string, number> = {};
    const byHour: Record<string, { prod: number; supl: number; naoProd: number; npe: number; total: number }> = {};
    const byWeekday: Record<string, { prod: number; supl: number; naoProd: number; npe: number; total: number }> = {};
    const byMonth: Record<string, { prod: number; supl: number; naoProd: number; npe: number; total: number }> = {};
    const WEEKDAY_LABELS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    records.forEach((r: any) => {
      const qty = r.quantidade || 0;
      total += qty;
      const cat = getParentCatName(r);
      const isExt = isExternalRecord(r);

      if (isExt) {
        externo += qty;
      } else if (cat === "Produtivo") {
        prod += qty;
      } else if (cat === "Suplementar") {
        supl += qty;
      } else if (cat === "Não Produtivo") {
        naoProd += qty;
      }

      // Track parent category
      byParentCat[cat] = (byParentCat[cat] || 0) + qty;

      // Per specialty (exclude external)
      if (!isExt) {
        const espName = (r.especialidades as any)?.nome || "Sem especialidade";
        if (!byEsp[espName]) byEsp[espName] = { prod: 0, supl: 0, naoProd: 0, total: 0 };
        byEsp[espName].total += qty;
        if (cat === "Produtivo") byEsp[espName].prod += qty;
        else if (cat === "Suplementar") byEsp[espName].supl += qty;
        else byEsp[espName].naoProd += qty;
      }


      // Per hour
      const h = r.horario || "";
      if (!byHour[h]) byHour[h] = { prod: 0, supl: 0, naoProd: 0, npe: 0, total: 0 };
      byHour[h].total += qty;
      if (isExt) byHour[h].npe += qty;
      else if (cat === "Produtivo") byHour[h].prod += qty;
      else if (cat === "Suplementar") byHour[h].supl += qty;
      else if (cat === "Não Produtivo") byHour[h].naoProd += qty;

      // Per weekday
      const dateObj = new Date(r.data + "T12:00:00");
      const wdKey = WEEKDAY_LABELS[dateObj.getDay()];
      if (!byWeekday[wdKey]) byWeekday[wdKey] = { prod: 0, supl: 0, naoProd: 0, npe: 0, total: 0 };
      byWeekday[wdKey].total += qty;
      if (isExt) byWeekday[wdKey].npe += qty;
      else if (cat === "Produtivo") byWeekday[wdKey].prod += qty;
      else if (cat === "Suplementar") byWeekday[wdKey].supl += qty;
      else if (cat === "Não Produtivo") byWeekday[wdKey].naoProd += qty;

      // Per month
      const mKey = MONTH_LABELS[dateObj.getMonth()];
      if (!byMonth[mKey]) byMonth[mKey] = { prod: 0, supl: 0, naoProd: 0, npe: 0, total: 0 };
      byMonth[mKey].total += qty;
      if (isExt) byMonth[mKey].npe += qty;
      else if (cat === "Produtivo") byMonth[mKey].prod += qty;
      else if (cat === "Suplementar") byMonth[mKey].supl += qty;
      else if (cat === "Não Produtivo") byMonth[mKey].naoProd += qty;

      // Description breakdown
      byCat[r.descricao || "Sem descrição"] = (byCat[r.descricao || "Sem descrição"] || 0) + qty;
    });

    // Global total — NPE included in denominator

    // Build porEspecialidade from the SAME data as the bySpecialty chart
    // Each specialty row has description-level % (e.g. "Trabalhando": 25.5)
    // We derive Produtivo = Trabalhando + Planejando, matching the chart exactly
    const espChartData: Record<string, Record<string, number>> = {};
    records.forEach((r: any) => {
      const sName = (r.especialidades as any)?.nome || "Sem especialidade";
      const desc = canonicalDescription(r.descricao || "Sem descrição");
      const qty = r.quantidade || 0;
      if (!espChartData[sName]) espChartData[sName] = { total: 0 };
      espChartData[sName].total = (espChartData[sName].total || 0) + qty;
      espChartData[sName][desc] = (espChartData[sName][desc] || 0) + qty;
    });

    const porEspecialidade = Object.entries(espChartData)
      .sort(([, a], [, b]) => b.total - a.total).slice(0, 8)
      .map(([nome, v]) => {
        const total = v.total || 0;
        const trabalhando = v["Trabalhando"] || 0;
        const planejando = v["Planejando"] || 0;
        const prodPct = total > 0 ? +((trabalhando / total) * 100).toFixed(1) : 0;
        const planPct = total > 0 ? +((planejando / total) * 100).toFixed(1) : 0;
        const prodTotal = total > 0 ? +((( trabalhando + planejando) / total) * 100).toFixed(1) : 0;
        return `${nome}: Produtividade ${prodTotal}% (Trabalhando ${prodPct}% + Planejando ${planPct}%)`;
      })
      .join("\n");


    const porHorario = Object.entries(byHour)
      .sort(([a], [b]) => timeIndex(a) - timeIndex(b))
      .map(([h, v]) => {
        const prodPct = v.total > 0 ? Math.round((v.prod / v.total) * 100) : 0;
        const suplPct = v.total > 0 ? Math.round((v.supl / v.total) * 100) : 0;
        const npPct = v.total > 0 ? Math.round((v.naoProd / v.total) * 100) : 0;
        const npePct = v.total > 0 ? Math.round((v.npe / v.total) * 100) : 0;
        return `${h}: Prod ${prodPct}%, Supl ${suplPct}%, NP ${npPct}%, NPE ${npePct}%`;
      })
      .join("\n");

    // topCategorias excludes NPE descriptions for the AI report
    const controlDescriptions: Record<string, number> = {};
    records.forEach((r: any) => {
      if (isExternalRecord(r)) return;
      const desc = r.descricao || "Sem descrição";
      controlDescriptions[desc] = (controlDescriptions[desc] || 0) + (r.quantidade || 0);
    });
    const topCategorias = Object.entries(controlDescriptions)
      .sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([nome, qty]) => `${nome}: ${qty} amostras`).join("\n");

    const causasExternas = Object.entries(byCat)
      .filter(([nome]) => {
        // Only external descriptions
        return records.some((r: any) => r.descricao === nome && isExternalRecord(r));
      })
      .sort(([, a], [, b]) => b - a)
      .map(([nome, qty]) => `${nome}: ${qty} amostras`)
      .join("\n");

    const obraName = obraFilter === "all" ? "Todos os contratos" : obras.find(o => o.id === obraFilter)?.nome || "";

    return {
      totalAmostras: total,
      totalControlaveis: total, // NPE now included in global calculation
      produtivo: prod,
      suplementar: supl,
      naoProdutivo: naoProd,
      externo,
      // Global percentages — NPE included in denominator
      produtivoPct: total > 0 ? Math.round((prod / total) * 100) : 0,
      suplementarPct: total > 0 ? Math.round((supl / total) * 100) : 0,
      naoProdutivoPct: total > 0 ? Math.round((naoProd / total) * 100) : 0,
      externoPct: total > 0 ? Math.round((externo / total) * 100) : 0,
      periodo: dateMode === "day" ? selectedDate : dateMode === "period" ? `${startDate} a ${endDate}` : "Todo o período",
      obra: obraName,
      porEspecialidade,
      
      porHorario,
      porDiaSemana: ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"]
        .filter(d => byWeekday[d])
        .map(d => {
          const v = byWeekday[d];
          const pPct = v.total > 0 ? Math.round((v.prod / v.total) * 100) : 0;
          const sPct = v.total > 0 ? Math.round((v.supl / v.total) * 100) : 0;
          const nPct = v.total > 0 ? Math.round((v.naoProd / v.total) * 100) : 0;
          const npePct = v.total > 0 ? Math.round((v.npe / v.total) * 100) : 0;
          return `${d}: Produtividade ${pPct}%, Suplementar ${sPct}%, Não Produtivo ${nPct}%, NPE ${npePct}%`;
        }).join("\n") || "Não disponível",
      porMes: MONTH_LABELS
        .filter(m => byMonth[m])
        .map(m => {
          const v = byMonth[m];
          const pPct = v.total > 0 ? Math.round((v.prod / v.total) * 100) : 0;
          return `${m}: Produtividade ${pPct}%`;
        }).join("\n") || "Não disponível",
      topCategorias,
      causasExternas,
    };
  }, [records, getParentCatName, isExternalRecord, obraFilter, obras, dateMode, selectedDate, startDate, endDate]);

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

  

  // ── Custom tooltip for Contrato chart ──────────────────────────
  const ContratoTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const hovered = payload.find((p: any) => p?.dataKey && p?.payload);
    const item = hovered || payload[0];
    const data = item?.payload;
    if (!data || !item) return null;

    const desc = item.dataKey as string;
    const pct = typeof item.value === "number" ? item.value : data[desc] || 0;

    return (
      <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 180 }}>
        <strong style={{ fontSize: 13, marginBottom: 8, display: "block" }}>{data.name}</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, lineHeight: 1.8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.fill || DESCRIPTION_COLORS[desc] || "#6B7280", flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{desc}</span>
          <span style={{ fontWeight: 600 }}>{pct}%</span>
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header + Filters */}
        <div className="mb-6 md:mb-8">
          <div className="mb-4">
            <h1 className="text-lg md:text-2xl font-bold text-foreground">Dashboard de Produtividade</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Painel analítico — MEGASTEAM</p>
          </div>
          <div className="flex flex-wrap gap-2 md:gap-3 items-end">
            <div className="flex gap-1 items-end flex-wrap">
              <div>
                <Label className="text-[10px] md:text-xs text-muted-foreground">Atalhos</Label>
                <div className="flex gap-1 mt-1">
                  <Button variant="outline" size="sm" className="h-8 md:h-10 px-2 md:px-3 text-[10px] md:text-xs" onClick={() => applyQuickFilter("today")}>Hoje</Button>
                  <Button variant="outline" size="sm" className="h-8 md:h-10 px-2 md:px-3 text-[10px] md:text-xs" onClick={() => applyQuickFilter("week")}>Semana</Button>
                  <Button variant="outline" size="sm" className="h-8 md:h-10 px-2 md:px-3 text-[10px] md:text-xs" onClick={() => applyQuickFilter("month")}>Mês</Button>
                  {dateMode !== "all" && (
                    <Button variant="ghost" size="sm" className="h-8 md:h-10 px-2 text-xs text-muted-foreground" onClick={() => setDateMode("all")}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-[10px] md:text-xs text-muted-foreground">Período</Label>
                <Select value={dateMode} onValueChange={(v) => setDateMode(v as any)}>
                  <SelectTrigger className="w-24 md:w-32 mt-1 h-8 md:h-10 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="day">Dia</SelectItem>
                    <SelectItem value="period">Período</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dateMode === "day" && (
                <div>
                  <Label className="text-[10px] md:text-xs text-muted-foreground">Data</Label>
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-36 md:w-40 mt-1 h-8 md:h-10 text-xs" />
                </div>
              )}
              {dateMode === "period" && (
                <>
                  <div>
                    <Label className="text-[10px] md:text-xs text-muted-foreground">Início</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36 md:w-40 mt-1 h-8 md:h-10 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] md:text-xs text-muted-foreground">Fim</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36 md:w-40 mt-1 h-8 md:h-10 text-xs" />
                  </div>
                </>
              )}
            </div>
            <div>
              <Label className="text-[10px] md:text-xs text-muted-foreground">Contrato</Label>
              <Select value={obraFilter} onValueChange={setObraFilter}>
                <SelectTrigger className="w-40 md:w-48 mt-1 h-8 md:h-10 text-xs"><SelectValue placeholder="Filtrar por Contrato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Contratos</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {npeDescList.length > 0 && (
              <div>
                <Label className="text-[10px] md:text-xs text-muted-foreground">Fatores</Label>
                <Select value={npeExclude || "none"} onValueChange={(v) => setNpeExclude(v === "none" ? null : v)}>
                  <SelectTrigger className="w-48 md:w-64 mt-1 h-8 md:h-10 text-xs"><SelectValue placeholder="Fatores" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Com todos os fatores</SelectItem>
                    {npeDescList.map(d => <SelectItem key={d} value={d}>Sem {d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1 h-8 md:h-10 text-[10px] md:text-xs px-2 md:px-3">
                <Download className="w-3 h-3 md:w-3.5 md:h-3.5" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportToPDF} disabled={isGeneratingPDF} className="gap-1 h-8 md:h-10 text-[10px] md:text-xs px-2 md:px-3">
                {isGeneratingPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 md:w-3.5 md:h-3.5" />} PDF
              </Button>
              {canExportPPTX && (
                <Button variant="outline" size="sm" onClick={exportToPPTX} disabled={isGeneratingPPTX} className="gap-1 h-8 md:h-10 text-[10px] md:text-xs px-2 md:px-3">
                  {isGeneratingPPTX ? <Loader2 className="w-3 h-3 animate-spin" /> : <Presentation className="w-3 h-3 md:w-3.5 md:h-3.5" />} PPTX
                </Button>
              )}
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
            {crossFilters.tempo && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setCrossFilters((prev) => ({ ...prev, tempo: undefined, tempoMode: undefined }))}>
                {crossFilters.tempoMode === "horario" ? "Horário" : crossFilters.tempoMode === "diasemana" ? "Dia" : "Mês"}: {crossFilters.tempo} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.descricao && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("descricao", crossFilters.descricao!)}>
                Descrição: {crossFilters.descricao} <X className="w-3 h-3" />
              </Badge>
            )}
            {crossFilters.pareto && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleCrossFilter("pareto", crossFilters.pareto!)}>
                Pareto: {crossFilters.pareto} <X className="w-3 h-3" />
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs h-6 px-2">
              Limpar todos
            </Button>
          </div>
        )}

        {/* 7) Strategic KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4 mb-6 md:mb-8">
          <StatCard title="Total de Amostras" value={totalSamples} icon={Users} />
          <StatCard title="Produtividade" value={`${productivePercent}%`} icon={TrendingUp} variant="success" />
          <StatCard title="Suplementar" value={`${supplementaryPercent}%`} icon={Clock} variant="warning" />
          <StatCard title="Não Produtivo" value={`${unproductivePercent}%`} icon={AlertTriangle} variant="danger" />
          <StatCard title="NPE (Externo)" value={`${externalPercent}%`} icon={CloudRain} variant="default" />
        </div>

        {/* Ranking de Produtividade por Especialidade */}
        {(() => {
          const rankData = bySpecialty
            .map((row: any) => ({
              nome: row.name,
              produtividade: +((row["Trabalhando"] || 0) + (row["Planejando"] || 0)).toFixed(1),
            }))
            .sort((a, b) => b.produtividade - a.produtividade || a.nome.localeCompare(b.nome))
            .slice(0, 3);

          const medals = [
            { emoji: "🥇", color: "#F59E0B", label: "1º" },
            { emoji: "🥈", color: "#9CA3AF", label: "2º" },
            { emoji: "🥉", color: "#92400E", label: "3º" },
          ];

          return rankData.length > 0 ? (
            <div className="stat-card animate-fade-in mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h3 className="text-sm font-semibold text-foreground">Ranking de Produtividade</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {rankData.map((item, idx) => (
                  <div
                    key={item.nome}
                    className="flex items-center gap-3 rounded-lg border border-border p-3 transition-all"
                    style={{
                      borderLeftWidth: 4,
                      borderLeftColor: medals[idx].color,
                      backgroundColor: idx === 0 ? "hsl(var(--accent) / 0.3)" : undefined,
                    }}
                  >
                    <span className="text-2xl">{medals[idx].emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`truncate ${idx === 0 ? "text-sm font-bold text-foreground" : "text-sm font-medium text-foreground/80"}`}>
                        {medals[idx].label} {item.nome}
                      </p>
                      <p className={`${idx === 0 ? "text-lg font-bold" : "text-base font-semibold"}`} style={{ color: medals[idx].color }}>
                        {item.produtividade.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null;
        })()}


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
        <div id="chart-contrato" className={chartCardClass("contrato")}>
          <div className="flex items-center justify-between mb-4">
            <div>
             <h3 className="text-sm font-semibold text-foreground">
                Visão Geral por Contrato
                {crossFilters.contrato && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.contrato}</span>}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Clique em uma barra para filtrar • Passe o mouse para detalhes</p>
            </div>
            <div className="flex items-center gap-2">
              <ZoomButton onClick={() => setZoomChart("contrato")} />
            </div>
          </div>
          <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
            <div className="min-w-0 flex-1">
              <ResponsiveContainer width="100%" height={isMobileView ? 350 : STACKED_CHART_HEIGHT}>
                <BarChart data={byObra} margin={{ ...STACKED_CHART_MARGIN, left: -10 }} barCategoryGap="14%" onClick={handleContratoClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: isMobileView ? 8 : 10, fill: TICK_COLOR }} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: isMobileView ? 9 : 11, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} width={35} />
                  <Tooltip content={<ContratoTooltip />} shared={false} />
                  {renderStackedBars(allDescriptions)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="shrink-0 lg:max-w-[28%]">
              <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-[5px]" style={{ paddingTop: isMobileView ? 0 : STACKED_CHART_MARGIN.top }}>
                {[...allDescriptions].reverse().map((desc) => (
                  <LegendTooltip key={desc} name={displayName(desc)} description={descriptionTooltipMap?.[desc] || descriptionTooltipMap?.[displayName(desc)]}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-[10px] h-[10px] rounded-sm shrink-0 border border-border/50" style={{ backgroundColor: getDescColor(desc) }} />
                      <span className="text-[11px] lg:text-[14px] leading-normal" style={{ color: getLegendTextColor(desc) }}>{displayName(desc)}</span>
                    </div>
                  </LegendTooltip>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Row: Pie + Pareto */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          {/* Distribution Pie */}
          <div id="chart-categoria" className={`stat-card animate-fade-in transition-all ${crossFilters.categoria ? "ring-2 ring-primary/50" : ""}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Distribuição por Categoria
                  {crossFilters.categoria && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.categoria}</span>}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Clique em uma fatia para filtrar</p>
              </div>
              <ZoomButton onClick={() => setZoomChart("categoria")} />
            </div>
            <ResponsiveContainer width="100%" height={isMobileView ? 250 : 320}>
              <PieChart>
                <Pie
                  data={categoryTotals}
                  cx="50%"
                  cy="50%"
                  innerRadius={isMobileView ? 40 : 60}
                  outerRadius={isMobileView ? 80 : 110}
                  paddingAngle={3}
                  dataKey="value"
                  labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                  onClick={handlePieClick}
                  label={renderCategoryPieLabel}
                >
                  {categoryTotals.map((entry) => {
                    const isWhite = CATEGORY_COLORS[entry.name] === "#FFFFFF";
                    return (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#666"} className="cursor-pointer"
                        opacity={crossFilters.categoria && crossFilters.categoria !== entry.name ? 0.3 : 1}
                        stroke={crossFilters.categoria === entry.name ? "#1E3A5F" : isWhite ? "#374151" : "none"}
                        strokeWidth={crossFilters.categoria === entry.name ? 3 : isWhite ? 2 : 0}
                      />
                    );
                  })}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0].payload;
                    const total = categoryTotals.reduce((s, c) => s + c.value, 0);
                    const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0";
                    return (
                      <div style={{ ...tooltipStyle, padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: CATEGORY_COLORS[entry.name] || "#666", display: "inline-block", flexShrink: 0 }} />
                          <span><strong>{entry.name}</strong>: {pct}%</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  content={() => (
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3">
                      {categoryTotals.filter(c => c.value > 0).map(cat => (
                        <div key={cat.name} className="flex items-center gap-1.5 cursor-pointer" onClick={() => toggleCrossFilter("categoria", cat.name)}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: CATEGORY_COLORS[cat.name] || "#666", display: "inline-block", flexShrink: 0 }} />
                          <span className="text-xs text-muted-foreground">{cat.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Pareto — configurable */}
          <div id="chart-pareto" className={`stat-card animate-fade-in transition-all ${crossFilters.pareto ? "ring-2 ring-primary/50" : ""}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Top Causas (Pareto)
                  {crossFilters.pareto && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.pareto}</span>}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Clique em uma barra para filtrar</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ZoomButton onClick={() => setZoomChart("pareto")} />
              </div>
            </div>
            {paretoData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[240px] text-center gap-2">
                <BarChart3 className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Sem dados para o Pareto</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={isMobileView ? 220 : 280}>
                <ComposedChart data={paretoData} layout="vertical" margin={{ left: isMobileView ? 0 : 10, right: isMobileView ? 40 : 60 }} onClick={handleParetoClick}>
                   <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                   <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: isMobileView ? 9 : 11, fill: TICK_COLOR }} />
                   <YAxis dataKey="name" type="category" width={isMobileView ? 100 : 160} tick={{ fontSize: isMobileView ? 8 : 10, fill: TICK_COLOR }}
                     tickFormatter={(v: string) => v.length > (isMobileView ? 14 : 22) ? v.substring(0, isMobileView ? 14 : 22) + "…" : v} />
                   <YAxis yAxisId="right" hide />
                   <Tooltip
                     content={({ active, payload }) => {
                       if (!active || !payload?.length) return null;
                       const data = payload[0]?.payload;
                       if (!data) return null;
                       return (
                         <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 200 }}>
                           <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                             <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: DESCRIPTION_COLORS[data.name] || PIE_COLORS[0], display: "inline-block", flexShrink: 0 }} />
                             <strong style={{ fontSize: 13 }}>{data.name}</strong>
                           </div>
                            <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                              <div>Percentual: <strong>{data.percent}%</strong></div>
                            </div>
                         </div>
                       );
                     }}
                   />
                   <Bar dataKey="percent" name="Percentual" radius={[0, 4, 4, 0]} className="cursor-pointer">
                     {paretoData.map((item, i) => (
                        <Cell key={i} fill={DESCRIPTION_COLORS[item.name] || PIE_COLORS[i % PIE_COLORS.length]}
                         opacity={crossFilters.pareto && crossFilters.pareto !== item.name ? 0.3 : 1} />
                     ))}
                     <LabelList dataKey="percent" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: TICK_COLOR }} />
                   </Bar>
                   
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>


        {/* 3) Produtividade por Especialidade */}
        <div id="chart-especialidade" className={chartCardClass("especialidade")}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Produtividade por Especialidade
                {crossFilters.especialidade && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.especialidade}</span>}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Ordenado por produtividade (maior → menor) — clique para filtrar</p>
            </div>
            <ZoomButton onClick={() => setZoomChart("especialidade")} />
          </div>
          <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
            <div className="min-w-0 flex-1">
              <ResponsiveContainer width="100%" height={isMobileView ? 350 : STACKED_CHART_HEIGHT}>
                <BarChart data={bySpecialty} margin={{ ...STACKED_CHART_MARGIN, left: -10 }} barCategoryGap="14%" onClick={handleSpecialtyClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: isMobileView ? 8 : 10, fill: TICK_COLOR }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: isMobileView ? 9 : 11, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} width={35} />
                  <Tooltip
                    shared={false}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload.find((p: any) => p?.dataKey && p?.payload) || payload[0];
                      const data = item?.payload;
                      if (!data || !item) return null;
                      const desc = item.dataKey as string;
                      const pct = typeof item.value === "number" ? item.value : data[desc] || 0;
                      return (
                        <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 180 }}>
                          <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{data.name}</strong>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.8, fontSize: 11 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.fill || getDescriptionCategoryColor("", desc), display: "inline-block", flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{displayName(desc)}</span>
                            <span style={{ fontWeight: 600 }}>{pct}%</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  {renderStackedBars(nonNpeDescriptions)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="shrink-0 lg:max-w-[28%]">
              <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-[5px]" style={{ paddingTop: isMobileView ? 0 : STACKED_CHART_MARGIN.top }}>
                {renderLegendList(nonNpeDescriptions, descriptionTooltipMap)}
              </div>
            </div>
          </div>
        </div>




        {/* Causas Externas de Parada */}
        {externalCausas.length > 0 && (
          <div id="chart-externas" className="stat-card animate-fade-in mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-muted-foreground" />
                Causas Externas de Parada
              </h3>
              <ZoomButton onClick={() => setZoomChart("externas")} />
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">Eventos fora do controle da equipe</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {externalCausas.map((causa: any) => {
                return (
                  <div key={causa.name} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getDescColor(causa.name) }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{causa.name}</p>
                      <p className="text-[10px] text-muted-foreground">{causa.percent}%</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={isMobileView ? 220 : 280}>
              <PieChart>
                <Pie
                  data={externalCausas}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={isMobileView ? 70 : 100}
                  label={renderExternalPieLabel}
                  labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                >
                  {externalCausas.map((causa: any, i: number) => {
                    const color = getDescColor(causa.name);
                    const isWhite = color === "#FFFFFF";
                    return (
                      <Cell key={i} fill={color} stroke={isWhite ? "#374151" : undefined} strokeWidth={isWhite ? 2 : undefined} />
                    );
                  })}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0]?.payload;
                    if (!data) return null;
                    return (
                      <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 180 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: getDescColor(data.name), display: "inline-block", flexShrink: 0 }} />
                          <span><strong>{data.name}</strong>: {data.percent}%</span>
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 6) Produtividade por Período — supports horario/weekday/month */}
        <div id="chart-tempo" className={chartCardClass("tempo")}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {timeViewMode === "horario" ? "Produtividade por Horário" : timeViewMode === "diasemana" ? "Produtividade por Dia da Semana" : "Produtividade por Mês"}
                {crossFilters.tempo && crossFilters.tempoMode === timeViewMode && <span className="text-xs font-normal text-primary ml-2">• {crossFilters.tempo}</span>}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">% de produtividade — clique para filtrar</p>
            </div>
            <div className="flex items-center gap-1 md:gap-2 flex-wrap">
              <ZoomButton onClick={() => setZoomChart("tempo")} />
              {([["horario", "Horário"], ["diasemana", "Dia"], ["mes", "Mês"]] as const).map(([key, label]) => (
                <Button key={key} variant={timeViewMode === key ? "default" : "outline"} size="sm" className="text-[9px] md:text-[10px] h-5 md:h-6 px-1.5 md:px-2" onClick={() => setTimeViewMode(key)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
            <div className="min-w-0 flex-1">
              <ResponsiveContainer width="100%" height={isMobileView ? 350 : STACKED_CHART_HEIGHT}>
                <BarChart data={byTimeGrouped} margin={{ ...STACKED_CHART_MARGIN, left: -10 }} barCategoryGap="14%" onClick={handleTimeClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: isMobileView ? 8 : 11, fill: TICK_COLOR }} />
                  <YAxis tick={{ fontSize: isMobileView ? 9 : 11, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} allowDataOverflow width={35} />
                  <Tooltip
                    shared={false}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload.find((p: any) => p?.dataKey && p?.payload) || payload[0];
                      const data = item?.payload;
                      if (!data || !item) return null;
                      const desc = item.dataKey as string;
                      const pct = typeof item.value === "number" ? item.value : data[desc] || 0;
                      return (
                        <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 180 }}>
                          <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{data.time}</strong>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.8, fontSize: 11 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.fill || getDescriptionCategoryColor("", desc), display: "inline-block", flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{displayName(desc)}</span>
                            <span style={{ fontWeight: 600 }}>{pct}%</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  {renderStackedBars(nonNpeDescriptions)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="shrink-0 lg:max-w-[28%]">
              <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-[5px]" style={{ paddingTop: isMobileView ? 0 : STACKED_CHART_MARGIN.top }}>
                {renderLegendList(nonNpeDescriptions, descriptionTooltipMap)}
              </div>
            </div>
          </div>
        </div>

        {/* ── Zoom Dialogs ───────────────────────────────────────── */}
        {/* Contrato */}
        <ChartZoomDialog title="Visão Geral por Contrato" subtitle="Clique em uma barra para filtrar" open={zoomChart === "contrato"} onOpenChange={(o) => !o && setZoomChart(null)}>
          <div className="flex flex-col xl:flex-row gap-3 h-full">
            <div className="min-w-0 min-h-0" style={{ flex: '7 1 0%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byObra} margin={ZOOM_STACKED_CHART_MARGIN} barCategoryGap="14%" onClick={handleContratoClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: TICK_COLOR }} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 12, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<ContratoTooltip />} shared={false} />
                  {renderStackedBars(allDescriptions)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="shrink-0 overflow-auto" style={{ flex: '0 0 28%', maxWidth: '28%', paddingTop: ZOOM_STACKED_CHART_MARGIN.top }}>
              {renderLegendList(allDescriptions, descriptionTooltipMap)}
            </div>
          </div>
        </ChartZoomDialog>

        {/* Categoria Pie */}
        <ChartZoomDialog title="Distribuição por Categoria" subtitle="Clique em uma fatia para filtrar" open={zoomChart === "categoria"} onOpenChange={(o) => !o && setZoomChart(null)}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={categoryTotals} cx="50%" cy="50%" innerRadius={100} outerRadius={180} paddingAngle={3} dataKey="value" label={renderCategoryPieLabel} labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }} onClick={handlePieClick}>
                {categoryTotals.map((entry) => (
                  <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#666"} className="cursor-pointer"
                    opacity={crossFilters.categoria && crossFilters.categoria !== entry.name ? 0.3 : 1} />
                ))}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0].payload;
                const total = categoryTotals.reduce((s, c) => s + c.value, 0);
                const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0";
                return (
                  <div style={{ ...tooltipStyle, padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: CATEGORY_COLORS[entry.name] || "#666", display: "inline-block" }} />
                      <span><strong>{entry.name}</strong>: {pct}%</span>
                    </div>
                  </div>
                );
              }} />
              <Legend content={() => (
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-4">
                  {categoryTotals.filter(c => c.value > 0).map(cat => (
                    <div key={cat.name} className="flex items-center gap-2 cursor-pointer" onClick={() => toggleCrossFilter("categoria", cat.name)}>
                      <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: CATEGORY_COLORS[cat.name] || "#666", display: "inline-block" }} />
                      <span className="text-sm text-muted-foreground">{cat.name}</span>
                    </div>
                  ))}
                </div>
              )} />
            </PieChart>
          </ResponsiveContainer>
        </ChartZoomDialog>

        {/* Pareto */}
        <ChartZoomDialog title="Top Causas (Pareto)" subtitle="Clique em uma barra para filtrar" open={zoomChart === "pareto"} onOpenChange={(o) => !o && setZoomChart(null)}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={paretoData} layout="vertical" margin={{ left: 20, right: 80 }} onClick={handleParetoClick}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12, fill: TICK_COLOR }} />
              <YAxis dataKey="name" type="category" width={220} tick={{ fontSize: 12, fill: TICK_COLOR }} />
              <YAxis yAxisId="right" hide />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const data = payload[0]?.payload;
                if (!data) return null;
                return (
                  <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 200 }}>
                    <strong style={{ fontSize: 14 }}>{data.name}</strong>
                    <div style={{ fontSize: 12, lineHeight: 1.8, marginTop: 6 }}>
                      <div>Percentual: <strong>{data.percent}%</strong></div>
                    </div>
                  </div>
                );
              }} />
              <Bar dataKey="percent" name="Percentual" radius={[0, 4, 4, 0]} className="cursor-pointer">
                {paretoData.map((item, i) => (
                  <Cell key={i} fill={DESCRIPTION_COLORS[item.name] || PIE_COLORS[i % PIE_COLORS.length]}
                    opacity={crossFilters.pareto && crossFilters.pareto !== item.name ? 0.3 : 1} />
                ))}
                <LabelList dataKey="percent" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 12, fill: TICK_COLOR }} />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </ChartZoomDialog>

        {/* Especialidade */}
        <ChartZoomDialog title="Produtividade por Especialidade" subtitle="Ordenado por produtividade — clique para filtrar" open={zoomChart === "especialidade"} onOpenChange={(o) => !o && setZoomChart(null)}>
          <div className="flex flex-col xl:flex-row gap-3 h-full">
            <div className="min-w-0 min-h-0" style={{ flex: '7 1 0%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySpecialty} margin={ZOOM_STACKED_CHART_MARGIN} barCategoryGap="14%" onClick={handleSpecialtyClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: TICK_COLOR }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 12, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip shared={false} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload.find((p: any) => p?.dataKey && p?.payload) || payload[0];
                    const data = item?.payload;
                    if (!data || !item) return null;
                    const desc = item.dataKey as string;
                    const pct = typeof item.value === "number" ? item.value : data[desc] || 0;
                    return (
                      <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 200 }}>
                        <strong style={{ fontSize: 14, display: "block", marginBottom: 8 }}>{data.name}</strong>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.8, fontSize: 12 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: item.fill || getDescriptionCategoryColor("", desc), display: "inline-block" }} />
                          <span style={{ flex: 1 }}>{displayName(desc)}</span>
                          <span style={{ fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </div>
                    );
                  }} />
                  {renderStackedBars(nonNpeDescriptions)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="shrink-0 overflow-auto" style={{ flex: '0 0 28%', maxWidth: '28%', paddingTop: ZOOM_STACKED_CHART_MARGIN.top }}>
              {renderLegendList(nonNpeDescriptions, descriptionTooltipMap)}
            </div>
          </div>
        </ChartZoomDialog>


        {/* Causas Externas */}
        <ChartZoomDialog title="Causas Externas de Parada" subtitle="Eventos fora do controle da equipe" open={zoomChart === "externas"} onOpenChange={(o) => !o && setZoomChart(null)}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={externalCausas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={200}
                label={renderExternalPieLabel} labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}>
                {externalCausas.map((causa: any, i: number) => {
                  const color = getDescColor(causa.name);
                  const isWhite = color === "#FFFFFF";
                  return (
                    <Cell key={i} fill={color} stroke={isWhite ? "#374151" : undefined} strokeWidth={isWhite ? 2 : undefined} />
                  );
                })}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const data = payload[0]?.payload;
                if (!data) return null;
                return (
                  <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 180 }}>
                    <strong>{data.name}</strong>: {data.hours}h ({data.percent}%)
                  </div>
                );
              }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartZoomDialog>

        {/* Tempo */}
        <ChartZoomDialog title={timeViewMode === "horario" ? "Produtividade por Horário" : timeViewMode === "diasemana" ? "Produtividade por Dia da Semana" : "Produtividade por Mês"} subtitle="% de produtividade — clique para filtrar" open={zoomChart === "tempo"} onOpenChange={(o) => !o && setZoomChart(null)}>
          <div className="flex flex-col xl:flex-row gap-3 h-full">
            <div className="min-w-0 min-h-0" style={{ flex: '7 1 0%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTimeGrouped} margin={ZOOM_STACKED_CHART_MARGIN} barCategoryGap="14%" onClick={handleTimeClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 12, fill: TICK_COLOR }} />
                  <YAxis tick={{ fontSize: 12, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} allowDataOverflow />
                  <Tooltip shared={false} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload.find((p: any) => p?.dataKey && p?.payload) || payload[0];
                    const data = item?.payload;
                    if (!data || !item) return null;
                    const desc = item.dataKey as string;
                    const pct = typeof item.value === "number" ? item.value : data[desc] || 0;
                    return (
                      <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 200 }}>
                        <strong style={{ fontSize: 14, display: "block", marginBottom: 8 }}>{data.time}</strong>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.8, fontSize: 12 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: item.fill || getDescriptionCategoryColor("", desc), display: "inline-block" }} />
                          <span style={{ flex: 1 }}>{displayName(desc)}</span>
                          <span style={{ fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </div>
                    );
                  }} />
                  {renderStackedBars(nonNpeDescriptions)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="shrink-0 overflow-auto" style={{ flex: '0 0 28%', maxWidth: '28%', paddingTop: ZOOM_STACKED_CHART_MARGIN.top }}>
              {renderLegendList(nonNpeDescriptions, descriptionTooltipMap)}
            </div>
          </div>
        </ChartZoomDialog>
      </div>
    </AppLayout>
  );
}
