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

    Returns up to N free 30-min slots in the coming days. The agent
    should call this when the lead agrees to book an evaluation, then
    propose 2-3 options to the lead (not the full list — too many
    overwhelms).
    """

    @tool
    def get_available_slots(dias_a_frente: int = 7, max_slots: int = 8) -> str:
        """Devolve slots livres na agenda da clínica para os próximos dias.

        Usa esta tool **só quando o lead aceitar marcar uma avaliação** —
        nunca antes. Depois de a chamares, propõe ao lead 2-3 opções
        variadas (manhã/tarde, dias diferentes), nunca a lista completa.

        Args:
            dias_a_frente: Quantos dias à frente procurar (default 7,
                máximo razoável: 14).
            max_slots: Máximo de slots a devolver (default 8 — chega
                para escolher 2-3 opções).
        """
        slots = mongo_reader.find_available_slots(
            tenant_id, dias_a_frente=dias_a_frente
        )
        if not slots:
            return (
                "Não há slots livres nos próximos dias. Pede ao lead para "
                "indicar a sua preferência (dia/turno) e diz que a "
                "recepcionista entra em contacto para confirmar."
            )
        # Limit and format
        sample = slots[:max_slots]
        lines = [f"- {s['weekday']} {s['date']} às {s['time']}" for s in sample]
        return "Slots livres (escolhe 2-3 para propor ao lead):\n" + "\n".join(lines)

    return get_available_slots
