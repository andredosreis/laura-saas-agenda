"""LangChain tools for the lead agent (Phase 4b).

Each tool is created via a factory function that captures the tenant_id
in a closure. The agent never sees tenant_id as a tool argument — the LLM
cannot send a request that targets a different tenant.

Pattern:
    tools = [
        make_find_servico_tool(tenant_id),
        make_find_faq_tool(tenant_id),
        ...
    ]
    agent = create_agent(model, tools=tools, ...)

Usage from a test:
    tool = make_find_servico_tool("tenant-X")
    result = tool.invoke({"nome": "drenagem"})
"""

from __future__ import annotations

from langchain.tools import tool

from ..services import mongo_reader, tenant_knowledge


def make_find_servico_tool(tenant_id: str):
    """Build a `find_servico` tool bound to a specific tenant via closure.

    The returned tool reads the tenant's `servicos.md` (with fallback to
    `_default/`) and returns the section matching the requested service.
    """

    @tool
    def find_servico(nome: str) -> str:
        """Procura o detalhe completo de um serviço da clínica.

        Usa esta tool sempre que precisares de citar preço, duração,
        indicações ou contraindicações de um serviço — nunca inventes
        estes dados.

        Args:
            nome: Nome ou parte do nome do serviço, ex: "drenagem",
                "massagem relaxante", "limpeza de pele". Aceita variações
                sem acentos e em qualquer caixa.
        """
        section = tenant_knowledge.find_servico(tenant_id, nome)
        if section is None:
            return (
                f"Serviço '{nome}' não encontrado no catálogo desta clínica. "
                "Pergunta ao cliente para esclarecer ou diz que vais "
                "confirmar com a equipa."
            )
        return section

    return find_servico


def make_update_lead_info_tool(tenant_id: str, lead_id: str):
    """Build an async tool that captures lead intel as the conversation flows."""

    @tool
    async def update_lead_info(
        interesse: str | None = None,
        urgencia: str | None = None,
        observacoes: str | None = None,
    ) -> str:
        """Guarda informação que o lead acabou de revelar — interesse,
        urgência ou observação livre.

        Usa esta tool sempre que o lead te disser algo importante:
        - Que serviço/objectivo procura → `interesse` (string curta)
        - Quão urgente é → `urgencia` ("baixa", "media" ou "alta")
        - Detalhes que ajudam a Laura na avaliação → `observacoes`

        Não precisas saber tudo de uma vez — actualiza incrementalmente.

        Args:
            interesse: Resumo curto do interesse do lead (≤200 chars).
                Ex: "drenagem pré-evento de casamento", "modelagem
                pós-parto", "tratamento capilar para queda".
            urgencia: "baixa" (curiosidade), "media" (quer começar este
                mês), "alta" (preciso para data marcada / pós-cirurgia
                imediato).
            observacoes: Notas livres úteis para a Laura na avaliação
                (ex: "parto há 3 meses, queixa-se de retenção").
        """
        from ..services import marcai_client

        try:
            await marcai_client.update_lead_info(
                lead_id=lead_id,
                tenant_id=tenant_id,
                interesse=interesse,
                urgencia=urgencia,
                observacoes=observacoes,
            )
            saved: list[str] = []
            if interesse:
                saved.append(f"interesse='{interesse[:50]}'")
            if urgencia:
                saved.append(f"urgencia='{urgencia}'")
            if observacoes:
                saved.append(f"observacoes='{observacoes[:50]}'")
            return f"OK — guardado: {', '.join(saved) if saved else 'nada'}."
        except Exception as exc:
            return f"Erro ao guardar info do lead: {exc}. Continua a conversa."

    return update_lead_info


def make_qualify_lead_tool(tenant_id: str, lead_id: str):
    """Build an async tool that promotes a lead to 'qualificado'."""

    @tool
    async def qualify_lead(
        score: int,
        motivo_interesse: str,
        objetivos: list[str],
    ) -> str:
        """Marca o lead como QUALIFICADO — pronto para a Laura tratar.

        Chama esta tool **só** quando:
        1. Já recolheste informação suficiente (interesse + objectivos
           concretos)
        2. O lead mostra intenção real de avançar (pediu detalhes,
           aceitou avaliação ou marcou)
        3. Score que calculas é >= 60

        Critérios de scoring (mental):
        - +30 se descreveu sintomas/objectivos concretos
        - +25 se há urgência (data marcada, pós-op, evento próximo)
        - +20 se aceitou receber info ou avaliação
        - +30 se já agendou
        - +15 se pediu detalhes técnicos
        - −15 se "vou pensar" repetido sem progresso
        - −25 se "agora não tenho dinheiro"

        Args:
            score: Pontuação 0-100. Só promove se >=60.
            motivo_interesse: Frase curta (ex: "recuperação pós-parto").
            objetivos: Lista 1-3 objectivos concretos.
        """
        from ..services import marcai_client

        try:
            await marcai_client.qualify_lead(
                lead_id=lead_id,
                tenant_id=tenant_id,
                score=score,
                motivo_interesse=motivo_interesse,
                objetivos=objetivos,
            )
            return f"OK — lead qualificado com score={score}."
        except Exception as exc:
            return f"Erro ao qualificar lead: {exc}. Continua a conversa."

    return qualify_lead


