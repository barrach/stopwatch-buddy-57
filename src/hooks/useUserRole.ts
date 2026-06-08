import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "apontador" | "visualizador";

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      // Map legacy roles to new taxonomy
      const raw = (data?.role as string) || "apontador";
      const mapped: AppRole =
        raw === "admin" ? "admin" :
        raw === "visualizador" ? "visualizador" :
        "apontador";
      setRole(mapped);
      setLoading(false);
    })();
  }, [user]);

  return {
    role,
    loading,
    isAdmin: role === "admin",
    isApontador: role === "apontador",
    isVisualizador: role === "visualizador",
    canObserve: role === "admin" || role === "apontador",
  };
}