import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logoMega from "@/assets/logo-mega.png";

export default function LoginPage() {
  const { toast } = useToast();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nome } },
        });
        if (error) throw error;
        toast({ title: "Conta criada com sucesso!", description: "Você já está logado." });
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
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>

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
