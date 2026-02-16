import AppLayout from "@/components/AppLayout";
import { SPECIALTIES, OBSERVATION_CATEGORIES } from "@/data/mockData";
import { Settings2, List, Tag } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie especialidades, categorias e parâmetros do sistema
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Specialties */}
          <div className="stat-card animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <Settings2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Especialidades</h3>
            </div>
            <div className="space-y-1.5">
              {SPECIALTIES.map((s) => (
                <div key={s} className="px-3 py-2 rounded-lg bg-muted/50 text-xs text-foreground flex items-center justify-between">
                  <span>{s}</span>
                  <span className="text-muted-foreground text-[10px]">Ativa</span>
                </div>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="stat-card animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Categorias de Observação</h3>
            </div>
            <div className="space-y-4">
              {(Object.entries(OBSERVATION_CATEGORIES) as [string, readonly string[]][]).map(([cat, descs]) => (
                <div key={cat}>
                  <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <List className="w-3 h-3" />
                    {cat}
                  </h4>
                  <div className="space-y-1 ml-4">
                    {descs.map((d) => (
                      <p key={d} className="text-[11px] text-muted-foreground py-1 border-b border-border/50 last:border-0">
                        {d}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
