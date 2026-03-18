import { TrendingUp, TrendingDown, Users, Clock, BarChart3, AlertTriangle } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: string; positive: boolean };
  variant?: "default" | "success" | "warning" | "danger";
}

const variantStyles = {
  default: "border-border",
  success: "border-success/30 bg-success/5",
  warning: "border-warning/30 bg-warning/5",
  danger: "border-destructive/30 bg-destructive/5",
};

const iconVariantStyles = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

export default function StatCard({ title, value, subtitle, icon: Icon, trend, variant = "default" }: StatCardProps) {
  return (
    <div className={`stat-card ${variantStyles[variant]} animate-fade-in`}>
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${iconVariantStyles[variant]}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        {trend && (
          <span className={`text-[10px] sm:text-xs font-semibold flex items-center gap-1 ${trend.positive ? "text-success" : "text-destructive"}`}>
            {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-lg sm:text-2xl font-bold text-foreground">{value}</p>
      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">{title}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export { Users, Clock, BarChart3, AlertTriangle };
