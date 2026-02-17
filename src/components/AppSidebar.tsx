import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, ClipboardList, Plus, Settings, Building2, Tag, Wrench, LogOut, Route, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import logoMega from "@/assets/logo-mega.png";

const navItems = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/nova-observacao", label: "Nova Observação", icon: Plus },
  { to: "/registros", label: "Registros", icon: ClipboardList },
];

const cadastroItems = [
  { to: "/cadastro/obras", label: "Obras", icon: Building2 },
  { to: "/cadastro/rotas", label: "Rotas", icon: Route },
  { to: "/cadastro/especialidades", label: "Especialidades", icon: Wrench },
  { to: "/cadastro/categorias", label: "Categorias", icon: Tag },
];

export default function AppSidebar({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();

  const handleNavClick = () => {
    if (isMobile && onClose) onClose();
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar flex flex-col border-r border-sidebar-border z-30">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center">
          <img src={logoMega} alt="MEGASTEAM logo" className="w-9 h-9 object-contain" />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">ProdControl</h1>
          <p className="text-[11px] text-sidebar-foreground/50 font-medium">Medição de Produtividade</p>
        </div>
        {isMobile && onClose && (
          <button onClick={onClose} className="text-sidebar-foreground/50 hover:text-sidebar-foreground">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink key={item.to} to={item.to} onClick={handleNavClick} className={`sidebar-item ${isActive ? "sidebar-item-active" : ""}`}>
              <item.icon className="w-[18px] h-[18px]" />
              <span className="text-sm">{item.label}</span>
            </NavLink>
          );
        })}

        <div className="pt-4 pb-1 px-2">
          <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">Cadastros</p>
        </div>
        {cadastroItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink key={item.to} to={item.to} onClick={handleNavClick} className={`sidebar-item ${isActive ? "sidebar-item-active" : ""}`}>
              <item.icon className="w-[18px] h-[18px]" />
              <span className="text-sm">{item.label}</span>
            </NavLink>
          );
        })}

        <div className="pt-4 pb-1 px-2">
          <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">Sistema</p>
        </div>
        <NavLink to="/configuracoes" onClick={handleNavClick} className={`sidebar-item ${location.pathname === "/configuracoes" ? "sidebar-item-active" : ""}`}>
          <Settings className="w-[18px] h-[18px]" />
          <span className="text-sm">Configurações</span>
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-primary">
            {user?.email?.substring(0, 2).toUpperCase() || "??"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.email || "Usuário"}</p>
            <p className="text-[10px] text-sidebar-foreground/40">Autenticado</p>
          </div>
          <button onClick={signOut} className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors" title="Sair">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
