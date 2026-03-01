import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import logoMega from "@/assets/logo-mega.png";

type Mode = "login" | "signup" | "forgot";

export default function Auth() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "E-mail enviado", description: "Verifique sua caixa de entrada para redefinir a senha." });
        setMode("login");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: "Cadastro realizado!", description: "Verifique seu e-mail para confirmar." });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <img src={logoMega} alt="Megastem logo" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-lg font-bold text-foreground">ProdControl</h1>
            <p className="text-[11px] text-info">Medição de Produtividade</p>
          </div>
        </div>

        <div className="stat-card">
          <h2 className="text-lg font-semibold text-foreground mb-6">{title}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs text-info">E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" />
            </div>
            {mode !== "forgot" && (
              <div>
                <Label className="text-xs text-info">Senha</Label>
                <div className="relative mt-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
            {mode === "login" && (
              <div className="text-right">
                <button type="button" onClick={() => setMode("forgot")} className="text-xs text-info hover:underline">
                  Esqueci minha senha
                </button>
              </div>
            )}
            <Button type="submit" className="w-full bg-info hover:bg-info/90 text-info-foreground" disabled={loading}>
              {loading ? "Aguarde..." : mode === "forgot" ? "Enviar e-mail" : title}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            {mode === "login" ? (
              <>
                Não tem conta?{" "}
                <button onClick={() => setMode("signup")} className="text-info hover:underline">Criar conta</button>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <button onClick={() => setMode("login")} className="text-info hover:underline">Entrar</button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
