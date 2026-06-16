"""Lead intel extractor (Phase 4d-2).

Replaces "agent decides which tools to call" (inconsistent) with a
deterministic structured-output extraction step. The LLM is given the
last few turns of conversation and asked to return a strict JSON
matching the LeadIntel schema. Python then applies updates to the DB
directly — no tool calls involved.

This runs BEFORE the conversational agent. It costs an extra ~$0.0003
per turn (gpt-4o-mini, ~800 tokens) but guarantees the lead's intel is
always captured when present.

Usage:
    intel = await extract_intel(history_messages, current_message)
    if intel.interesse or intel.urgencia or intel.observacoes:
        await marcai_client.update_lead_info(...)
    if intel.score_delta != 0 and lead score reaches 60:
        await marcai_client.qualify_lead(...)
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from ..config import settings

# ─────────────────────────── Schema ───────────────────────────


class LeadIntel(BaseModel):
    """Structured intel extracted from a lead's recent messages.

    All fields are optional — only fill in what the lead has clearly
    revealed. If unsure, leave None.
    """

    nome: Optional[str] = Field(
        None,
        description=(
            "Primeiro nome (ou nome completo) do lead — só preencher "
            "se ele se apresentou claramente nas mensagens. "
            "ex: 'Maria', 'João Silva'. "
            "Não inferir nem completar de saudações genéricas. null se "
            "ainda não disse o nome."
        ),
    )

    interesse: Optional[str] = Field(
        None,
        description=(
            "Resumo curto (≤200 chars) do que o lead procura. "
            "Só preencher se o lead disse claramente o objectivo "
            "(ex: 'recuperação pós-parto', 'preparação pré-cirurgia', "
            "'tratamento capilar para queda'). Se ainda não está claro, "
            "deixar null."
        ),
    )

    urgencia: Optional[Literal["baixa", "media", "alta"]] = Field(
        None,
        description=(
            "Pressão de tempo do lead. "
            "**DEFAULT = null**. Só preencher se há sinal TEMPORAL explícito. "
            "alta: tem data marcada — 'casamento em X', 'evento próxima semana', "
            "'pós-op recente', 'preciso com urgência', 'quanto antes possível'. "
            "media: indicou janela curta — 'este mês', 'nas próximas semanas', "
            "'queria começar agora'. "
            "baixa: explicitamente sem pressa — 'estou só a explorar', "
            "'depois decido', 'sem pressa'. "
            "**null** se a mensagem é só descrição de problema/sintoma sem qualquer "
            "marcador temporal (ex: 'tenho dores há semanas' SEM dizer urgência → null). "
            "**null** se é só pergunta de serviço/preço sem sinal temporal. "
            "NÃO inventar 'media' por defeito — null é a resposta correcta quando "
            "o lead não comunicou urgência."
        ),
    )

    observacoes: Optional[str] = Field(
        None,
        description=(
            "Detalhe livre útil para a Laura na avaliação clínica "
            "(ex: 'parto há 3 meses', 'fez lipo, médico recomendou 10 sessões DLA'). "
            "Só preencher se há facto concreto novo. Não duplicar interesse. "
            "\n\n"
            "**Quando o lead reporta uma condição médica** (diabetes, hipertensão, "
            "gravidez, pós-op recente, trombose, cancro, ferida aberta, doença "
            "autoimune, medicação imunossupressora, etc.), PREFIXA o valor com "
            "'⚠ Condição médica: ' para a Laura ver destacado no Kanban. "
            "Exemplos: "
            "'⚠ Condição médica: diabetes (tipo não especificado)', "
            "'⚠ Condição médica: gravidez 7 meses', "
            "'⚠ Condição médica: pós-lipo há 2 semanas'. "
            "Esta convenção é o sinal de que o lead requer cuidado clínico extra "
            "e o agent deve pedir autorização médica antes de marcar tratamento."
        ),
    )

    intent: Literal[
        "primeira_msg",
        "descrever_problema",
        "pergunta_preco",
        "duvida_servico",
        "pedir_agendamento",
        "escolher_slot",
        "hesitacao",
        "desistir",
        "agradecer_encerrar",
        "outra",
    ] = Field(
        ...,
        description=(
            "Intenção principal da mensagem mais recente do lead. "
            "primeira_msg: saudação inicial sem mais contexto. "
            "descrever_problema: revelou sintoma/objectivo (parto, dor, evento). "
            "pergunta_preco: pediu valores. "
            "duvida_servico: pediu detalhe técnico (duração, contraindicações). "
            "pedir_agendamento: aceitou marcar avaliação. "
            "escolher_slot: indicou hora específica (ex: '15:00 dá-me jeito'). "
            "hesitacao: 'vou pensar', 'depois falo', evasivas. "
            "desistir: 'não me interessa', 'vou para outra clínica'. "
            "agradecer_encerrar: 'obrigada', 'tchau' depois de marcação. "
            "outra: nada do acima."
        ),
    )

    score_delta: int = Field(
        0,
        ge=-30,
        le=30,
        description=(
            "Quanto adicionar ao score de qualificação do lead (-30 a +30). "
            "Heurística sugerida: "
            "+30 descreveu sintomas+objectivos concretos. "
            "+25 mostrou urgência clara. "
            "+20 aceitou avaliação. "
            "+15 pediu detalhe técnico. "
            "+10 escolheu slot específico. "
            "0 mensagem genérica/saudação. "
            "-15 hesitou repetidamente. "
            "-25 disse 'sem dinheiro agora'. "
            "-30 desistiu explicitamente."
        ),
    )

    perdido_motivo: Optional[str] = Field(
        None,
        description=(
            "Se intent=desistir, motivo curto. "
            "ex: 'sem orçamento', 'optou por outra clínica', 'não interessada'. "
            "null caso contrário."
        ),
    )

    objection_type: Optional[
        Literal[
            "preco",  # "não tenho dinheiro", "está caro"
            "tempo",  # "estou ocupada", "agora não dá"
            "distancia",  # "moro longe", "não sei se consigo ir"
            "duvida_servico",  # "será que funciona?", "preciso de pensar mais"
            "outra_clinica",  # "estou a comparar", "vi outra"
            "geral",  # hesitação sem motivo claro ("vou pensar")
        ]
    ] = Field(
        None,
        description=(
            "Quando o lead hesita, recusa marcar ou se mostra evasivo, "
            "categoriza o tipo de objecção que está por trás (mesmo "
            "implícita). Permite à IA aplicar a estratégia certa de "
            "superação. null se o lead avança com confiança. "
            "\n\nExemplos por classe:\n"
            "- preco: 'não tenho dinheiro agora', 'está caro', 'sem orçamento'\n"
            "- tempo: 'estou super ocupada', 'agora não dá jeito', "
            "'no momento não tenho disponibilidade'\n"
            "- distancia: 'moro em <outra cidade>', 'não sei se consigo "
            "deslocar-me', 'fica longe de mim'\n"
            "- duvida_servico: 'será que funciona?', 'tenho dúvidas se é "
            "para mim', 'preciso pensar melhor'\n"
            "- outra_clinica: 'estou a comparar com outra', "
            "'vou ficar pela clínica que frequento', "
            "'já tenho outra opção', 'vou ficar onde estou'\n"
            "- geral: 'vou pensar', 'depois decido', evasiva sem motivo concreto\n"
            "Preenche SEMPRE que intent=hesitacao ou intent=desistir tenha causa identificável — "
            "se o lead deu QUALQUER pista do porquê, classifica em vez de deixar null."
        ),
    )


# ─────────────────────── Extractor prompt ───────────────────────


EXTRACTOR_SYSTEM_PROMPT = """És um extractor de informação de leads para uma clínica
de estética em Portugal. Lê as mensagens trocadas (saudações + leads + respostas anteriores
da assistente Laura) e extrai factos sobre este lead num JSON estrito.