def make_move_lead_stage_tool(tenant_id: str, lead_id: str):
    """Build an async tool to move the lead between pipeline stages."""

    @tool
    async def move_lead_stage(stage: str, motivo: str | None = None) -> str:
        """Move o lead para outro estágio do pipeline.

        Estágios válidos:
        - "qualificado" — depois de recolheres info suficiente
          (alternativa a qualify_lead — usa um ou outro)
        - "agendado" — DEPOIS do lead aceitar um slot e tu confirmares
          que vais passar à recepcionista
        - "perdido" — só quando o lead **explicitamente** desiste,
          recusa, ou diz claramente que não tem condições.

        NUNCA uses "convertido" — é manual pela equipa.

        Args:
            stage: "qualificado", "agendado" ou "perdido".
            motivo: Razão (obrigatório para "perdido"). Ex: "sem orçamento",
                "não interessada", "outro local mais perto".
        """
        from ..services import marcai_client

        try:
            await marcai_client.move_lead_stage(
                lead_id=lead_id,
                tenant_id=tenant_id,
                stage=stage,
                motivo=motivo,
            )
            return f"OK — lead movido para '{stage}'."
        except Exception as exc:
            return f"Erro ao mover stage: {exc}. Continua a conversa."

    return move_lead_stage


def make_create_appointment_tool(tenant_id: str, lead_id: str):
    """Build a tool that books the evaluation appointment."""

    @tool
    async def create_appointment(data: str, hora: str) -> str:
        """Marca a avaliação (Agendamento) com a Laura para o lead.

        Chama esta tool **APENAS** quando o lead aceita explicitamente
        um slot que tu acabaste de propor (ex: "11:00 dá-me jeito").
        A tool valida em tempo real que o slot ainda está livre — se
        entretanto outro cliente o ocupou, devolve erro e tens de
        propor outras opções.

        Args:
            data: Data no formato YYYY-MM-DD (ex: '2026-05-11').
            hora: Hora no formato HH:MM (ex: '11:00').
        """
        from datetime import datetime
        from zoneinfo import ZoneInfo

        from ..services import marcai_client

        try:
            local = datetime.fromisoformat(f"{data}T{hora}:00").replace(
                tzinfo=ZoneInfo("Europe/Lisbon")
            )
            iso_utc = local.astimezone(ZoneInfo("UTC")).isoformat()
            await marcai_client.create_appointment(
                lead_id=lead_id, tenant_id=tenant_id, data_hora_iso=iso_utc
            )
            return (
                f"OK — avaliação marcada para {data} às {hora} (status pendente "
                "de confirmação pela recepcionista). Confirma o agendamento ao "
                "lead com naturalidade."
            )
        except Exception as exc:
            msg = str(exc)
            if "409" in msg or "slot_taken" in msg:
                return (
                    "ERRO: o slot já foi ocupado por outro cliente. Pede "
                    "desculpa ao lead, chama get_available_slots de novo "
                    "para o mesmo dia e propõe alternativas."
                )
            return f"ERRO ao marcar: {msg}. Diz ao lead que vais passar à recepcionista."

    return create_appointment


def make_get_available_slots_tool(tenant_id: str):
    """Build a `get_available_slots` tool bound to a specific tenant.

    Day-by-day flow: returns slots for ONE specific day (the next
    available, or one the user requested). The agent then proposes
    that day's slots; if the lead asks for a different day, the agent
    calls the tool again with `dia=<YYYY-MM-DD>`.
    """

    @tool
    def get_available_slots(
        dia: str | None = None,
        dias_a_frente: int = 14,
    ) -> str:
        """Devolve TODOS os slots livres num dia específico.

        Estratégia day-by-day:
        - Se `dia` é None: devolve os slots do **próximo dia disponível**
          (mais próximo no tempo). Use isto na primeira oferta.
        - Se `dia` é uma data YYYY-MM-DD: devolve slots **só desse dia**.
          Use quando o lead pede um dia específico ("e na terça?",
          "tem segunda da próxima?").

        O nome do dia que o lead diz (ex: "terça da próxima") tens de
        converter para data com base em "Hoje é ..." do system prompt.

        Args:
            dia: Data em formato YYYY-MM-DD (ex: '2026-05-12') ou None
                para próximo dia disponível.
            dias_a_frente: Janela de busca em dias (default 14, max 30).
        """
        all_slots = mongo_reader.find_available_slots(
            tenant_id, dias_a_frente=min(dias_a_frente, 30)
        )
        if not all_slots:
            return (
                "Não há slots livres nos próximos dias. Pede ao lead a "
                "preferência e diz que a recepcionista entra em contacto."
            )

        # Group by date preserving chronological order
        by_date: dict[str, list[dict]] = {}
        for s in all_slots:
            by_date.setdefault(s["date"], []).append(s)

        if dia:
            day_slots = by_date.get(dia)
            if not day_slots:
                # Suggest closest day after the requested one
                future_days = [d for d in by_date if d >= dia]
                if future_days:
                    next_d = future_days[0]
                    return (
                        f"Não há slots livres no dia {dia}. "
                        f"O próximo dia com vagas é {next_d}. "
                        "Pergunta ao lead se outro dia próximo lhe convém."
                    )
                return (
                    f"Não há slots livres no dia {dia} nem nos seguintes. "
                    "Pede ao lead a preferência e passa à recepcionista."
                )
            target_date = dia
            day_slots_to_show = day_slots
        else:
            # Default: closest day with availability
            target_date = next(iter(by_date))
            day_slots_to_show = by_date[target_date]

        weekday = day_slots_to_show[0]["weekday"]
        lines = [f"- {s['time']}" for s in day_slots_to_show]
        return (
            f"Slots livres em {weekday} {target_date}:\n"
            + "\n".join(lines)
            + "\n\nPropõe estes horários ao lead. Se ele pedir outro dia, "
            "chama esta tool de novo com `dia=<YYYY-MM-DD>`."
        )

    return get_available_slots
