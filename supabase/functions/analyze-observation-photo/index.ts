import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você receberá DUAS imagens:
- IMAGEM 1: legenda dos símbolos de contagem e seus valores numéricos
- IMAGEM 2: foto de um formulário preenchido à mão

Trate o formulário como uma PLANILHA EXCEL com a seguinte estrutura:

COLUNA A (fixa, não conta dados):
Contém os nomes das especialidades. Ignore o texto escrito — use sempre a POSIÇÃO da linha:
  Linha 1 = "Elétrica"
  Linha 2 = "Isolamento"
  Linha 3 = "Caldeiraria"
  Linha 4 = "Andaime"

LINHA 1 DO CABEÇALHO (categorias — células mescladas em verde):
Agrupa as colunas de dados em 4 blocos:
  cols B-C    → "Produtivo"
  cols D-K    → "Suplementar"
  cols L-M    → "Não Produtivo"
  cols N-O    → "Não Produtivo Externo"

LINHA 2 DO CABEÇALHO (descrições — em azul):
Cada coluna tem um nome exato:
  col B  → Trabalhando
  col C  → Planejando
  col D  → Assistindo / Stand By
  col E  → Aguardando Instruções
  col F  → Aguardando Liberação de PT
  col G  → Aguardando Ferramenta ou Material
  col H  → Transitando no local de trabalho - com ferramenta
  col I  → Transitando no local de trabalho - sem ferramenta
  col J  → Transitando fora do local de trabalho - com ferramenta
  col K  → Transitando fora do local de trabalho - sem ferramenta
  col L  → Pessoal
  col M  → Ocioso
  col N  → Interferências Operacionais
  col O  → Fatores Climáticos e Consequências

CORPO DA PLANILHA (células em amarelo — onde estão os traços):
Cada célula corresponde a uma interseção de linha (especialidade) e coluna (descrição).
Para cada célula preenchida:
1. Identifique a linha → especialidade (pela posição: 1=Elétrica, 2=Isolamento, 3=Caldeiraria, 4=Andaime)
2. Identifique a coluna → descrição e categoria (pelo mapeamento acima)
3. Compare os símbolos com a Imagem 1 e some todos os valores encontrados na célula

REGRAS CRÍTICAS:
- Células vazias contam como colunas — NUNCA pule colunas vazias
- Uma célula pode ter múltiplos símbolos — some TODOS
- Ignore qualquer texto nas linhas de especialidade — use apenas a posição
- Nunca invente valores ou especialidades
- Ignore células ilegíveis

Retorne SOMENTE este JSON, sem texto antes ou depois:
{
  "observacoes": [
    {
      "especialidade": "Elétrica | Isolamento | Caldeiraria | Andaime",
      "categoria": "Produtivo | Suplementar | Não Produtivo | Não Produtivo Externo",
      "descricao": "Nome exato da coluna conforme mapeamento acima",
      "quantidade": número inteiro
    }
  ]
}`;

// Legenda fixa do sistema de contagem (carregada uma vez do Storage público)
const LEGEND_URL =
  "https://adpwboqltejtfzcvrvon.supabase.co/storage/v1/object/public/assets/legend.png";
let LEGEND_DATA_URL: string | null = null;
async function getLegendDataUrl(): Promise<string> {
  if (LEGEND_DATA_URL) return LEGEND_DATA_URL;
  const resp = await fetch(LEGEND_URL);
  if (!resp.ok) throw new Error(`Falha ao carregar legenda: ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  LEGEND_DATA_URL = `data:image/png;base64,${btoa(bin)}`;
  return LEGEND_DATA_URL;
}

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
    const legendUrl = await getLegendDataUrl();

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
              { type: "text", text: "Imagem 1 — Legenda do sistema de símbolos:" },
              { type: "image_url", image_url: { url: legendUrl } },
              { type: "text", text: "Imagem 2 — Formulário preenchido para análise:" },
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: "Analise o formulário da Imagem 2 usando a legenda da Imagem 1 e retorne o JSON." },
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