# Regra-mãe: SEMPRE LEEM o histórico ANTES de classificar

A mensagem do lead nunca deve ser analisada isoladamente. O turno anterior
da Laura é decisivo para perceber o que o lead está a responder.

# Regras

## 1. `nome` — extracção contextual obrigatória

- Se na mensagem ANTERIOR a Laura perguntou o nome ("posso saber o seu nome?",
  "qual o seu nome?", "como se chama?", "primeiro nome?") E a mensagem actual
  do lead é uma palavra única ou frase curta (1-3 palavras) que parece um nome
  próprio (capitalizada ou nome reconhecível), EXTRAI essa palavra como `nome`.

  Exemplos críticos:
  - Laura: "Posso saber o seu nome?" → Lead: "Maria" → **`nome="Maria"`**
  - Laura: "Como se chama?" → Lead: "Sou a Ana" → **`nome="Ana"`**
  - Laura: "Posso saber o seu primeiro nome?" → Lead: "Deys" → **`nome="Deys"`**
  - Laura: "Como se chama?" → Lead: "Deys Silva" → **`nome="Deys Silva"`**
  - Laura: "Posso saber o seu nome?" → Lead: "André" → **`nome="André"`**

- NÃO extraias nome se a mensagem do lead é claramente outra coisa
  (descrição de problema, pergunta, etc.) mesmo que contenha uma maiúscula.

