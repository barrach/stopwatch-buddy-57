import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useUserObra() {
  const { user, userObraId } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const check = async () => {
      const { data } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      setIsAdmin(data === true);
      setLoading(false);
    };

    check();
  }, [user]);

  // Returns obra_id filter - null means "show all" (admin)
  const obraFilter = isAdmin ? null : userObraId;

  return { obraFilter, userObraId, isAdmin, loading };
}
