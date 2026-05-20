import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você está analisando uma foto tirada com celular de um "Formulário de Observações - Avaliação de Produtividade da Mão-de-Obra Direta" da empresa Megasteam.

== PASSO 1 — ORIENTAR O FORMULÁRIO ==
A foto pode estar rotacionada ou inclinada. Antes de qualquer coisa:
- Localize o título "Formulário de Observações" ou o logo "Megasteam" para identificar qual lado é o topo
- Reoriente mentalmente o formulário: título no topo, especialidades na coluna da esquerda, causas nas colunas à direita

== PASSO 2 — IDENTIFICAR AS ESPECIALIDADES ==
Leia apenas o que está ESCRITO na coluna mais à esquerda "Categoria/Subcategoria".
As especialidades possíveis são: Elétrica, Instrumentação, Caldeiraria, Andaime, Isolamento.
REGRA CRÍTICA: só inclua especialidades que estejam visivelmente escritas na foto. NUNCA invente ou assuma especialidades que não consiga ler claramente.

== PASSO 3 — ENTENDER O SISTEMA DE CONTAGEM ==
Cada marca dentro de uma célula representa pessoas observadas. Os símbolos são:
SÍMBOLO → VALOR:
- Traço vertical ( | ) → 1
- Ângulo reto, tipo canto superior esquerdo de quadrado ( ⌐ com linha horizontal saindo para direita) → 2
- Três lados sem fechar (U invertido, parece um quadrado sem o lado de baixo) → 3
- Quadrado fechado completo ( □ ) → 4
- Quadrado fechado com uma linha diagonal de canto a canto (não forma X, é só uma barra) → 5

REGRA DE SOMA: uma célula pode conter MÚLTIPLOS símbolos. Você deve identificar CADA símbolo presente e somar todos.
Exemplos de soma:
- Quadrado-diagonal + Quadrado-diagonal + traço = 5 + 5 + 1 = 11
- Quadrado-diagonal + Quadrado-diagonal + ângulo = 5 + 5 + 2 = 12
- Quadrado-diagonal + ângulo = 5 + 2 = 7
- Quadrado-diagonal + traço = 5 + 1 = 6
- Três-lados = 3

== PASSO 4 — LER CADA CÉLULA COM RACIOCÍNIO EXPLÍCITO ==
Para cada célula preenchida, faça OBRIGATORIAMENTE este processo mental antes de calcular:
1. "Nesta célula vejo os seguintes símbolos: [liste cada um]"
2. "O valor de cada símbolo é: [liste cada valor]"
3. "A soma total é: [some todos]"
Só depois de completar esse raciocínio para TODAS as células, monte o JSON final.

== PASSO 5 — MAPEAR AS COLUNAS ==
As colunas aparecem nesta ordem da esquerda para direita:
PRODUTIVO:
  col 1 → Trabalhando
  col 2 → Planejando
SUPLEMENTAR:
  col 3 → Assistindo / Stand By
  col 4 → Aguardando Instruções
  col 5 → Aguardando Liberação de PT
  col 6 → Aguardando Ferramenta ou Material
  col 7 → Transitando no local de trabalho - com ferramenta
  col 8 → Transitando no local de trabalho - sem ferramenta
  col 9 → Transitando fora do local de trabalho - com ferramenta
  col 10 → Transitando fora do local de trabalho - sem ferramenta
NÃO PRODUTIVO:
  col 11 → Pessoal
  col 12 → Ocioso
NÃO PRODUTIVO EXTERNO:
  col 13 → Interferências Operacionais
  col 14 → Fatores Climáticos

== PASSO 6 — REGRAS FINAIS ==
- Célula vazia = ignorar, não incluir no resultado
- Se não conseguir ler um símbolo com certeza, ignore a célula
- NUNCA invente especialidades ou valores que não consiga ver claramente
- Inclua apenas células com quantidade maior que zero

== SAÍDA ==
Após completar o raciocínio interno de todos os passos acima, retorne SOMENTE o JSON abaixo, sem markdown, sem explicações, sem texto antes ou depois:
{
  "observacoes": [
    {
      "especialidade": "Nome exato como escrito no formulário",
      "categoria": "Produtivo | Suplementar | Não Produtivo | Não Produtivo Externo",
      "descricao": "Nome exato da causa conforme listado acima",
      "quantidade": número inteiro
    }
  ]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado");

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Analise esta imagem do formulário e retorne o JSON conforme instruído." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Contate o administrador." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway erro [${aiResp.status}]: ${errText}`);
    }

    const aiData = await aiResp.json();
    let content: string = aiData.choices?.[0]?.message?.content ?? "";

    // Strip markdown fences if present
    content = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: { observacoes: Array<{ especialidade: string; categoria: string; descricao: string; quantidade: number }> };
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to find a JSON object substring
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Resposta da IA não pôde ser interpretada como JSON.");
      parsed = JSON.parse(match[0]);
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("analyze-observation-photo error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});