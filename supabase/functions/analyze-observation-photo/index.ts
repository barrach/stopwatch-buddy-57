import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você está analisando um "Formulário de Observações - Avaliação de Produtividade da Mão-de-Obra Direta" da empresa Megasteam.

O formulário tem a seguinte estrutura:
- Coluna "Categoria/Subcategoria": lista as ESPECIALIDADES (Elétrica, Instrumentação, Caldeiraria, Andaime, Isolamento)
- As demais colunas representam CAUSAS agrupadas em 4 CATEGORIAS:

PRODUTIVO:
  - Trabalhando
  - Planejando
SUPLEMENTAR:
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
NÃO PRODUTIVO EXTERNO:
  - Interferências Operacionais
  - Fatores Climáticos

SISTEMA DE CONTAGEM (marcas feitas à mão nas células):
- Traço vertical simples ( | ) = 1
- Ângulo reto aberto ( ⌐ , tipo o canto superior esquerdo de um quadrado) = 2
- Três lados abertos ( forma de U invertido, três lados sem fechar) = 3
- Quadrado fechado sem marcação interna ( □ ) = 4
- Quadrado fechado com UMA linha diagonal simples de um canto ao outro (não forma X, é apenas uma barra atravessando o quadrado na diagonal) = 5
- Combinações são somadas (ex: quadrado+diagonal seguido de quadrado+diagonal seguido de quadrado+diagonal = 15; quadrado+diagonal seguido de traço vertical = 6; quadrado fechado seguido de ângulo = 6)
- Célula vazia = 0, ignorar

Retorne SOMENTE um JSON válido, sem markdown, sem explicações, no formato:
{
  "observacoes": [
    {
      "especialidade": "Nome da especialidade",
      "categoria": "Produtivo | Suplementar | Não Produtivo | Não Produtivo Externo",
      "descricao": "Nome exato da causa",
      "quantidade": número
    }
  ]
}

Inclua apenas células com valor maior que zero.`;

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