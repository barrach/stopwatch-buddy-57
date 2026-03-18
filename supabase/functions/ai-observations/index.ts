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

Categorias e critérios detalhados:
- Produtivo:
  • Trabalhando: Executando esforço físico no local de trabalho, posicionando peças, limpando/preparando superfícies.
  • Planejando: Efetuando medições, analisando desenhos/croquis, fazendo levantamento de materiais, dando/recebendo instruções do técnico/supervisor, realizando DDS ou elaborando APR.
- Suplementar:
  • Aguardando Instruções: Detecta-se através de perguntas (pode ou não estar no local de trabalho).
  • Aguardando Movimentação de Carga: Esperando vez na equipe, aguardando movimentação de máquinas, apoio stand-by.
  • Aguardando Ferramenta ou Material: Recebendo/entregando ferramentas, no almoxarifado/ferramentaria, aguardando guindaste/caminhão/apoio.
  • Aguardando Liberação de PT: Solicitando/devolvendo PT, aguardando emissão de PT ou manobra de liberação.
  • Transitando no local de trabalho - com ferramenta: Deslocando-se dentro da Unidade/Oficinas, portando ferramentas.
  • Transitando no local de trabalho - sem ferramenta: Deslocando-se dentro da Unidade/Oficinas, sem ferramentas.
  • Transitando fora do local de trabalho - com ferramenta: Deslocando-se em ruas, portando ferramentas.
  • Transitando fora do local de trabalho - sem ferramenta: Deslocando-se em ruas, sem ferramentas.
- Não Produtivo:
  • Pessoal: No bebedouro ou sanitário, exclusivamente.
  • Ocioso: No café, cantina, copa, banco, área médica, bate-papo entre funcionários.
- Não Produtivo Externo:
  • Fatores Climáticos e Consequências, Interferências Operacionais.

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

TABELA DE REFERÊNCIA DE FAIXAS IDEAIS (VERDADE ABSOLUTA — use como base de comparação):
| Categoria              | % Ideal         |
|------------------------|-----------------|
| Produtivo (total)      | 68% (Trabalhando 63% + Planejando 5%) |
|   - Trabalhando        | 63%             |
|   - Planejando         | 5% (máximo)     |
| Suplementar (total)    | 30% (≈3,75% por subcategoria) |
|   - Aguardando Instruções | ≤3,75%       |
|   - Assistindo / Stand By | ≤3,75%       |
|   - Aguardando Ferramenta ou Material | ≤3,75% |
|   - Aguardando Liberação de PT | ≤3,75% |
|   - Transitando com/sem ferramenta | ≤3,75% cada |
| Não Produtivo          | 2% (máximo)     |
|   - Pessoal            | mínimo          |
|   - Ocioso             | mínimo          |
| NPE (Externo)          | 0% (ideal)      |
|   - Fatores Climáticos e Consequências | 0% |
|   - Interferências Operacionais | 0%     |
NOTA: A soma ideal é 68% + 30% + 2% + 0% = 100%.

REGRA CRÍTICA — ANÁLISE INDIVIDUAL POR CATEGORIA:
🚨 PROIBIDO agrupar categorias (ex: "Produtivo + Suplementar" ou "Tempo produtivo total").
Cada uma das 4 categorias (Produtivo, Suplementar, Não Produtivo, NPE) DEVE ser analisada SEPARADAMENTE.

LÓGICA DE CLASSIFICAÇÃO OBRIGATÓRIA — Para CADA categoria, compare o valor real com a faixa ideal e classifique:
- ✅ Dentro do ideal: valor dentro da faixa esperada
- ⚠️ Acima do ideal: valor superior ao máximo aceitável (para Suplementar, NP, NPE)
- 🔻 Abaixo do ideal: valor inferior ao mínimo esperado (para Produtivo)
- 🔴 Crítico: desvio severo que compromete a operação

