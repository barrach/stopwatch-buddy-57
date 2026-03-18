import React from "react";
import { LegendTooltip } from "@/components/LegendTooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList, ComposedChart,
} from "recharts";
import {
  CANONICAL_ORDER_FULL, CATEGORY_COLORS, DESCRIPTION_COLORS, PIE_COLORS,
  STACKED_CHART_HEIGHT, STACKED_CHART_MARGIN, TICK_COLOR, GRID_COLOR,
  tooltipStyle, getDescColor, getLegendTextColor, displayName, isLightColor,
  getSpecialtyColor,
} from "@/lib/chartConstants";
import { useIsMobile } from "@/hooks/use-mobile";

// ── BarPercentLabel ──
const BarPercentLabel = (props: any) => {
  const { x, y, width, height, value, fill } = props;
  const numVal = Number(value);
  if (value === undefined || value === null || numVal === 0 || !width) return null;
  const h = Math.max(Number(height) || 0, 1);
  const w = Math.max(Number(width) || 0, 1);
  const label = numVal.toFixed(1) + "%";
  const textColor = fill && isLightColor(fill) ? "#1F2937" : "#FFFFFF";
  const fontSize = h >= 16 ? Math.min(11, h * 0.55) : 7.5;
  return (
    <text x={x + w / 2} y={y + h / 2} fill={textColor} fontSize={fontSize} fontWeight={700}
      textAnchor="middle" dominantBaseline="middle" paintOrder="stroke"
      stroke={textColor === "#FFFFFF" ? "rgba(17,24,39,0.5)" : "rgba(255,255,255,0.7)"}
      strokeWidth={h >= 16 ? 2.5 : 2} style={{ pointerEvents: "none" }}>
      {label}
    </text>
  );
};

// ── renderStackedBars ──
export const renderStackedBars = (descriptions: string[]) =>
  descriptions.map((desc, i) => {
    const color = getDescColor(desc);
    const isWhite = color === "#FFFFFF";
    return (
      <Bar key={desc} dataKey={desc} name={displayName(desc)} fill={color} stackId="a"
        stroke={isWhite ? "#D1D5DB" : undefined} strokeWidth={isWhite ? 1 : undefined}
        radius={i === descriptions.length - 1 ? [4, 4, 0, 0] : undefined}>
        <LabelList dataKey={desc} content={(props: any) => <BarPercentLabel {...props} />} />
      </Bar>
    );
  });

// ── renderLegendList ──
export const renderLegendList = (descriptions: string[], tooltipMap?: Record<string, string>) => {
  const legendOrder = [...descriptions].reverse();
  return (
    <div className="flex flex-col justify-start gap-[5px] overflow-y-auto pr-1"
      style={{ height: STACKED_CHART_HEIGHT - STACKED_CHART_MARGIN.top - STACKED_CHART_MARGIN.bottom, marginTop: STACKED_CHART_MARGIN.top, marginBottom: STACKED_CHART_MARGIN.bottom }}>
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

// ── Shared tooltip for stacked bars ──
const StackedBarTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const item = payload.find((p: any) => p?.dataKey && p?.payload) || payload[0];
  const data = item?.payload;
  if (!data || !item) return null;
  const desc = item.dataKey as string;
  const pct = typeof item.value === "number" ? item.value : data[desc] || 0;
  const nameKey = data.name || data.time || "";
  return (
    <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 180 }}>
      <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{nameKey}</strong>
      <div style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.8, fontSize: 11 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.fill || getDescColor(desc), display: "inline-block", flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{displayName(desc)}</span>
        <span style={{ fontWeight: 600 }}>{pct}%</span>
      </div>
    </div>
  );
};

// ── Chart Components ──

interface StackedChartProps {
  data: any[];
  dataKeyX: string;
  descriptions: string[];
  title: string;
  xAngle?: number;
  tooltipMap?: Record<string, string>;
}

