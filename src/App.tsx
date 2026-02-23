import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import Dashboard from "./pages/Dashboard";
import NewObservation from "./pages/NewObservation";
import Records from "./pages/Records";
import RoutesPage from "./pages/RoutesPage";
import SettingsPage from "./pages/SettingsPage";
import Auth from "./pages/Auth";
import CadastroRotas from "./pages/CadastroRotas";
import CadastroEspecialidades from "./pages/CadastroEspecialidades";
import CadastroCategorias from "./pages/CadastroCategorias";
import CadastroObras from "./pages/CadastroObras";
import CadastroFuncoes from "./pages/CadastroFuncoes";
import AuditoriaPage from "./pages/AuditoriaPage";
import RelatorioIA from "./pages/RelatorioIA";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();
  useOfflineSync();

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
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
      <Route path="/cadastro/funcoes" element={<CadastroFuncoes />} />
      <Route path="/auditoria" element={<AuditoriaPage />} />
      <Route path="/relatorio-ia" element={<RelatorioIA />} />
      
      <Route path="/auth" element={<Navigate to="/" replace />} />
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
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