DIAGNÓSTICO OBRIGATÓRIO NO INÍCIO DE CADA ANÁLISE:
Diagnóstico:
- Produtivo: X% (classificação baseada na tabela)
- Suplementar: X% (classificação baseada na tabela)
- Não Produtivo: X% (classificação baseada na tabela)
- NPE: X% (classificação baseada na tabela)

A IA deve se comportar como um Engenheiro de Produção + Analista de Performance. Rigor máximo, sem suavizar problemas críticos.

CATEGORIAS E SUBCATEGORIAS (use para interpretar causas operacionais):
- Produtivo: Trabalhando (esforço físico, posicionando peças, limpando superfícies) e Planejando (medições, análise de desenhos, levantamento de materiais, instruções, DDS, APR).
- Suplementar: Aguardando Instruções, Aguardando Movimentação de Carga, Aguardando Ferramenta ou Material, Aguardando Liberação de PT, Transitando com/sem ferramenta dentro/fora do local de trabalho.
- Não Produtivo: Pessoal (bebedouro/sanitário) e Ocioso (café, cantina, bate-papo).
- NPE (Não Produtivo Externo): Fatores Climáticos e Consequências, Interferências Operacionais.

REGRA ABSOLUTA — PROIBIDO USAR NÚMEROS ABSOLUTOS DE AMOSTRAS:
- NUNCA mencione "X amostras", "Y registros", "Z ocorrências" nas análises.
- Todas as análises devem ser baseadas EXCLUSIVAMENTE em PERCENTUAIS (%).
- Exemplo CORRETO: "A Caldeiraria apresenta 69% de produtividade, acima da média geral de 62%."
- Exemplo INCORRETO: "A Caldeiraria apresentou 706 amostras produtivas."

FÓRMULAS DE CÁLCULO:
- Existem 4 categorias: Produtivo, Suplementar, Não Produtivo e Não Produtivo Externo (NPE).
- NPE são eventos fora do controle da equipe (Fatores Climáticos e Consequências, Interferências Operacionais).
- IMPORTANTE: O NPE ENTRA na conta da produtividade global. O denominador é o TOTAL BRUTO (incluindo NPE).
- Produtividade = Produtivo / Total × 100
- Suplementar% = Suplementar / Total × 100
- Não Produtivo% = Não Produtivo / Total × 100
- NPE% = NPE / Total × 100
- A soma das 4 categorias deve ser 100% do total.

ESTRUTURA OBRIGATÓRIA DE CADA ANÁLISE — Cada seção deve conter 3 partes:
1. **Diagnóstico**: O que o gráfico mostra (dados percentuais reais da obra).
2. **Interpretação operacional**: O que isso significa na prática da obra industrial. Cite o que cada subcategoria significa operacionalmente. Compare se os valores estão dentro do esperado ou se há desvios preocupantes, SEM citar os benchmarks numéricos.
3. **Ação recomendada**: O que deve ser feito para melhorar o indicador. Foque em ações concretas e práticas.

REGRA: NÃO cite os benchmarks diretamente (ex: "meta de 60%", "benchmark de 16%"). Em vez disso, use expressões qualitativas: "acima do esperado", "dentro do padrão para obras bem gerenciadas", "significativamente abaixo do ideal", "há margem expressiva de melhoria".

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
Compare as especialidades pelo % de produtividade EXATAMENTE como fornecido nos dados (valores do gráfico).
REGRA ABSOLUTA: Use os percentuais EXATOS fornecidos na seção "PRODUTIVIDADE POR ESPECIALIDADE". NÃO recalcule. NÃO invente valores.
Estrutura obrigatória:
Melhor especialidade: [nome], com [X,X%] de produtividade (Trabalhando X% + Planejando X%). [Diagnóstico + Interpretação + Ação].
Especialidade intermediária: [nome], com [X,X%] de produtividade. [Diagnóstico + Interpretação + Ação].
Especialidade crítica: [nome], com [X,X%] de produtividade. [Diagnóstico + Interpretação + Ação].
PROIBIDO: usar formatos como "**Nome (X%)**". Use APENAS o formato "Melhor especialidade:", "Especialidade intermediária:", "Especialidade crítica:".

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
OBRIGATÓRIO: Análise INDIVIDUAL para CADA faixa horária que tenha dados, SEPARADA POR MARCADOR DE HORA.
Use o formato EXATO abaixo — cada horário DEVE começar com ===HORA:XX:XX=== para permitir renderização separada no PDF.

