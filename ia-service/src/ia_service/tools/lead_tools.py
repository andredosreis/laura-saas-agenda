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