## 2. `interesse` / `urgencia` / `observacoes`

Só preenche se a INFORMAÇÃO está claramente nas mensagens DESTE lead.
Não inventes nem completes lacunas.

**`urgencia` — default é null, NUNCA inventes:**

- Descrever um sintoma ou problema (ex: "tenho dores na lombar há 2 semanas")
  **NÃO** implica urgência. Se o lead não disse `casamento em X`, `pós-op`,
  `preciso urgente`, `este mês`, ou "explorar/sem pressa" → `urgencia=null`.
- "Sim quero marcar" SEM mais info temporal → `urgencia=null`.
- "Quanto custa?" → `urgencia=null` (nem há descrição de problema).

Falsos positivos a evitar:
- ❌ Lead: "tenho dores há 2 semanas" → `urgencia=media`  ← ERRADO, não há sinal temporal
- ❌ Lead: "sim, vamos marcar" → `urgencia=media`  ← ERRADO, sem janela
- ✅ Lead: "tenho dores há 2 semanas" → `urgencia=null`  ← CERTO
- ✅ Lead: "casamento daqui a 1 semana" → `urgencia=alta`
- ✅ Lead: "estou só a explorar opções" → `urgencia=baixa`

## 3. `intent` — contextual, NÃO isolado

`intent` reflete a INTENÇÃO da última mensagem do lead **no contexto da conversa**.
Olha sempre para as mensagens anteriores antes de classificar.

Casos especiais críticos:

- **`primeira_msg` é APENAS para o primeiro greeting** sem qualquer interacção
  anterior da assistente. Se já houve UMA resposta da Laura, NÃO uses
  `primeira_msg` — usa `outra` ou a categoria que melhor descreve.

- **Resposta a pergunta de nome** (`"Maria"`, `"Deys"`, `"Sou o André"` após
  Laura pedir nome) → `outra` (e extrai `nome`). NUNCA `primeira_msg`.

- **Mensagens curtas após proposta de slots** ("as 9", "9h", "sim", "ok",
  "pode ser", "essa", "este") → `escolher_slot` ou `pedir_agendamento`.

- **Mensagens curtas com "?"** ("as 9 da?", "tem na quarta?", "depois 16h?")
  após proposta de slots → `escolher_slot`. NUNCA `primeira_msg`.

- **"quanto custa?"**, **"qual o valor?"** em qualquer momento → `pergunta_preco`.

- **Mencionar fonte de chegada** ("vi o anuncio no face", "vi no insta",
  "amigo recomendou") sem outra info → `outra`. NUNCA `primeira_msg`.

- **"Vocês fazem X?"** / **"Tem Y?"** / **"Trabalham com Z?"** — perguntas a
  confirmar oferta de serviço → `duvida_servico`. NUNCA `outra`. Ex:
  - "vcs fazem drenagem linfática?" → `duvida_servico`
  - "têm massagem ayurvédica?" → `duvida_servico`
  - "trabalham com depilação a laser?" → `duvida_servico`

- **Distinguir `hesitacao` de `desistir` (importante)**:
  - `hesitacao` = pista de objecção mas não fecha porta. Ex: "agora não tenho
    dinheiro", "estou ocupada", "moro longe não sei se vou conseguir", "vou
    pensar", "depois falo". O lead **deixa abertura**.
  - `desistir` = recusa explícita e definitiva. Ex: "não me interessa", "vou
    para outra clínica", "vou ficar pela clínica que já frequento", "não
    obrigado". O lead **fecha a porta**.

  Em dúvida entre os dois, preferir `hesitacao` (menos destrutivo — permite à
  IA tentar reverter). Só `desistir` quando há recusa clara.