===HORA:07:00===
Produtividade: X% | Suplementar: X% | Não Produtivo: X%
Diagnóstico: [o que os dados mostram para este horário, comparando com a média geral].
Interpretação: [contexto operacional do horário — início do turno, pós-intervalo, etc.].
Ação recomendada: [ação específica para este horário].

===HORA:08:00===
Produtividade: X% | Suplementar: X% | Não Produtivo: X%
Diagnóstico: [dados do horário].
Interpretação: [contexto operacional].
Ação recomendada: [ação específica].

(continuar para CADA horário que possua dados — ex: 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00)

NUNCA pule nenhum horário que tenha dados. NUNCA use números de amostras. Compare com a média geral da obra, SEM citar benchmarks numéricos.

===DIA_SEMANA===
OBRIGATÓRIO: Análise INDIVIDUAL para CADA dia da semana, SEPARADA POR MARCADOR DE DIA.
Use o formato EXATO abaixo — cada dia DEVE começar com ===DIA:Nome=== para permitir renderização separada no PDF.

===DIA:Segunda-feira===
Produtividade: X% | Suplementar: X% | Não Produtivo: X%
Diagnóstico: [o que os dados mostram para este dia, comparando com a média geral].
Interpretação: A segunda-feira representa o momento de retomada operacional. Oscilações estão associadas à organização inicial das frentes e liberação de permissões. [Avalie se os valores estão dentro do esperado ou se há desvios preocupantes.]
Ação recomendada: [ação específica para este dia].

===DIA:Terça-feira===
Produtividade: X% | Suplementar: X% | Não Produtivo: X%
Diagnóstico: [dados do dia].
Interpretação: Normalmente representa o padrão da semana, com equipes totalmente mobilizadas.
Ação recomendada: [ação específica].

===DIA:Quarta-feira===
Produtividade: X% | Suplementar: X% | Não Produtivo: X%
Diagnóstico: [dados do dia].
Interpretação: Geralmente o ponto de maior estabilidade operacional.
Ação recomendada: [ação específica].

===DIA:Quinta-feira===
Produtividade: X% | Suplementar: X% | Não Produtivo: X%
Diagnóstico: [dados do dia].
Interpretação: Pode apresentar aumento de atividades suplementares de preparação.
Ação recomendada: [ação específica].

===DIA:Sexta-feira===
Produtividade: X% | Suplementar: X% | Não Produtivo: X%
Diagnóstico: [dados do dia].
Interpretação: Frequentemente apresenta aumento de atividades de fechamento.
Ação recomendada: [ação específica].

===DIA:Sábado===
(Se houver dados) Produtividade: X% | Suplementar: X% | Não Produtivo: X%
Diagnóstico e interpretação.

NUNCA pule nenhum dia que tenha dados. NUNCA use números de amostras. Compare com a média geral da obra, SEM citar benchmarks numéricos.

===MES===
OBRIGATÓRIO: Análise INDIVIDUAL para CADA mês que tenha dados, SEPARADA POR MARCADOR DE MÊS.
Use o formato EXATO abaixo — cada mês DEVE começar com ===MES:Nome=== para permitir renderização separada no PDF.

===MES:Jan===
Produtividade: X% | Suplementar: X% | Não Produtivo: X% | NPE: X%
Diagnóstico: [o que os dados mostram para este mês, comparando com a média geral].
Interpretação: [tendência operacional do mês, evolução ou regressão das frentes].
Ação recomendada: [ação específica para este mês].

