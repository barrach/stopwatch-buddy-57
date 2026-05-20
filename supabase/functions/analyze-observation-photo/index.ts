import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você está analisando uma foto tirada com celular de um "Formulário de Observações - Avaliação de Produtividade da Mão-de-Obra Direta" da empresa Megasteam.

IMPORTANTE — ORIENTAÇÃO E ÂNGULO:
A foto pode estar rotacionada, inclinada ou com perspectiva distorcida. Antes de interpretar qualquer dado, você deve:
1. Identificar a orientação correta do formulário pelo título "Formulário de Observações" ou pelo cabeçalho "Megasteam"
2. Mentalmente reorientar o formulário para leitura normal (título no topo, colunas verticais, linhas horizontais)
3. Só então interpretar os dados das células

ESTRUTURA DO FORMULÁRIO:
- A primeira coluna à esquerda "Categoria/Subcategoria" contém as ESPECIALIDADES nas linhas:
  Elétrica, Instrumentação, Caldeiraria, Andaime, Isolamento
- As demais colunas à direita representam CAUSAS, agrupadas nesta ordem exata da esquerda para direita:

PRODUTIVO (primeiras colunas):
  - Trabalhando
  - Planejando
SUPLEMENTAR (colunas do meio):
  - Assistindo / Stand By
  - Aguardando Instruções
  - Aguardando Liberação de PT
  - Aguardando Ferramenta ou Material
  - Transitando no local de trabalho - com ferramenta
  - Transitando no local de trabalho - sem ferramenta
  - Transitando fora do local de trabalho - com ferramenta
  - Transitando fora do local de trabalho - sem ferramenta
NÃO PRODUTIVO:
  - Pessoal
  - Ocioso
NÃO PRODUTIVO EXTERNO (últimas colunas):
  - Interferências Operacionais
  - Fatores Climáticos

SISTEMA DE CONTAGEM — marcas feitas à mão dentro das células:
- Traço vertical simples ( | ) = 1
- Ângulo reto aberto (canto superior esquerdo de um quadrado, tipo ⌐) = 2
- Três lados abertos (forma de U invertido, três lados sem fechar o quarto) = 3
- Quadrado fechado sem marcação interna ( □ ) = 4
- Quadrado fechado com UMA linha diagonal simples de canto a canto (não forma X, é apenas uma barra atravessando o quadrado) = 5
- Combinações na mesma célula são SOMADAS:
  Exemplos: três quadrados com diagonal = 5+5+5 = 15 | quadrado com diagonal + traço = 5+1 = 6 | quadrado + ângulo = 4+2 = 6
- Célula vazia ou ilegível = ignorar (não incluir no resultado)

REGRAS DE LEITURA:
- Se a foto estiver inclinada, corrija mentalmente a perspectiva antes de ler
- Siga rigorosamente a ordem das colunas descrita acima para identificar a causa correta
- Nunca invente valores — se uma célula estiver ilegível, ignore-a
- Inclua apenas células com valor maior que zero e que você tenha certeza razoável do conteúdo
- Se tiver dúvida entre dois valores possíveis, escolha o menor

Retorne SOMENTE um JSON válido, sem markdown, sem explicações, sem texto antes ou depois, exatamente neste formato:
{
  "observacoes": [
    {
      "especialidade": "Nome da especialidade",
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