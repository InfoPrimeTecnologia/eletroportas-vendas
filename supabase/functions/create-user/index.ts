import { createClient } from "npm:@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Não autenticado." }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verifica se é super_admin ou admin
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    const isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return json({ error: "Acesso negado." }, 403);

    const { email, password, role } = await req.json();
    if (!email || !password) return json({ error: "Email e senha obrigatórios." }, 400);

    // Cria usuário já confirmado, sem precisar de signup público
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) return json({ error: createErr.message }, 400);
    if (!created.user) return json({ error: "Falha ao criar usuário." }, 500);

    const finalRole = role === "admin" || role === "user" ? role : "user";
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: finalRole });

    if (roleErr) {
      console.error("Erro ao atribuir role:", roleErr);
      return json({ error: "Usuário criado, mas falha ao atribuir função: " + roleErr.message }, 500);
    }

    return json({ ok: true, user: { id: created.user.id, email: created.user.email } });
  } catch (e: any) {
    console.error("create-user erro:", e);
    return json({ error: e?.message || "Erro interno." }, 500);
  }
});