- **REGRA DURA — `distância` é `hesitacao`, NÃO `desistir`**:
  Quando o lead menciona localização longe ou impedimento geográfico pela
  PRIMEIRA vez (mesmo na MESMA mensagem), classifica como `hesitacao` com
  `objection_type=distancia`. **Só passa a `desistir` se o lead REPETIR a
  recusa por distância numa mensagem posterior** ou disser claramente que
  não vai (ex: "definitivamente não vou", "esquece").

  Exemplos:
  - "moro em Lisboa" → `hesitacao` + `objection_type=distancia` ✅
  - "fica longe de mim" → `hesitacao` + `objection_type=distancia` ✅
  - "não sei se vou conseguir ir, é longe" → `hesitacao` + `distancia` ✅
  - "não, é muito longe, não vou" → `desistir` (recusa explícita) ✅
  - "não vou, depois falo" → `hesitacao` ("depois falo" deixa abertura)

  Razão: distância é uma objecção que a IA pode tentar superar (oferecer
  horário fim-de-semana, etc.). Classificar como `desistir` no primeiro
  sinal corta a oportunidade.

- **REGRA DURA — `condição médica` é `descrever_problema`**:
  Quando o lead menciona uma condição (diabetes, hipertensão, gravidez,
  pós-op, etc.), o intent é `descrever_problema` (mesmo que pareça só uma
  pergunta tipo "qual massagem para diabetes?"). Captura também a condição
  em `observacoes` com prefixo `⚠ Condição médica: ...` — ver schema acima.

- **Descrever necessidade SEM dor concreta** ("queria começar tratamento este
  mês", "queria fazer drenagens") → `descrever_problema` (objectivo é
  problema o suficiente). NUNCA `outra` quando há intenção de tratamento.

- **Off-topic persistente / conversa social = `desistir`**:
  Se olhares para as últimas mensagens do histórico e o lead:
  - Recusou falar de serviços da clínica
  - Quer "só conversar" / "bater um papo" / temas off-topic (futebol,
    música, notícias, vida pessoal)
  - Já recebeu redirect da assistente ≥2 vezes e continua off-topic
  → classifica como `desistir` com `perdido_motivo: "sem interesse
  em serviços"` e `score_delta: -30`.

  Lead que quer usar o bot como chatbot social não é lead — é abuso de
  tokens. Marcar como perdido desactiva a IA para esse número.

Regra-tese: em caso de ambiguidade entre `primeira_msg` e outra categoria,
escolhe **a outra** — `primeira_msg` é o ÚLTIMO recurso, apenas para o
primeiríssimo "olá" / "boa tarde" sem contexto anterior.

`outra` é também ÚLTIMO recurso — antes de classificar `outra`, perguntar-te:
não é `duvida_servico`? não é `descrever_problema`? não é `hesitacao`?

## 4. `score_delta`

Segue a heurística do schema. Em dúvida, usa 0.
- Lead deu o nome (responde a pergunta da Laura) → +5
- Lead descreveu problema concreto → +20 a +30
- Lead escolheu slot → +10 a +15
- Lead hesitou ("vou pensar") → -10 a -15

## 5. `perdido_motivo`

SÓ se intent=desistir.

## 6. Língua

Português europeu nas strings que preenches (interesse/observacoes).

---

Não respondes ao lead — só extrais. Não escrevas conversação."""


# ─────────────────────── LLM factory ───────────────────────


def _get_extractor_llm():
    """Build an LLM bound to LeadIntel schema for structured output.

    Model is read from settings — `settings.extractor_model_openai` for
    OpenAI provider, `settings.extractor_model_gemini` for Gemini. Both
    are env-overridable (`EXTRACTOR_MODEL_OPENAI=gpt-4o` to run the eval
    against a bigger model without code changes).
    """
    if settings.llm_provider == "openai":
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            model=settings.extractor_model_openai,
            temperature=0.3,
            api_key=settings.openai_api_key,
            timeout=15,
        )
    else:
        from langchain_google_genai import ChatGoogleGenerativeAI

        llm = ChatGoogleGenerativeAI(
            model=settings.extractor_model_gemini,
            temperature=0,
            google_api_key=settings.google_api_key,
            timeout=15,
        )

    return llm.with_structured_output(LeadIntel)


# ─────────────────────── Public API ───────────────────────


async def extract_intel(messages: list[dict]) -> Optional[LeadIntel]:
    """Run the extractor on a conversation; return LeadIntel or None on failure.

    `messages` is the same list the conversational agent receives —
    last ~5-10 turns in {role, content} format.
    """
    if not messages:
        return None

    extractor = _get_extractor_llm()
    payload = [{"role": "system", "content": EXTRACTOR_SYSTEM_PROMPT}] + messages
    try:
        result: LeadIntel = await extractor.ainvoke(payload)
        return result
    except Exception:
        # Extractor failures are non-fatal — orchestrator continues with
        # the conversational agent without intel updates.
        return None
