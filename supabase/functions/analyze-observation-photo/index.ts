import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um especialista em leitura de formulários industriais preenchidos à mão.

Receberá DUAS imagens:
— IMAGEM 1: legenda visual dos símbolos de contagem
— IMAGEM 2: foto do formulário preenchido

══════════════════════════════════════════
ETAPA 1 — SISTEMA DE CONTAGEM
══════════════════════════════════════════
Cada símbolo = número de traços/lados que o compõem:
  | (1 traço vertical)                    = 1
  ⌐ (2 traços, canto superior esquerdo)   = 2
  ⊓ (3 traços, U invertido)               = 3
  □ (4 traços, quadrado fechado)          = 4
  □\\ (5 traços, quadrado + diagonal)      = 5

SOMA: uma célula contém múltiplos símbolos em sequência. Some TODOS.

EXEMPLOS OBRIGATÓRIOS — memorize estes valores:
  □\\ + □\\ + ⌐         = 5+5+2     = 12
  □\\ + □\\ + |         = 5+5+1     = 11
  □  + □  + ⌐          = 4+4+2     = 10  ← NÃO é 9, o ⌐ final vale 2
  □\\ + □\\ + □\\ + | + ⊓ = 5+5+4+1+3 = 18
  □  + |               = 4+1       = 5   ← NÃO é 4, o | final vale 1
  □\\ + |               = 5+1       = 6   ← NÃO é 5, o | final vale 1

REGRA CRÍTICA: após identificar o último símbolo, sempre pergunte:
"Existe mais algum símbolo depois deste?" — só pare quando tiver certeza que a célula acabou.

══════════════════════════════════════════
ETAPA 2 — ORIENTAÇÃO DA FOTO
══════════════════════════════════════════
Localize "Megasteam" ou "Formulário de Observações" = topo.
Reoriente mentalmente: título no topo, especialidades à esquerda, colunas à direita.

══════════════════════════════════════════
ETAPA 3 — ESTRUTURA FIXA (baseada no PDF oficial)
══════════════════════════════════════════
LINHAS — especialidades (ordem fixa de cima para baixo):
  Linha 1 = "Elétrica"
  Linha 2 = "Isolamento"
  Linha 3 = "Caldeiraria"
  Linha 4 = "Andaime"

Use SEMPRE esses nomes exatos. Proibido usar variações.

COLUNAS — mapeamento oficial extraído do PDF:
  col B  = Trabalhando                                       → PRODUTIVO
  col C  = Planejando                                        → PRODUTIVO
  col D  = Assistindo / Stand By                             → SUPLEMENTAR
  col E  = Aguardando Instruções                             → SUPLEMENTAR
  col F  = Aguardando Liberação de PT                        → SUPLEMENTAR
  col G  = Aguardando Ferramenta ou Material                 → SUPLEMENTAR
  col H  = Transitando no local de trabalho - com ferramenta → SUPLEMENTAR
  col I  = Transitando no local de trabalho - sem ferramenta → SUPLEMENTAR
  col J  = Transitando fora do local de trabalho - com ferramenta → SUPLEMENTAR
  col K  = Transitando fora do local de trabalho - sem ferramenta → SUPLEMENTAR
  col L  = Pessoal                                           → NÃO PRODUTIVO
  col M  = Ocioso                                            → NÃO PRODUTIVO
  col N  = Interferências Operacionais                       → NÃO PRODUTIVO EXTERNO
  col O  = Fatores Climáticos e Consequências                → NÃO PRODUTIVO EXTERNO

ATENÇÃO: col L = Pessoal e col M = Ocioso são COLUNAS DIFERENTES.
Pessoal vem ANTES de Ocioso. Nunca confunda as duas.
Conte fisicamente as colunas da esquerda para direita — células vazias contam.

══════════════════════════════════════════
ETAPA 4 — LEITURA OBRIGATÓRIA CÉLULA A CÉLULA
══════════════════════════════════════════
Para cada linha, percorra colunas B→O. Para cada célula com marcas:
A) Linha → especialidade (posição 1=Elétrica, 2=Isolamento, 3=Caldeiraria, 4=Andaime)
B) Coluna → conte da esquerda, identifique a descrição e categoria
C) Liste cada símbolo visível na célula, comparando com Imagem 1
D) Some os valores de TODOS os símbolos, incluindo o último
E) Registre: especialidade + categoria + descrição + quantidade

NUNCA divida uma célula em dois registros.
NUNCA pule colunas vazias.
NUNCA invente valores ilegíveis.

══════════════════════════════════════════
ETAPA 5 — SAÍDA
══════════════════════════════════════════
Retorne SOMENTE este JSON, sem texto antes ou depois:

{
  "observacoes": [
    {
      "especialidade": "Elétrica | Isolamento | Caldeiraria | Andaime",
      "categoria": "Produtivo | Suplementar | Não Produtivo | Não Produtivo Externo",
      "descricao": "Nome exato da coluna",
      "quantidade": número inteiro maior que zero
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