import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado");

    const body = await req.json();
    const { type, context } = body;

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "suggest") {
      // Sugestão automática de categoria/descrição
      systemPrompt = `Você é um assistente especializado em medição de produtividade de obras de engenharia.
Sua tarefa é sugerir a categoria e descrição mais adequadas para uma observação de campo com base no contexto fornecido.

Categorias disponíveis e suas descrições:
- Produtivo: Trabalhando, Planejando
- Suplementar: Aguardando Instruções, Assistindo, Aguardando Ferramenta ou Material, Aguardando Liberação, Transitando no local de trabalho - com ferramenta, Transitando no local de trabalho - sem ferramenta, Transitando fora do local de trabalho - com ferramenta, Transitando fora do local de trabalho - sem ferramenta
- Não Produtivo: Pessoal, Ocioso

Responda APENAS em JSON válido com este formato exato:
{"categoria": "nome da categoria pai", "descricao": "nome da subcategoria", "justificativa": "breve justificativa em português"}`;

      userPrompt = `Contexto da observação:
- Especialidade: ${context.especialidade || "não informada"}
- Obra/Contrato: ${context.obra || "não informado"}
- Rota: ${context.rota || "não informada"}
- Horário: ${context.horario || "não informado"}
- Notas adicionais: ${context.notas || "nenhuma"}

Qual categoria e descrição você sugere para esta observação?`;
    } else if (type === "report") {
      // Relatório inteligente das observações
      systemPrompt = `Você é um especialista em análise de produtividade de obras de engenharia industrial.
Analise os dados de observações fornecidos e gere um relatório executivo em português com insights acionáveis.

Estruture o relatório com:
1. **Resumo Executivo** (2-3 frases sobre o cenário geral)
2. **Pontos de Atenção** (principais problemas identificados com base nos dados)
3. **Especialidades em Destaque** (especialidades com melhor e pior performance)
4. **Recomendações** (3-5 ações concretas para melhorar a produtividade)
5. **Tendências** (padrões observados nos dados)

Use linguagem objetiva e profissional. Seja específico com os números.`;

      userPrompt = `Dados do período analisado:
- Total de amostras: ${context.totalAmostras}
- Produtivo: ${context.produtivo} amostras (${context.produtivoPct}%)
- Suplementar: ${context.suplementar} amostras (${context.suplementarPct}%)
- Não Produtivo: ${context.naoProdutivo} amostras (${context.naoProdutivoPct}%)
- Período: ${context.periodo}
- Contrato/Obra: ${context.obra || "Todos"}

Distribuição por especialidade:
${context.porEspecialidade || "Não disponível"}

Top categorias de observação:
${context.topCategorias || "Não disponível"}

Gere um relatório executivo completo com base nesses dados.`;
    } else {
      return new Response(JSON.stringify({ error: "Tipo inválido. Use 'suggest' ou 'report'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: type === "report",
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos no painel." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`Erro na IA: ${response.status}`);
    }

    if (type === "report") {
      // Streaming for reports
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Non-streaming for suggestions
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from suggestion
    let suggestion;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      suggestion = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      suggestion = null;
    }

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-observations error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