===MES:Fev===
Produtividade: X% | Suplementar: X% | Não Produtivo: X% | NPE: X%
Diagnóstico: [dados do mês].
Interpretação: [contexto operacional].
Ação recomendada: [ação específica].

(continuar para CADA mês que possua dados)

NUNCA pule nenhum mês que tenha dados. NUNCA use números de amostras. Compare com a média geral da obra, SEM citar benchmarks numéricos.

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

IMPORTANTE: Cada seção deve ter análise substantiva (3-6 frases). Use linguagem técnica e profissional de engenharia industrial. Foque SEMPRE em PERCENTUAIS. NUNCA mencione "amostras", "registros" ou "ocorrências".` : `INÍCIO OBRIGATÓRIO — Antes de qualquer seção, apresente o DIAGNÓSTICO COMPARATIVO com a tabela de referência:

## Diagnóstico Comparativo (Real vs Ideal)
- **Produtivo**: X% (Ideal: 68% = Trabalhando 63% + Planejando 5%) → classificação
- **Suplementar**: X% (Ideal: ≤30%) → classificação
- **Não Produtivo**: X% (Ideal: ≤2%) → classificação
- **NPE (Externo)**: X% (Ideal: 0%) → classificação

Classificações: ✅ Dentro do ideal | ⚠️ Acima/Abaixo do ideal | 🔴 Crítico

Depois do diagnóstico, estruture o relatório com:
1. **Interpretação do Cenário** (o que o diagnóstico significa operacionalmente — 3-4 frases)
2. **Indicadores Principais** (produtividade%, suplementar%, não produtivo%, NPE% — cada um comparado à faixa ideal)
3. **Pontos de Atenção** (problemas por baixo % de produtividade — com Diagnóstico + Interpretação + Ação)
4. **Análise por Especialidade** (use EXATAMENTE os % fornecidos em "PRODUTIVIDADE POR ESPECIALIDADE". NÃO recalcule. Formato: Melhor especialidade: / Especialidade intermediária: / Especialidade crítica:)
5. **Causas de Não Produtividade** (ranking de causas por % com plano de ação)
6. **Causas Externas** (impacto % do NPE e ações de mitigação)
7. **Recomendações** (5 ações no formato: Problema → Causa → Ação → Responsável → Impacto esperado)

REGRA CRÍTICA: Cada categoria DEVE ser analisada INDIVIDUALMENTE. PROIBIDO agrupar (ex: "Produtivo + Suplementar"). NUNCA mencione "amostras", "registros" ou "ocorrências". Use SOMENTE percentuais. Cada análise deve ter: Diagnóstico + Interpretação operacional + Ação recomendada.`}

Use linguagem técnica, objetiva e profissional de engenharia industrial. Seja preciso com os percentuais. Não invente dados. SEMPRE priorize a análise por % de produtividade. NUNCA mencione números absolutos de amostras. Cada análise deve conter obrigatoriamente: Diagnóstico + Interpretação operacional + Ação recomendada.`;

      const c = context;
      userPrompt = `Dados do período analisado (${c.periodo}):
Contrato/Obra: ${c.obra || "Todos"}

TOTAIS:
- Total de amostras: ${c.totalAmostras}
- Produtivo: ${c.produtivoPct}% do total
- Suplementar: ${c.suplementarPct}% do total
- Não Produtivo: ${c.naoProdutivoPct}% do total
- Não Produtivo Externo (NPE): ${c.externoPct ?? c.npePct ?? 0}% do total

PRODUTIVIDADE POR ESPECIALIDADE (VALORES DO GRÁFICO — USE EXATAMENTE ESTES VALORES):
${c.porEspecialidade || "Não disponível"}
REGRA ABSOLUTA: Os valores acima são os MESMOS exibidos no gráfico. PROIBIDO recalcular. Use-os literalmente na análise.

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
