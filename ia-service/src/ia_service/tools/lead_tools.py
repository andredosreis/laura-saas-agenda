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

from ..services import tenant_knowledge


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
