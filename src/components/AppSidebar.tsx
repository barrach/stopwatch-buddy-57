import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, ClipboardList, Plus, Settings, Route, HardHat } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/nova-observacao", label: "Nova Observação", icon: Plus },
  { to: "/registros", label: "Registros", icon: ClipboardList },
  { to: "/rotas", label: "Rotas", icon: Route },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export default function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar flex flex-col border-r border-sidebar-border z-30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
          <HardHat className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">ProdControl</h1>
          <p className="text-[11px] text-sidebar-foreground/50 font-medium">Medição de Produtividade</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`sidebar-item ${isActive ? "sidebar-item-active" : ""}`}
            >
              <item.icon className="w-[18px] h-[18px]" />
              <span className="text-sm">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-primary">
            MB
          </div>
          <div>
            <p className="text-xs font-medium text-sidebar-foreground">Michel Barrach</p>
            <p className="text-[10px] text-sidebar-foreground/40">Amostrador</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
