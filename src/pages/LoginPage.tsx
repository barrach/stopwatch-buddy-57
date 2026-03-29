import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import logoMega from "@/assets/logo-mega.png";
import { Clock, ShieldX } from "lucide-react";

interface Obra {
  id: string;
  nome: string;
}

export default function LoginPage() {
  const { toast } = useToast();
  const { user, userStatus, signOut } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [obraId, setObraId] = useState("");
  const [loading, setLoading] = useState(false);
  const [obras, setObras] = useState<Obra[]>([]);

  useEffect(() => {
    const fetchObras = async () => {
      const { data } = await supabase
        .from("obras")
        .select("id, nome")
        .eq("status", "Ativo")
        .order("nome");
      setObras(data || []);
    };
    fetchObras();
  }, []);

  // If user is logged in but pending/rejected, show status screen
  if (user && userStatus && userStatus !== "aprovado") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <img src={logoMega} alt="Logo" className="w-14 h-14 object-contain" />
            <div className="text-center">
              <h1 className="text-xl font-bold text-foreground">ProdControl</h1>
              <p className="text-sm text-muted-foreground">Medição de Produtividade</p>
            </div>
          </div>

          <div className="stat-card text-center space-y-4">
            {userStatus === "pendente" ? (
              <>
                <Clock className="w-12 h-12 text-amber-500 mx-auto" />
                <h2 className="text-lg font-semibold text-foreground">Aguardando Aprovação</h2>
                <p className="text-sm text-muted-foreground">
                  Sua conta está aguardando aprovação do administrador. Você receberá acesso assim que for aprovado.
                </p>
              </>
            ) : (
              <>
                <ShieldX className="w-12 h-12 text-destructive mx-auto" />
                <h2 className="text-lg font-semibold text-foreground">Acesso Negado</h2>
                <p className="text-sm text-muted-foreground">
                  Sua conta foi rejeitada pelo administrador. Entre em contato para mais informações.
                </p>
              </>
            )}
            <Button variant="outline" onClick={signOut} className="w-full">
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        if (!obraId) {
          toast({ title: "Erro", description: "Selecione um contrato", variant: "destructive" });
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nome, obra_id: obraId } },
        });
        if (error) throw error;
        toast({
          title: "Conta criada!",
          description: "Sua conta está aguardando aprovação do administrador.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message === "Invalid login credentials"
          ? "Email ou senha incorretos"
          : error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logoMega} alt="Logo" className="w-14 h-14 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">ProdControl</h1>
            <p className="text-sm text-muted-foreground">Medição de Produtividade</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 stat-card">
          <h2 className="text-lg font-semibold text-foreground text-center">
            {isSignUp ? "Criar conta" : "Entrar"}
          </h2>

          {isSignUp && (
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>

          {isSignUp && (
            <div className="space-y-1.5">
              <Label htmlFor="contrato">Contrato</Label>
              <Select value={obraId} onValueChange={setObraId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o contrato" />
                </SelectTrigger>
                <SelectContent>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Aguarde..." : isSignUp ? "Criar conta" : "Entrar"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            {isSignUp ? "Já tem conta?" : "Não tem conta?"}{" "}
            <button type="button" className="text-primary underline" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? "Entrar" : "Criar conta"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
