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

REGRA ABSOLUTA — PROIBIDO USAR NÚMEROS ABSOLUTOS DE AMOSTRAS:
- NUNCA mencione "X amostras", "Y registros", "Z ocorrências" nas análises.
- Todas as análises devem ser baseadas EXCLUSIVAMENTE em PERCENTUAIS (%).
- Exemplo CORRETO: "A Caldeiraria apresenta 69% de produtividade, acima da média geral de 62%."
- Exemplo INCORRETO: "A Caldeiraria apresentou 706 amostras produtivas."
- Os números de amostras são fornecidos apenas como referência interna de cálculo — NUNCA devem aparecer no texto final.

FÓRMULAS DE CÁLCULO:
- Existem 4 categorias: Produtivo, Suplementar, Não Produtivo e Não Produtivo Externo (NPE).
- NPE são eventos fora do controle da equipe (Causas Naturais, Vazamento, Cliente).
- Produtividade = Produtivo / (Total - NPE) × 100
- Suplementar% = Suplementar / (Total - NPE) × 100
- Não Produtivo% = Não Produtivo / (Total - NPE) × 100
- NPE é reportado separadamente como % do total bruto.

REGRA CRÍTICA DE ANÁLISE:
- SEMPRE analise e interprete os resultados pelo PERCENTUAL DE PRODUTIVIDADE (%), NÃO pelo número de amostras.
- Compare especialidades, funções e contratos pelo seu % de produtividade, não pela quantidade de amostras.
- Quando mencionar que uma especialidade ou função "se destaca", baseie-se no % de produtividade.

${isPdf ? `FORMATO DE SAÍDA OBRIGATÓRIO — Use EXATAMENTE estes marcadores:

===RESUMO===
Resumo executivo de 2-3 frases focando nos percentuais de produtividade. Destaque o índice geral e os pontos críticos. NÃO mencione números de amostras.

===CONTRATO===
Compare os contratos pelo % de produtividade de cada um. Destaque os melhores e piores desempenhos por produtividade %. NÃO use números absolutos.

===CATEGORIA===
Análise da distribuição percentual entre categorias. Explique o que a proporção Produtivo/Suplementar/NP significa para a operação. Use apenas %.

===PARETO===
Análise do Pareto por categorias. Identifique as causas que mais impactam a produtividade percentual. NÃO mencione contagem de amostras.

===PARETO_ESPECIALIDADE===
Análise do Pareto por especialidades. Qual o % de produtividade de cada especialidade. NÃO mencione número de amostras.

===PARETO_FUNCAO===
Análise do Pareto por funções. Qual o % de produtividade de cada função. NÃO mencione número de amostras.

===ESPECIALIDADE===
Compare as especialidades pelo % de produtividade. Identifique quais estão acima/abaixo da média. Analise as causas das diferenças. Use apenas percentuais.

===FUNCAO===
Compare as funções pelo % de produtividade. Identifique as de melhor e pior desempenho percentual e possíveis causas. Use apenas percentuais.

===NAO_PRODUTIVO===
Análise das causas de não produtividade. Identifique quais causas representam maior % de perda de tempo produtivo. Use apenas percentuais.

===EXTERNO===
Análise das causas externas (NPE). Avalie o impacto percentual no tempo total e padrões recorrentes. Use apenas percentuais.

===HORARIO===
Análise da produtividade % por faixa horária. Identifique os horários com maior e menor % produtivo.

===DIA_SEMANA===
OBRIGATÓRIO: Gere uma análise INDIVIDUAL para CADA dia da semana, mesmo que haja pouca variação.
Formato obrigatório:

- **Segunda-feira**: Comentário sobre o % de produtividade registrado neste dia e o que ele indica sobre o ritmo operacional.
- **Terça-feira**: Comentário sobre o % de produtividade e comparação com os demais dias.
- **Quarta-feira**: Comentário sobre o % de produtividade e continuidade operacional.
- **Quinta-feira**: Comentário sobre o % de produtividade e manutenção do ritmo.
- **Sexta-feira**: Comentário sobre o % de produtividade e estabilidade próximo ao encerramento da semana.

Cada dia deve ter pelo menos 1 frase analítica baseada no percentual. NÃO pule nenhum dia. NÃO use números de amostras.

===MES===
Análise da produtividade % mensal. Identifique tendências de melhora ou piora ao longo do tempo. Use apenas percentuais.

===RECOMENDACOES===
3-5 recomendações concretas e acionáveis para melhorar o % de produtividade, baseadas nos dados. NÃO mencione números de amostras.

IMPORTANTE: Cada seção deve ter 2-4 bullets concisos. Use linguagem direta. Foque SEMPRE em PERCENTUAIS de produtividade. NUNCA mencione "amostras", "registros" ou "ocorrências" nas análises.` : `Estruture o relatório com:
1. **Resumo Executivo** (2-3 frases com os percentuais reais de produtividade — SEM números de amostras)
2. **Indicadores Principais** (produtividade%, suplementar%, não produtivo%, NPE% — com números percentuais)
3. **Pontos de Atenção** (problemas identificados por baixo % de produtividade)
4. **Análise por Especialidade** (comparação de % produtividade entre especialidades)
5. **Análise por Função** (comparação de % produtividade entre funções)
6. **Análise por Horário** (padrões de % produtividade ao longo do dia)
7. **Causas Externas** (análise do impacto percentual das paradas externas)
8. **Recomendações** (3-5 ações concretas para melhorar os percentuais)

REGRA: NUNCA mencione "amostras", "registros" ou "ocorrências". Use SOMENTE percentuais.`}

Use linguagem objetiva e profissional. Seja preciso com os percentuais. Não invente dados. SEMPRE priorize a análise por % de produtividade. NUNCA mencione números absolutos de amostras.`;

      const c = context;
      userPrompt = `Dados do período analisado (${c.periodo}):
Contrato/Obra: ${c.obra || "Todos"}

TOTAIS:
- Total bruto: ${c.totalAmostras}
- Total controlável (excluindo NPE): ${c.totalControlaveis}
- Produtivo: ${c.produtivoPct}% da base controlável
- Suplementar: ${c.suplementarPct}% da base controlável
- Não Produtivo: ${c.naoProdutivoPct}% da base controlável
- Não Produtivo Externo (NPE): ${c.externoPct}% do total bruto

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

Gere um relatório executivo completo e preciso com base nesses dados. Use EXATAMENTE os percentuais fornecidos. NUNCA mencione números absolutos de amostras no texto das análises.`;

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

    if (type === "report" || type === "pdf-report") {
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
