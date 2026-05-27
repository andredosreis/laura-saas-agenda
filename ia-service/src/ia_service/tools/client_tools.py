"""LangChain tools for the client agent (Client Lifecycle Phase 1).

Reuses `find_servico` and `get_available_slots` from `lead_tools.py`.
Adds client-specific tools: `get_my_appointments`, `create_client_appointment`.

All tools capture tenantId + clienteId via closure — the LLM never sees
these values as arguments and cannot target a different tenant/client.
"""

from __future__ import annotations

from langchain.tools import tool

from ..services import marcai_client


def make_get_my_packages_tool(tenant_id: str, cliente_id: str):

    @tool
    async def get_my_packages() -> str:
        """Consulta os pacotes activos da cliente e quantas sessoes restam.

        Usa esta tool quando a cliente pergunta:
        - "tenho pacote activo?"
        - "quantas sessoes tenho?"
        - "quantas sessoes faltam?"

        Nao precisa de argumentos.
        """
        try:
            packages = await marcai_client.get_client_packages(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
            )
            if not packages:
                return "A cliente nao tem pacotes activos de momento."

            lines = []
            for pkg in packages:
                nome = pkg.get("pacoteNome", "Pacote")
                restantes = pkg.get("sessoesRestantes", 0)
                contratadas = pkg.get("sessoesContratadas", 0)
                usadas = pkg.get("sessoesUsadas", 0)
                expira = pkg.get("dataExpiracao")
                exp_str = f" (expira: {expira})" if expira else ""
                lines.append(
                    f"- {nome}: {restantes} sessoes restantes "
                    f"({usadas} usadas de {contratadas}){exp_str}"
                )

            return (
                f"Pacotes activos ({len(packages)}):\n"
                + "\n".join(lines)
                + "\n\nMostra ao cliente de forma natural."
            )
        except Exception as exc:
            return f"Erro ao consultar pacotes: {exc}"

    return get_my_packages


def make_get_my_appointments_tool(tenant_id: str, cliente_id: str):

    @tool
    async def get_my_appointments() -> str:
        """Consulta os proximos agendamentos da cliente.

        Usa esta tool quando a cliente pergunta:
        - "quando e a minha proxima sessao?"
        - "tenho algo marcado?"
        - "quais sao os meus agendamentos?"

        Nao precisa de argumentos — a cliente ja esta identificada.
        """
        try:
            appointments = await marcai_client.get_client_appointments(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
            )
            if not appointments:
                return "A cliente nao tem agendamentos futuros."

            lines = []
            for appt in appointments:
                dt = appt.get("dataHora", "?")
                status = appt.get("status", "?")
                tipo = appt.get("tipo", "Sessao")
                servico = appt.get("servicoAvulsoNome", "")
                label = servico or tipo
                lines.append(f"- {label}: {dt} (status: {status})")

            return (
                f"Proximos agendamentos ({len(appointments)}):\n"
                + "\n".join(lines)
                + "\n\nMostra estes ao cliente de forma natural."
            )
        except Exception as exc:
            return f"Erro ao consultar agendamentos: {exc}"

    return get_my_appointments


def make_create_client_appointment_tool(tenant_id: str, cliente_id: str):

    @tool
    async def create_client_appointment(data: str, hora: str) -> str:
        """Marca uma sessao para a cliente.

        Chama esta tool APENAS quando a cliente aceita explicitamente
        um slot que acabaste de propor (ex: "11:00 da-me jeito").
        A tool valida em tempo real que o slot ainda esta livre.

        Args:
            data: Data no formato YYYY-MM-DD (ex: '2026-06-01').
            hora: Hora no formato HH:MM (ex: '11:00').
        """
        from datetime import datetime
        from zoneinfo import ZoneInfo

        try:
            local = datetime.fromisoformat(f"{data}T{hora}:00").replace(
                tzinfo=ZoneInfo("Europe/Lisbon")
            )
            iso_utc = local.astimezone(ZoneInfo("UTC")).isoformat()
            await marcai_client.create_client_appointment(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
                data_hora_iso=iso_utc,
                tipo="Sessao",
            )
            return (
                f"OK — sessao marcada para {data} as {hora}. "
                "Confirma o agendamento ao cliente com naturalidade."
            )
        except Exception as exc:
            msg = str(exc)
            if "409" in msg or "slot_taken" in msg:
                return (
                    "ERRO: o slot ja foi ocupado. Pede desculpa, "
                    "chama get_available_slots de novo e propoe alternativas."
                )
            return f"ERRO ao marcar: {msg}. Diz ao cliente que vais passar a recepcao."

    return create_client_appointment
