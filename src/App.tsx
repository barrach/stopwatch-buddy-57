import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import NewObservation from "./pages/NewObservation";
import Records from "./pages/Records";
import RoutesPage from "./pages/RoutesPage";
import SettingsPage from "./pages/SettingsPage";
import CadastroRotas from "./pages/CadastroRotas";
import CadastroEspecialidades from "./pages/CadastroEspecialidades";
import CadastroCategorias from "./pages/CadastroCategorias";
import CadastroObras from "./pages/CadastroObras";

import AuditoriaPage from "./pages/AuditoriaPage";
import AprovacoesPage from "./pages/AprovacoesPage";
import RelatorioIA from "./pages/RelatorioIA";
import RelatoriosPage from "./pages/RelatoriosPage";
import RelatoriosSalvosPage from "./pages/RelatoriosSalvosPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  useOfflineSync();
  const { user, loading, isApproved, userStatus } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  // Not logged in or not approved → show login page (which handles pending/rejected states)
  if (!user || !isApproved) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/nova-observacao" element={<NewObservation />} />
      <Route path="/registros" element={<Records />} />
      <Route path="/rotas" element={<RoutesPage />} />
      <Route path="/configuracoes" element={<SettingsPage />} />
      <Route path="/cadastro/rotas" element={<CadastroRotas />} />
      <Route path="/cadastro/especialidades" element={<CadastroEspecialidades />} />
      <Route path="/cadastro/categorias" element={<CadastroCategorias />} />
      <Route path="/cadastro/obras" element={<CadastroObras />} />
      
      <Route path="/auditoria" element={<AuditoriaPage />} />
      <Route path="/aprovacoes" element={<AprovacoesPage />} />
      <Route path="/relatorios" element={<RelatoriosPage />} />
      <Route path="/relatorios-salvos" element={<RelatoriosSalvosPage />} />
      <Route path="/relatorio-ia" element={<RelatorioIA />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
