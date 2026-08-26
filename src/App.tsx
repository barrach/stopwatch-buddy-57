import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "./pages/LoginPage";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewObservation = lazy(() => import("./pages/NewObservation"));
const Records = lazy(() => import("./pages/Records"));
const RoutesPage = lazy(() => import("./pages/RoutesPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const CadastroRotas = lazy(() => import("./pages/CadastroRotas"));
const CadastroEspecialidades = lazy(() => import("./pages/CadastroEspecialidades"));
const CadastroCategorias = lazy(() => import("./pages/CadastroCategorias"));
const CadastroObras = lazy(() => import("./pages/CadastroObras"));
const AuditoriaPage = lazy(() => import("./pages/AuditoriaPage"));
const AprovacoesPage = lazy(() => import("./pages/AprovacoesPage"));
const RelatorioIA = lazy(() => import("./pages/RelatorioIA"));
const RelatoriosPage = lazy(() => import("./pages/RelatoriosPage"));
const RelatoriosSalvosPage = lazy(() => import("./pages/RelatoriosSalvosPage"));
const NotFound = lazy(() => import("./pages/NotFound"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min — evita refetch em toda navegação
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

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
