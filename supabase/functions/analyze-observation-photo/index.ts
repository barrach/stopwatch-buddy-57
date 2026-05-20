import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você receberá DUAS imagens:
- IMAGEM 1: uma legenda mostrando o sistema de símbolos de contagem usado no formulário
- IMAGEM 2: foto tirada com celular do formulário preenchido

PASSO 1 — ESTUDE A LEGENDA (Imagem 1):
Observe cada símbolo e seu valor numérico correspondente antes de começar a leitura.

PASSO 2 — ORIENTE O FORMULÁRIO (Imagem 2):
A foto pode estar rotacionada ou inclinada. Localize o título "Formulário de Observações" ou "Megasteam" para identificar o topo. Reoriente mentalmente antes de ler.

PASSO 3 — IDENTIFIQUE AS ESPECIALIDADES:
Leia APENAS o que está escrito na coluna mais à esquerda "Categoria/Subcategoria".
Especialidades possíveis: Elétrica, Instrumentação, Caldeiraria, Andaime, Isolamento.
NUNCA invente especialidades que não estejam visivelmente escritas na foto.

PASSO 4 — LEIA CADA CÉLULA COM RACIOCÍNIO EXPLÍCITO:
Para cada célula preenchida, faça mentalmente:
1. "Vejo os seguintes símbolos nesta célula: [liste cada um usando a legenda da Imagem 1]"
2. "O valor de cada símbolo é: [liste cada valor]"
3. "A soma total é: [some todos]"

PASSO 5 — MAPEIE AS COLUNAS (da esquerda para a direita):
PRODUTIVO: col1=Trabalhando, col2=Planejando
SUPLEMENTAR: col3=Assistindo/Stand By, col4=Aguardando Instruções, col5=Aguardando Liberação de PT, col6=Aguardando Ferramenta ou Material, col7=Transitando no local de trabalho - com ferramenta, col8=Transitando no local de trabalho - sem ferramenta, col9=Transitando fora do local de trabalho - com ferramenta, col10=Transitando fora do local de trabalho - sem ferramenta
NÃO PRODUTIVO: col11=Pessoal, col12=Ocioso
NÃO PRODUTIVO EXTERNO: col13=Interferências Operacionais, col14=Fatores Climáticos

REGRAS FINAIS:
- Célula vazia = ignorar
- Célula ilegível = ignorar (não chute)
- NUNCA invente valores ou especialidades
- Retorne SOMENTE o JSON abaixo, sem markdown, sem texto antes ou depois:
{
  "observacoes": [
    {
      "especialidade": "Nome exato como escrito no formulário",
      "categoria": "Produtivo | Suplementar | Não Produtivo | Não Produtivo Externo",
      "descricao": "Nome exato da causa",
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