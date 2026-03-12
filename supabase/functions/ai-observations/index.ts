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
      systemPrompt = `Você é um especialista sênior em análise de produtividade de obras de engenharia industrial da MEGASTEAM.
Analise os dados de observações fornecidos e gere um relatório executivo em português com insights acionáveis.

REGRA ABSOLUTA — PROIBIDO USAR NÚMEROS ABSOLUTOS DE AMOSTRAS:
- NUNCA mencione "X amostras", "Y registros", "Z ocorrências" nas análises.
- Todas as análises devem ser baseadas EXCLUSIVAMENTE em PERCENTUAIS (%).
- Exemplo CORRETO: "A Caldeiraria apresenta 69% de produtividade, acima da média geral de 62%."
- Exemplo INCORRETO: "A Caldeiraria apresentou 706 amostras produtivas."

FÓRMULAS DE CÁLCULO:
- Existem 4 categorias: Produtivo, Suplementar, Não Produtivo e Não Produtivo Externo (NPE).
- NPE são eventos fora do controle da equipe (Causas Naturais, Vazamento/Interferência da Planta, Aguardando Liberação de PT).
- Produtividade = Produtivo / (Total - NPE) × 100
- Suplementar% = Suplementar / (Total - NPE) × 100
- Não Produtivo% = Não Produtivo / (Total - NPE) × 100
- NPE é reportado separadamente como % do total bruto.

ESTRUTURA OBRIGATÓRIA DE CADA ANÁLISE — Cada seção deve conter 3 partes:
1. **Diagnóstico**: O que o gráfico mostra (dados percentuais).
2. **Interpretação operacional**: O que isso significa na prática da obra industrial.
3. **Ação recomendada**: O que deve ser feito para melhorar o indicador.

REGRA DE COMPARAÇÃO: Sempre compare cada indicador com a média geral do projeto para contextualizar.

${isPdf ? `FORMATO DE SAÍDA OBRIGATÓRIO — Use EXATAMENTE estes marcadores:

===RESUMO===
Resumo executivo de 3-4 frases focando nos percentuais de produtividade. Destaque o índice geral, pontos críticos e a principal oportunidade de melhoria. NÃO mencione números de amostras.

===CONTRATO===
Compare os contratos pelo % de produtividade de cada um. Destaque os melhores e piores desempenhos. Para cada contrato aplique: Diagnóstico + Interpretação + Ação.

===CATEGORIA===
Análise da distribuição percentual entre categorias (Produtivo, Suplementar, Não Produtivo).
Estrutura obrigatória:
- Cite o % produtivo, % suplementar, % não produtivo.
- Interprete: "Em ambientes industriais bem organizados, o não produtivo normalmente é mantido abaixo de 12-15%."
- Recomende: "A redução combinada de atividades suplementares e não produtivas poderia elevar o índice de produtividade global para patamares próximos de X%."

===PARETO===
Análise do Pareto por categorias. Identifique obrigatoriamente:
- 1ª principal causa e seu % de impacto
- 2ª causa e seu %
- 3ª causa e seu %
Interprete o impacto operacional de cada causa e sugira ações corretivas específicas.

===PARETO_ESPECIALIDADE===
Análise do Pareto por especialidades. Compare cada especialidade pelo % de produtividade em relação à média geral. Identifique gargalos e motores de produtividade.

===PARETO_FUNCAO===
Análise do Pareto por funções. Compare cada função pelo % de produtividade. Identifique: função benchmark (melhor), funções intermediárias e função crítica (pior).

===ESPECIALIDADE===
Compare as especialidades pelo % de produtividade em relação à média geral.
Estrutura obrigatória:
- Melhor especialidade: nome, %, diferença em pontos percentuais acima da média.
- Especialidade intermediária: nome, %, posição relativa.
- Especialidade crítica: nome, %, impacto e causa provável.
Exemplo: "A Caldeiraria lidera com 69%, posicionando-se 7 pontos acima da média geral de 62%. A Elétrica apresenta 59%, indicando oportunidades de melhoria. Andaime apresenta 53%, sendo impactada por atividades de movimentação."

===FUNCAO===
Destaque obrigatoriamente:
- Função benchmark (melhor %): nome, %, por que se destaca.
- Função intermediária: nome, %, contexto.
- Função crítica (menor %): nome, %, causa provável e ação recomendada.
Exemplo: "O Encanador apresenta 74% de produtividade. Soldadores registram apenas 44%, indicando oportunidade significativa de melhoria no fluxo de soldagem."

===NAO_PRODUTIVO===
Análise avançada das causas de não produtividade controlável:
- Ranking das perdas por % de impacto (1ª, 2ª, 3ª causa).
- Interpretação operacional de cada causa principal.
- Plano de ação recomendado com bullets:
  • Ação específica para a 1ª causa
  • Ação específica para a 2ª causa
  • Ação específica para a 3ª causa
Exemplo para ociosidade: "A principal causa é a ociosidade (X%), normalmente associada a falhas de planejamento imediato das frentes. Ação: planejamento antecipado das atividades pelo encarregado."

