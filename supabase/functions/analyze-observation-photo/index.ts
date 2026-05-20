import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você receberá DUAS imagens:
- IMAGEM 1: tabela de referência visual dos símbolos
- IMAGEM 2: foto do formulário

CONTEXTO:
Este formulário registra observações de produtividade de mão de obra.
Cada célula contém marcas feitas à mão que representam pessoas observadas.
As marcas seguem um sistema de agrupamento visual parecido com "palitinhos":
| = 1, ⌐ = 2, ⊓ = 3, □ = 4, □com diagonal = 5.
Múltiplas marcas numa célula são SOMADAS. Ex: □diagonal + □diagonal + | = 11.

ETAPA 1 — ORIENTAÇÃO:
Identifique onde está o cabeçalho "Megasteam" e reoriente o formulário mentalmente.

ETAPA 2 — MAPEAMENTO LIVRE (faça isso internamente antes de gerar o JSON):
Para cada linha do formulário, descreva o que vê célula a célula, da esquerda para direita:
"Linha [especialidade]: célula 1 tem [descreva as marcas], célula 2 tem [descreva], ..."
Use linguagem livre: "vejo dois grupos de marcas, o primeiro parece um quadrado com uma linha diagonal, o segundo parece um traço vertical"

ETAPA 3 — CONVERSÃO:
Após descrever tudo, converta cada descrição para número usando a tabela da Imagem 1.

ETAPA 4 — ESPECIALIDADES (ORDEM FIXA DAS LINHAS):
As linhas do formulário aparecem SEMPRE nesta ordem de cima para baixo:
linha 1 → Elétrica
linha 2 → Isolamento
linha 3 → Caldeiraria
linha 4 → Andaime
ATENÇÃO CRÍTICA: esta ordem é FIXA e não muda.
Mesmo que uma linha esteja completamente vazia, ela ainda ocupa seu lugar.
NUNCA identifique a especialidade pelo texto escrito na linha — use SEMPRE a POSIÇÃO.
A linha 1 é sempre Elétrica, a linha 2 é sempre Isolamento, mesmo que pareça diferente na foto.

ETAPA 5 — MAPEAMENTO DE COLUNAS (ORDEM OBRIGATÓRIA):
O formulário tem cabeçalho duplo. Após a coluna de especialidades, as colunas de dados aparecem nesta ordem EXATA da esquerda para direita:
col 1  → "Trabalhando"                                   → PRODUTIVO
col 2  → "Planejando"                                    → PRODUTIVO
col 3  → "Assistindo / Stand By"                         → SUPLEMENTAR
col 4  → "Aguardando Instruções"                         → SUPLEMENTAR
col 5  → "Aguardando Liberação de PT"                    → SUPLEMENTAR
col 6  → "Aguardando Ferramenta ou Material"             → SUPLEMENTAR
col 7  → "Transitando no local de trabalho - com ferramenta" → SUPLEMENTAR
col 8  → "Transitando no local de trabalho - sem ferramenta" → SUPLEMENTAR
col 9  → "Transitando fora do local de trabalho - com ferramenta" → SUPLEMENTAR
col 10 → "Transitando fora do local de trabalho - sem ferramenta" → SUPLEMENTAR
col 11 → "Pessoal"                                       → NÃO PRODUTIVO
col 12 → "Ocioso"                                        → NÃO PRODUTIVO
col 13 → "Interferências Operacionais"                   → NÃO PRODUTIVO EXTERNO
col 14 → "Fatores Climáticos"                            → NÃO PRODUTIVO EXTERNO

ATENÇÃO CRÍTICA: conte as colunas FISICAMENTE da esquerda para direita.
Células vazias CONTAM como colunas — NÃO pule colunas vazias.
Uma célula vazia na col 2 NÃO significa que a próxima célula preenchida é col 2.
Se col 2 está vazia e col 3 tem marcas, o resultado é col 3 = "Assistindo / Stand By", NÃO "Planejando".
Antes de atribuir uma descrição, conte explicitamente: "esta é a Nª célula a partir da especialidade, portanto col N = ...".

REGRAS:
- Célula vazia ou ilegível = ignorar
- Nunca invente valores
- Retorne SOMENTE este JSON:
{
  "observacoes": [
    {
      "especialidade": "Nome como escrito no formulário",
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