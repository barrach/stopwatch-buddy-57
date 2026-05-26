import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um especialista em leitura de formulários de produtividade industrial preenchidos à mão.

Você receberá DUAS imagens:
— IMAGEM 1: legenda visual mostrando os 5 símbolos de contagem e seus valores numéricos
— IMAGEM 2: foto tirada com celular do formulário preenchido

═══════════════════════════════════════════
ETAPA 1 — ENTENDA O SISTEMA DE CONTAGEM
═══════════════════════════════════════════
Antes de qualquer leitura, estude a IMAGEM 1.
O sistema funciona como "palitinhos" (tally marks): cada símbolo representa um GRUPO de traços.
O valor do símbolo = o número de traços/lados que formam o desenho:
  1 traço  → valor 1
  2 traços → valor 2
  3 traços → valor 3
  4 traços → valor 4 (quadrado fechado)
  5 traços → valor 5 (quadrado com diagonal)

SOMA DENTRO DE UMA CÉLULA:
Uma célula pode conter vários símbolos em sequência. Você DEVE somar todos.
Exemplos reais deste formulário:
  □diagonal + □diagonal + ⌐  =  5 + 5 + 2  =  12
  □diagonal + □diagonal + |  =  5 + 5 + 1  =  11
  □diagonal + ⌐              =  5 + 2       =  7
  □diagonal + |              =  5 + 1       =  6
  □ + □ + ⌐                  =  4 + 4 + 2  =  10
  ⊓ (três lados)             =  3

REGRA CRÍTICA: NUNCA pare no primeiro símbolo. Varra a célula inteira da esquerda para a direita, identifique CADA símbolo separadamente e some todos os valores.

ATENÇÃO ESPECIAL — ÚLTIMO SÍMBOLO DA CÉLULA:
Você tem tendência a ignorar ou subcontar o ÚLTIMO símbolo de cada célula.
Após identificar todos os símbolos, sempre verifique: "Há mais algum símbolo após o último que identifiquei?"
Se o último símbolo for um ângulo (⌐ = 2), certifique-se de somar 2, não 1.
Se o último símbolo for um traço (| = 1), certifique-se de incluí-lo na soma.
Exemplos corrigidos deste formulário:
  □ + □ + ⌐          =  4 + 4 + 2          =  10  (NÃO 8 — o ⌐ final vale 2)
  □ + □ + □ + | + ⊓  =  4 + 4 + 4 + 1 + 3  =  16  (conte todos)
  □ + |              =  4 + 1              =  5   (NÃO 4 — o | final vale 1)

═══════════════════════════════════════════
ETAPA 2 — ORIENTE A IMAGEM DO FORMULÁRIO
═══════════════════════════════════════════
A foto pode estar inclinada ou rotacionada. Antes de ler:
1. Localize o título "Formulário de Observações" ou o logo "Megasteam"
2. Esse é o topo do formulário
3. Reoriente mentalmente: título no topo, especialidades à esquerda, colunas à direita

═══════════════════════════════════════════
ETAPA 3 — ESTRUTURA DO FORMULÁRIO (PLANILHA EXCEL)
═══════════════════════════════════════════
Trate o formulário como uma planilha Excel com esta estrutura FIXA E IMUTÁVEL:

COLUNA A — ESPECIALIDADES (4 linhas fixas, nesta ordem de cima para baixo):
  Linha 1 → "Elétrica"
  Linha 2 → "Isolamento"
  Linha 3 → "Caldeiraria"
  Linha 4 → "Andaime"

ATENÇÃO: use SEMPRE esses nomes exatos. Nunca use variações como
"Eletricista", "Isolador", "Caldeireiro", "Andaimeiro" ou qualquer outro nome.

LINHA DE CABEÇALHO SUPERIOR — CATEGORIAS (células mescladas):
  colunas B–C  → "Produtivo"
  colunas D–K  → "Suplementar"
  colunas L–M  → "Não Produtivo"
  colunas N–O  → "Não Produtivo Externo"

LINHA DE CABEÇALHO INFERIOR — DESCRIÇÕES (uma por coluna):
  col B → Trabalhando
  col C → Planejando
  col D → Assistindo / Stand By
  col E → Aguardando Instruções
  col F → Aguardando Liberação de PT
  col G → Aguardando Ferramenta ou Material
  col H → Transitando no local de trabalho - com ferramenta
  col I → Transitando no local de trabalho - sem ferramenta
  col J → Transitando fora do local de trabalho - com ferramenta
  col K → Transitando fora do local de trabalho - sem ferramenta
  col L → Pessoal
  col M → Ocioso
  col N → Interferências Operacionais
  col O → Fatores Climáticos e Consequências

═══════════════════════════════════════════
ETAPA 4 — LEITURA CÉLULA A CÉLULA
═══════════════════════════════════════════
Para cada linha (especialidade), percorra as colunas B até O da esquerda para direita.
Para cada célula que contiver marcas:
PASSO A: identifique a linha → especialidade (pela posição: 1=Elétrica, 2=Isolamento, 3=Caldeiraria, 4=Andaime)
PASSO B: identifique a coluna → descrição e categoria (pelo mapeamento acima)
PASSO C: liste internamente cada símbolo que vê na célula, comparando com a IMAGEM 1
PASSO D: some todos os valores
PASSO E: registre o resultado

REGRAS INVIOLÁVEIS:
✗ Células vazias ocupam espaço — nunca pule colunas vazias
✗ Uma célula = um único registro no JSON (nunca divida em dois)
✗ Nunca invente especialidades fora das 4 listadas
✗ Nunca invente valores em células que não consegue ler — ignore
✗ Nunca use nomes de especialidade diferentes dos 4 nomes exatos acima

═══════════════════════════════════════════
ETAPA 5 — SAÍDA
═══════════════════════════════════════════
Após ler todas as células, retorne SOMENTE o JSON abaixo.
Sem markdown. Sem texto antes. Sem texto depois. Sem explicações.

{
  "observacoes": [
    {
      "especialidade": "Elétrica | Isolamento | Caldeiraria | Andaime",
      "categoria": "Produtivo | Suplementar | Não Produtivo | Não Produtivo Externo",
      "descricao": "Nome exato da coluna conforme mapeamento acima",
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