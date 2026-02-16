import AppLayout from "@/components/AppLayout";
import { ROUTES, TIME_SLOTS } from "@/data/mockData";
import { MapPin, Clock } from "lucide-react";

const routeLocations: Record<string, string[]> = {
  "Rota 1": ["Caldeiraria — Área A1", "Andaime — Área A2", "Elétrica — Área B1"],
  "Rota 2": ["Mecânica — Área C1", "Elétrica — Área C2", "Civil — Área D1"],
  "Rota 3": ["Instrumentação — Área E1", "Pintura — Área E2"],
  "Rota 4": ["Equip./Elevação — Área F1", "Caldeiraria — Área F2", "Isolamento — Área G1"],
};

export default function RoutesPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Rotas de Amostragem</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planejamento de rotas e horários — 2 rotas por dia, 8 tomadas por rota
          </p>
        </div>

        {/* Schedule */}
        <div className="stat-card mb-6 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Horários de Amostragem
          </h3>
          <div className="flex flex-wrap gap-2">
            {TIME_SLOTS.map((t) => (
              <span key={t} className="px-3 py-1.5 rounded-lg bg-muted text-xs font-mono font-medium text-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Routes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROUTES.map((route) => (
            <div key={route} className="stat-card animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{route}</h3>
              </div>
              <div className="space-y-2">
                {(routeLocations[route] || []).map((loc, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-xs text-foreground">{loc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