export function StackedBarChartSection({ data, dataKeyX, descriptions, title, xAngle = 0, tooltipMap }: StackedChartProps) {
  return (
    <div className="stat-card animate-fade-in mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
        <div className="min-w-0 flex-1">
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : STACKED_CHART_HEIGHT}>
            <BarChart data={data} margin={{ ...STACKED_CHART_MARGIN, left: -10 }} barCategoryGap="14%">
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
              <XAxis dataKey={dataKeyX} tick={{ fontSize: 9, fill: TICK_COLOR }} angle={xAngle} textAnchor={xAngle ? "end" : "middle"} />
              <YAxis tick={{ fontSize: 10, fill: TICK_COLOR }} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} width={35} />
              <Tooltip content={<StackedBarTooltip />} shared={false} />
              {renderStackedBars(descriptions)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="shrink-0 lg:max-w-[28%]">
          <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-[5px] overflow-y-auto" style={{ maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024 ? 'none' : STACKED_CHART_HEIGHT - STACKED_CHART_MARGIN.top - STACKED_CHART_MARGIN.bottom }}>
            {[...descriptions].reverse().map((desc) => (
              <LegendTooltip key={desc} name={displayName(desc)} description={tooltipMap?.[desc] || tooltipMap?.[displayName(desc)]}>
                <div className="flex items-center gap-1.5 lg:gap-2">
                  <span className="w-[10px] h-[10px] rounded-sm shrink-0 border border-border/50" style={{ backgroundColor: getDescColor(desc) }} />
                  <span className="text-[11px] lg:text-[14px] leading-normal" style={{ color: getLegendTextColor(desc) }}>{displayName(desc)}</span>
                </div>
              </LegendTooltip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ParetoChartProps {
  data: any[];
  title: string;
  mode: "categoria" | "especialidade";
}

export function ParetoChartSection({ data, title, mode }: ParetoChartProps) {
  if (data.length === 0) return null;
  return (
    <div className="stat-card animate-fade-in mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} layout="vertical" margin={{ left: 10, right: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} opacity={0.3} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: TICK_COLOR }} />
          <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 10, fill: TICK_COLOR }}
            tickFormatter={(v: string) => v.length > 22 ? v.substring(0, 22) + "…" : v} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            if (!d) return null;
            return (
              <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: mode === "especialidade" ? getSpecialtyColor(d.name) : (DESCRIPTION_COLORS[d.name] || PIE_COLORS[0]), display: "inline-block", flexShrink: 0 }} />
                  <strong style={{ fontSize: 13 }}>{d.name}</strong>
                </div>
                <div style={{ fontSize: 11 }}>Percentual: <strong>{d.percent}%</strong></div>
              </div>
            );
          }} />
          <Bar dataKey="percent" name="Percentual" radius={[0, 4, 4, 0]}>
            {data.map((item: any, i: number) => (
              <Cell key={i} fill={mode === "especialidade" ? getSpecialtyColor(item.name) : (DESCRIPTION_COLORS[item.name] || PIE_COLORS[i % PIE_COLORS.length])} />
            ))}
            <LabelList dataKey="percent" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: TICK_COLOR }} />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ExternalPieProps {
  data: any[];
  title: string;
}

export function ExternalPieSection({ data, title }: ExternalPieProps) {
  if (data.length === 0) return null;
  return (
    <div className="stat-card animate-fade-in mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <p className="text-[10px] text-muted-foreground mb-3">Eventos fora do controle da equipe</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {data.map((causa: any) => (
          <div key={causa.name} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getDescColor(causa.name) }} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{causa.name}</p>
              <p className="text-[10px] text-muted-foreground">{causa.percent}%</p>
            </div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 220 : 280}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            outerRadius={typeof window !== 'undefined' && window.innerWidth < 768 ? 70 : 100}
            label={({ cx, cy, midAngle, outerRadius, payload }: any) => {
              const dp = payload?.percent;
              if (!dp || dp <= 0) return null;
              const radius = (outerRadius || 0) + 18;
              const rad = Math.PI / 180;
              const x = cx + radius * Math.cos(-midAngle * rad);
              const y = cy + radius * Math.sin(-midAngle * rad);
              const isMob = typeof window !== 'undefined' && window.innerWidth < 768;
              return (
                <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central"
                  fill="hsl(var(--foreground))" fontSize={isMob ? 9 : 11} fontWeight={700}
                  stroke="hsl(var(--background))" strokeWidth={3} paintOrder="stroke">
                  {isMob ? `${dp}%` : `${payload.name} ${dp}%`}
                </text>
              );
            }}
            labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}>
            {data.map((causa: any, i: number) => {
              const color = getDescColor(causa.name);
              const isWhite = color === "#FFFFFF";
              return <Cell key={i} fill={color} stroke={isWhite ? "#374151" : undefined} strokeWidth={isWhite ? 2 : undefined} />;
            })}
          </Pie>
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            if (!d) return null;
            return (
              <div style={{ ...tooltipStyle, padding: "12px 16px", minWidth: 180 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: getDescColor(d.name), display: "inline-block", flexShrink: 0 }} />
                  <span><strong>{d.name}</strong>: {d.percent}%</span>
                </div>
              </div>
            );
          }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
