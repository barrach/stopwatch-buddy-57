import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Verify caller using getClaims
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub;

    // Admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // CHECK-STATUS action - does NOT require admin
    if (req.method === "GET" && action === "check-status") {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("status, obra_id")
        .eq("user_id", userId)
        .single();

      return new Response(JSON.stringify({
        status: profile?.status || "pendente",
        obra_id: profile?.obra_id || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // All other actions require admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // LIST users
    if (req.method === "GET" && action === "list") {
      const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) throw error;

      const { data: profiles } = await supabaseAdmin.from("profiles").select("*");
      const { data: roles } = await supabaseAdmin.from("user_roles").select("*");
      const { data: obras } = await supabaseAdmin.from("obras").select("id, nome");

      const result = users.users.map((u) => {
        const profile = profiles?.find((p) => p.user_id === u.id);
        return {
          id: u.id,
          email: u.email,
          nome: profile?.nome || "",
          created_at: u.created_at,
          role: roles?.find((r) => r.user_id === u.id)?.role || "cobrador",
          status: profile?.status || "pendente",
          obra_id: profile?.obra_id || null,
          obra_nome: profile?.obra_id ? obras?.find((o) => o.id === profile.obra_id)?.nome || "" : "",
        };
      });

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // LIST PENDING users
    if (req.method === "GET" && action === "list-pending") {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, nome, email, status, obra_id, criado_em")
        .eq("status", "pendente");

      const { data: obras } = await supabaseAdmin.from("obras").select("id, nome");

      const result = (profiles || []).map((p) => ({
        user_id: p.user_id,
        nome: p.nome || "",
        email: p.email || "",
        status: p.status,
        obra_id: p.obra_id,
        obra_nome: p.obra_id ? obras?.find((o) => o.id === p.obra_id)?.nome || "" : "",
        criado_em: p.criado_em,
      }));

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // APPROVE user
    if (req.method === "POST" && action === "approve-user") {
      const { targetUserId } = await req.json();
      await supabaseAdmin.from("profiles").update({ status: "aprovado" }).eq("user_id", targetUserId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // REJECT user
    if (req.method === "POST" && action === "reject-user") {
      const { targetUserId } = await req.json();
      await supabaseAdmin.from("profiles").update({ status: "rejeitado" }).eq("user_id", targetUserId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // UPDATE user obra (contract)
    if (req.method === "POST" && action === "update-obra") {
      const { targetUserId, obraId } = await req.json();
      await supabaseAdmin.from("profiles").update({ obra_id: obraId || null }).eq("user_id", targetUserId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // UPDATE role
    if (req.method === "POST" && action === "update-role") {
      const { targetUserId, role } = await req.json();
      
      const { data: existing } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", targetUserId)
        .single();

      if (existing) {
        await supabaseAdmin.from("user_roles").update({ role }).eq("user_id", targetUserId);
      } else {
        await supabaseAdmin.from("user_roles").insert({ user_id: targetUserId, role });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // UPDATE name
    if (req.method === "POST" && action === "update-name") {
      const { targetUserId, nome } = await req.json();
      await supabaseAdmin.from("profiles").update({ nome }).eq("user_id", targetUserId);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // RESET password
    if (req.method === "POST" && action === "reset-password") {
      const { targetUserId, newPassword } = await req.json();
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password: newPassword });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // DELETE user
    if (req.method === "POST" && action === "delete-user") {
      const { targetUserId } = await req.json();
      if (targetUserId === userId) {
        return new Response(JSON.stringify({ error: "Não pode excluir a si mesmo" }), { status: 400, headers: corsHeaders });
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
