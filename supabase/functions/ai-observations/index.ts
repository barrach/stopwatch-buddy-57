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
      systemPrompt = `Você é um assistente especializado em medição de produtividade de obras de engenharia.
Sua tarefa é sugerir a categoria e descrição mais adequadas para uma observação de campo com base no contexto fornecido.

Categorias disponíveis e suas descrições:
- Produtivo: Trabalhando, Planejando
- Suplementar: Aguardando Instruções, Assistindo, Aguardando Ferramenta ou Material, Aguardando Liberação, Transitando no local de trabalho - com ferramenta, Transitando no local de trabalho - sem ferramenta, Transitando fora do local de trabalho - com ferramenta, Transitando fora do local de trabalho - sem ferramenta
- Não Produtivo: Pessoal, Ocioso
- Não Produtivo Externo: Causas Naturais, Vazamento / Interferência da Planta, Cliente

Responda APENAS em JSON válido com este formato exato:
{"categoria": "nome da categoria pai", "descricao": "nome da subcategoria", "justificativa": "breve justificativa em português"}`;

      userPrompt = `Contexto da observação:
- Especialidade: ${context.especialidade || "não informada"}
- Obra/Contrato: ${context.obra || "não informado"}
- Rota: ${context.rota || "não informada"}
- Horário: ${context.horario || "não informado"}
- Notas adicionais: ${context.notas || "nenhuma"}

Qual categoria e descrição você sugere para esta observação?`;

    } else if (type === "report" || type === "pdf-report") {
      const isPdf = type === "pdf-report";
      systemPrompt = `Você é um especialista em análise de produtividade de obras de engenharia industrial.
Analise os dados de observações fornecidos e gere um relatório executivo em português com insights acionáveis.

IMPORTANTE — Regras de cálculo de produtividade:
- Existem 4 categorias principais: Produtivo, Suplementar, Não Produtivo e Não Produtivo Externo (NPE).
- "Não Produtivo Externo" (NPE) são eventos fora do controle da equipe (ex: Causas Naturais, Vazamento, Cliente).
- O cálculo de produtividade EXCLUI os registros de NPE da base de cálculo.
- Fórmula: Produtividade = Produtivo / (Total - NPE) × 100
- Suplementar% = Suplementar / (Total - NPE) × 100
- Não Produtivo% = Não Produtivo / (Total - NPE) × 100
- Os percentuais de Produtivo + Suplementar + Não Produtivo devem somar ~100% (base controlável).
- NPE é reportado separadamente como % do total bruto.

${isPdf ? `FORMATO DE SAÍDA OBRIGATÓRIO — O relatório DEVE ser estruturado com marcadores de seção exatos. Use EXATAMENTE estes marcadores para separar as seções:

===RESUMO===
Resumo executivo de 2-3 frases com os números reais de produtividade. Destaque o índice de produtividade e os principais pontos.

===CATEGORIA===
Análise da distribuição por categorias (Produtivo, Suplementar, Não Produtivo, NPE). Explique o que os percentuais significam e se estão dentro do esperado para obras industriais.

===CONTRATO===
Análise da produtividade por contrato/obra. Compare os contratos, destaque os melhores e piores desempenhos e possíveis causas.

===ESPECIALIDADE===
Análise detalhada por especialidade. Compare as especialidades, identifique quais estão acima/abaixo da média e por quê.

===FUNCAO===
Análise por função. Identifique funções com melhor e pior produtividade e possíveis causas.

===NAO_PRODUTIVO===
Análise das causas de não produtividade e suplementar. Identifique as principais causas de perda de tempo e seu impacto.

===EXTERNO===
Análise das causas externas (NPE). Avalie o impacto das paradas externas e se há padrões recorrentes.

===RECOMENDACOES===
3-5 recomendações concretas, específicas e acionáveis para melhorar a produtividade, baseadas nos dados.

IMPORTANTE: Cada seção deve ter 2-4 parágrafos ou bullets concisos. Use linguagem direta.` : `Estruture o relatório com:
1. **Resumo Executivo** (2-3 frases com os números reais de produtividade)
2. **Indicadores Principais** (produtividade, suplementar, não produtivo, causas externas — com números)
3. **Pontos de Atenção** (principais problemas identificados)
4. **Análise por Especialidade** (destaques positivos e negativos)
5. **Análise por Função** (funções com melhor e pior performance)
6. **Análise por Horário** (padrões de produtividade ao longo do dia)
7. **Causas Externas** (análise das paradas externas se houver)
8. **Recomendações** (3-5 ações concretas e específicas)`}

Use linguagem objetiva e profissional. Seja preciso com os números. Não invente dados.`;

      const c = context;
      userPrompt = `Dados do período analisado (${c.periodo}):
Contrato/Obra: ${c.obra || "Todos"}

TOTAIS:
- Total bruto de amostras: ${c.totalAmostras}
- Total controlável (excluindo NPE): ${c.totalControlaveis}
- Produtivo: ${c.produtivo} amostras (${c.produtivoPct}% da base controlável)
- Suplementar: ${c.suplementar} amostras (${c.suplementarPct}% da base controlável)
- Não Produtivo: ${c.naoProdutivo} amostras (${c.naoProdutivoPct}% da base controlável)
- Não Produtivo Externo (NPE): ${c.externo} amostras (${c.externoPct}% do total bruto)

PRODUTIVIDADE POR ESPECIALIDADE (excluindo NPE):
${c.porEspecialidade || "Não disponível"}

PRODUTIVIDADE POR FUNÇÃO (excluindo NPE):
${c.porFuncao || "Não disponível"}

PRODUTIVIDADE POR HORÁRIO (excluindo NPE):
${c.porHorario || "Não disponível"}

TODAS AS DESCRIÇÕES (ranking por volume):
${c.topCategorias || "Não disponível"}

CAUSAS EXTERNAS (NPE):
${c.causasExternas || "Nenhuma registrada"}

Gere um relatório executivo completo e preciso com base nesses dados. Use EXATAMENTE os percentuais fornecidos.`;

    } else {
      return new Response(JSON.stringify({ error: "Tipo inválido. Use 'suggest', 'report' ou 'pdf-report'." }), {
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
        stream: type === "report" || type === "pdf-report",
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
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

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