===EXTERNO===
Análise das causas externas (NPE):
- Destaque o % do NPE sobre o total bruto.
- Cite as 3 principais causas externas.
- Interprete: "A eficiência global da obra depende fortemente da coordenação com a operação da planta e da gestão de liberações operacionais."
- Recomende ações de mitigação.

===HORARIO===
Análise da produtividade % por faixa horária:
- Identifique o horário mais produtivo e seu %.
- Identifique o horário menos produtivo e seu %.
- Analise a tendência geral (manhã vs tarde).
Exemplo: "O período da tarde apresenta os maiores níveis de produtividade, com destaque para 14:00 e 16:00. O menor desempenho ocorre às 15:00, indicando possível queda pós-intervalo."

===DIA_SEMANA===
OBRIGATÓRIO: Análise INDIVIDUAL para CADA dia da semana com TODAS as porcentagens do gráfico.
Formato obrigatório para CADA dia:

- **Segunda-feira**: Produtividade: X% | Suplementar: X% | Não Produtivo: X%
  Interpretação: A segunda-feira representa o momento de retomada operacional. Oscilações nesse dia estão associadas à organização inicial das frentes e liberação de permissões.

- **Terça-feira**: Produtividade: X% | Suplementar: X% | Não Produtivo: X%
  Interpretação: Normalmente representa o padrão da semana, com equipes totalmente mobilizadas.

- **Quarta-feira**: Produtividade: X% | Suplementar: X% | Não Produtivo: X%
  Interpretação: Geralmente o ponto de maior estabilidade operacional.

- **Quinta-feira**: Produtividade: X% | Suplementar: X% | Não Produtivo: X%
  Interpretação: Pode apresentar aumento de atividades suplementares de preparação para encerramento.

- **Sexta-feira**: Produtividade: X% | Suplementar: X% | Não Produtivo: X%
  Interpretação: Frequentemente apresenta aumento de atividades de fechamento e preparação para a semana seguinte.

NUNCA pule nenhum dia. NUNCA use números de amostras.

===MES===
Análise da produtividade % mensal. Identifique tendências de melhora ou piora ao longo do tempo.

===RECOMENDACOES===
5 recomendações concretas, cada uma como um BLOCO SEPARADO numerado.
Formato OBRIGATÓRIO — cada bloco deve seguir EXATAMENTE esta estrutura:

Problema 1 — [Nome curto do problema]
- **Problema**: Descrição do que foi identificado (usar %)
- **Causa provável**: Por que isso ocorre na prática da obra
- **Ação recomendada**: O que fazer concretamente para resolver
- **Responsável sugerido**: Quem deve executar (ex: Supervisor de Caldeiraria, Encarregado, Planejamento)
- **Impacto esperado**: Qual a melhoria projetada em pontos percentuais de produtividade

Problema 2 — [Nome curto]
- **Problema**: ...
- **Causa provável**: ...
- **Ação recomendada**: ...
- **Responsável sugerido**: ...
- **Impacto esperado**: ...

(continuar até Problema 5)

IMPORTANTE: Ordenar os problemas do MAIOR impacto na produtividade para o menor. Cada bloco DEVE ser claramente separado com "Problema N — Título".

IMPORTANTE: Cada seção deve ter análise substantiva (3-6 frases). Use linguagem técnica e profissional de engenharia industrial. Foque SEMPRE em PERCENTUAIS. NUNCA mencione "amostras", "registros" ou "ocorrências".` : `Estruture o relatório com:
1. **Resumo Executivo** (3-4 frases com percentuais reais — SEM números de amostras)
2. **Indicadores Principais** (produtividade%, suplementar%, não produtivo%, NPE%)
3. **Pontos de Atenção** (problemas por baixo % de produtividade — com Diagnóstico + Interpretação + Ação)
4. **Análise por Especialidade** (comparação de % produtividade entre especialidades vs média geral)
5. **Análise por Função** (benchmark, intermediária, crítica — com % e ações)
6. **Análise por Horário** (horário mais/menos produtivo, tendência do dia)
7. **Causas de Não Produtividade** (ranking de causas por % com plano de ação)
8. **Causas Externas** (impacto % do NPE e ações de mitigação)
9. **Recomendações** (5 ações no formato: Problema → Causa → Ação → Responsável → Impacto esperado)

REGRA: NUNCA mencione "amostras", "registros" ou "ocorrências". Use SOMENTE percentuais. Cada análise deve ter: Diagnóstico + Interpretação operacional + Ação recomendada.`}

Use linguagem técnica, objetiva e profissional de engenharia industrial. Seja preciso com os percentuais. Não invente dados. SEMPRE priorize a análise por % de produtividade. NUNCA mencione números absolutos de amostras. Cada análise deve conter obrigatoriamente: Diagnóstico + Interpretação operacional + Ação recomendada.`;

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

PRODUTIVIDADE POR DIA DA SEMANA (excluindo NPE):
${c.porDiaSemana || "Não disponível"}

PRODUTIVIDADE POR MÊS (excluindo NPE):
${c.porMes || "Não disponível"}

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
