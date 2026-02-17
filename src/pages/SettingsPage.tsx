import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { SPECIALTIES, OBSERVATION_CATEGORIES } from "@/data/mockData";
import { Settings2, List, Tag, Users, Pencil, Trash2, KeyRound, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface AppUser {
  id: string;
  email: string;
  nome: string;
  created_at: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  admin: "Admin",
  coordenador: "Coordenador",
  cobrador: "Cobrador",
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Dialog states
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");

  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);

  const callAdmin = async (action: string, body?: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=${action}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
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

  const fetchUsers = async () => {
    try {
      const data = await callAdmin("list");
      setUsers(data);
      setIsAdmin(true);
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchUsers();
  }, [user]);

  const handleEditSave = async () => {
    if (!editUser) return;
    try {
      await callAdmin("update-name", { targetUserId: editUser.id, nome: editName });
      await callAdmin("update-role", { targetUserId: editUser.id, role: editRole });
      toast.success("Usuário atualizado");
      setEditUser(null);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUser || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    try {
      await callAdmin("reset-password", { targetUserId: resetUser.id, newPassword });
      toast.success("Senha redefinida");
      setResetUser(null);
      setNewPassword("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    try {
      await callAdmin("delete-user", { targetUserId: deleteUser.id });
      toast.success("Usuário excluído");
      setDeleteUser(null);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie usuários, especialidades, categorias e parâmetros do sistema
          </p>
        </div>

        {/* User Management */}
        {isAdmin && (
          <div className="stat-card animate-fade-in mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Gestão de Usuários</h3>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium text-xs">{u.nome || "—"}</TableCell>
                        <TableCell className="text-xs">{u.email}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            u.role === "admin"
                              ? "bg-primary/10 text-primary"
                              : u.role === "coordenador"
                              ? "bg-accent/50 text-accent-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            <Shield className="w-3 h-3" />
                            {roleLabels[u.role] || u.role}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Editar"
                              onClick={() => {
                                setEditUser(u);
                                setEditName(u.nome || "");
                                setEditRole(u.role);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Redefinir senha"
                              onClick={() => {
                                setResetUser(u);
                                setNewPassword("");
                              }}
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                            {u.id !== user?.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                title="Excluir"
                                onClick={() => setDeleteUser(u)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

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

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>Altere o nome e o perfil de acesso</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground">Nome</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Perfil</label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="coordenador">Coordenador</SelectItem>
                  <SelectItem value="cobrador">Cobrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={handleEditSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>Nova senha para {resetUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="password"
              placeholder="Nova senha (mín. 6 caracteres)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>Cancelar</Button>
            <Button onClick={handleResetPassword}>Redefinir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Usuário</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleteUser?.email}</strong>? Esta ação é irreversível.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
