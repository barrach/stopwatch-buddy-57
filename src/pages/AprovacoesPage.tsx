import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, UserCheck, Clock } from "lucide-react";

interface PendingUser {
  user_id: string;
  nome: string;
  email: string;
  status: string;
  obra_id: string | null;
  obra_nome: string;
  criado_em: string;
}

export default function AprovacoesPage() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const callAdmin = async (action: string, body?: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Não autenticado");
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=${action}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Erro na operação");
    }
    return res.json();
  };

  const fetchPending = async () => {
    try {
      const data = await callAdmin("list-pending");
      setPendingUsers(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchPending();
  }, [isAdmin]);

  const handleApprove = async (userId: string) => {
    setActing(userId);
    try {
      await callAdmin("approve-user", { targetUserId: userId });
      toast.success("Usuário aprovado com sucesso!");
      fetchPending();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActing(userId);
    try {
      await callAdmin("reject-user", { targetUserId: userId });
      toast.success("Usuário rejeitado");
      fetchPending();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActing(null);
    }
  };

  if (adminLoading) return <AppLayout><div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div></AppLayout>;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <UserCheck className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Aprovações de Usuários</h1>
        </div>

        <div className="stat-card animate-fade-in">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : pendingUsers.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
              <p className="text-sm text-muted-foreground">Nenhum usuário pendente de aprovação.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-amber-500" />
                <p className="text-sm text-muted-foreground">
                  <strong>{pendingUsers.length}</strong> usuário(s) aguardando aprovação
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Contrato</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingUsers.map((u) => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium text-xs">{u.nome || "—"}</TableCell>
                        <TableCell className="text-xs">{u.email}</TableCell>
                        <TableCell className="text-xs">
                          {u.obra_nome ? (
                            <Badge variant="outline" className="text-[10px]">{u.obra_nome}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.criado_em).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              disabled={acting === u.user_id}
                              onClick={() => handleApprove(u.user_id)}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 gap-1 text-xs"
                              disabled={acting === u.user_id}
                              onClick={() => handleReject(u.user_id)}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Rejeitar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
