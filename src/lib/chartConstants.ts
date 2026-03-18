import { normalizeDescriptionName } from "@/lib/categoryNormalization";

// ── Color constants (BI-grade palette) ───────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
  Produtivo: "#2563EB",
  Suplementar: "#16A34A",
  "Não Produtivo": "#DC2626",
  "Não Produtivo Externo": "#F97316",
};

export const PIE_COLORS = [
  "#2563EB", "#B91C1C", "#047857", "#1F2937", "#9CA3AF",
  "#EAB308", "#7C3AED", "#EC4899", "#38BDF8", "#22C55E",
];

export const SPECIALTY_COLORS: Record<string, string> = {
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

const AUTO_COLORS = ["#0EA5E9", "#D946EF", "#F97316", "#14B8A6", "#6366F1", "#A3E635", "#FB7185", "#FBBF24"];
let autoColorIdx = 0;
export const getSpecialtyColor = (name: string): string => {
  if (SPECIALTY_COLORS[name]) return SPECIALTY_COLORS[name];
  for (const [key, color] of Object.entries(SPECIALTY_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  const color = AUTO_COLORS[autoColorIdx % AUTO_COLORS.length];
  SPECIALTY_COLORS[name] = color;
  autoColorIdx++;
  return color;
};

// ── Canonical stacking order (bottom → top) ──
export const CANONICAL_ORDER_FULL: string[] = [
  "Trabalhando",
  "Planejando",
  "Aguardando Ferramenta ou Material",
  "Transitando no local de trabalho - com ferramenta",
  "Transitando no local de trabalho - sem ferramenta",
  "Transitando fora do local de trabalho - com ferramenta",
  "Transitando fora do local de trabalho - sem ferramenta",
  "Assistindo / Stand By",
  "Pessoal",
  "Ocioso",
  "Aguardando Liberação de PT",
  "Interferências Operacionais",
  "Fatores Climáticos e Consequências",
];

export const DESCRIPTION_COLORS: Record<string, string> = {
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
  "Aguardando Liberação de PT": "#D4B896",
  "Interferências Operacionais": "#C8A882",
  "Vazamento / Interferência da Planta": "#C8A882",
  "Pessoal": "#EF4444",
  "Ocioso": "#DC2626",
  "Fatores Climáticos e Consequências": "#F97316",
  "Causas Naturais": "#F97316",
  "Aguardando Instruções": "#16A34A",
  "Preparando, Organizando": "#65A30D",
  "Retrabalho": "#9F1239",
  "Deslocamento": "#B91C1C",
};

export const displayName = (desc: string): string => normalizeDescriptionName(desc);
export const canonicalDescription = (desc: string): string => displayName(desc);

export const getDescColor = (desc: string): string => {
  const normalized = displayName(desc);
  if (DESCRIPTION_COLORS[normalized]) return DESCRIPTION_COLORS[normalized];
  if (DESCRIPTION_COLORS[desc]) return DESCRIPTION_COLORS[desc];
  for (const [key, color] of Object.entries(DESCRIPTION_COLORS)) {
    if (desc.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#6B7280";
};

export const getLegendTextColor = (desc: string): string => {
  const c = getDescColor(desc);
  return c === "#FFFFFF" || c === "#D4B896" || c === "#C8A882" ? "#9CA3AF" : c;
};

export const isLightColor = (hex: string): boolean => {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
};

export const STACKED_CHART_HEIGHT = 600;
export const STACKED_CHART_MARGIN = { top: 50, right: 12, bottom: 20, left: 0 };

export const tooltipStyle: React.CSSProperties = {
  background: "#111827", border: "1px solid #374151",
  borderRadius: "8px", color: "#F9FAFB", fontSize: "12px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
};

export const TICK_COLOR = "#9CA3AF";
export const GRID_COLOR = "#374151";

export const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const timeIndex = (t: string) => {
  const parts = t.split(":");
  if (parts.length < 2) return 9999;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
};

export const getTimeBucketLabel = (record: any, mode: "horario" | "diasemana" | "mes") => {
  if (mode === "horario") return record.horario || "";
  const d = new Date(`${record.data}T12:00:00`);
  if (mode === "diasemana") return WEEKDAY_NAMES[d.getDay()] || "";
  return MONTH_NAMES[d.getMonth()] || "";
};
