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
        - quando a cliente quer reagendar ou cancelar

        Nao precisa de argumentos — a cliente ja esta identificada.
        """
        from datetime import datetime, timezone

        try:
            appointments = await marcai_client.get_client_appointments(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
            )
            if not appointments:
                return "A cliente nao tem agendamentos futuros."

            now = datetime.now(timezone.utc)
            lines = []
            for appt in appointments:
                appt_id = appt.get("_id", "?")
                dt_str = appt.get("dataHora", "?")
                status = appt.get("status", "?")
                tipo = appt.get("tipo", "Sessao")
                servico = appt.get("servicoAvulsoNome", "")
                label = servico or tipo

                hours_until = "?"
                try:
                    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                    h = (dt - now).total_seconds() / 3600
                    hours_until = f"{h:.0f}h"
                except Exception:
                    pass

                can_reschedule = (
                    "SIM"
                    if hours_until != "?" and float(hours_until.replace("h", "")) >= 24
                    else "NAO (<24h)"
                )
                lines.append(
                    f"- [id={appt_id}] {label}: {dt_str} (status: {status}) "
                    f"— faltam {hours_until}, reagendar/cancelar: {can_reschedule}"
                )

            return (
                f"Proximos agendamentos ({len(appointments)}):\n"
                + "\n".join(lines)
                + "\n\nIMPORTANTE: se 'reagendar/cancelar: NAO (<24h)', "
                "diz ao cliente que precisa contactar a Laura directamente."
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
            packages = await marcai_client.get_client_packages(
                tenant_id=tenant_id, cliente_id=cliente_id
            )
            pkg_info = ""
            if not packages:
                pkg_info = (
                    " NOTA: cliente sem pacote activo — sessao marcada como avulsa. "
                    "Informa o cliente que pode combinar com a Laura qual pacote "
                    "lhe fica melhor."
                )

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
                "Confirma o agendamento ao cliente com naturalidade." + pkg_info
            )
        except Exception as exc:
            msg = str(exc)
            if "max_pending" in msg or "agendamento pendente" in msg.lower():
                return (
                    "ERRO: o cliente ja tem um agendamento pendente. "
                    "NAO tentes marcar outro. Diz ao cliente: "
                    "'Ja tem uma sessao marcada. Assim que essa passar, "
                    "pode marcar outra. Quer reagendar a existente?'"
                )
            if "409" in msg or "slot_taken" in msg:
                return (
                    "ERRO: o slot ja foi ocupado. Pede desculpa, "
                    "chama get_available_slots de novo e propoe alternativas."
                )
            return f"ERRO ao marcar: {msg}. Diz ao cliente que vais passar a recepcao."

    return create_client_appointment


def make_reschedule_appointment_tool(tenant_id: str, cliente_id: str):

    @tool
    async def reschedule_appointment(agendamento_id: str, nova_data: str, nova_hora: str) -> str:
        """Reagenda um agendamento existente para nova data/hora.

        Usa esta tool quando a cliente pede para mudar a data ou hora
        de um agendamento ja marcado (ex: "posso mudar para quinta?").

        ANTES de chamar esta tool:
        1. Chama get_my_appointments para obter o id do agendamento.
        2. Chama get_available_slots para confirmar que o novo horario esta livre.
        3. Obtem confirmacao explicita da cliente.

        Args:
            agendamento_id: ID do agendamento (vem do get_my_appointments, campo id).
            nova_data: Nova data no formato YYYY-MM-DD (ex: '2026-06-05').
            nova_hora: Nova hora no formato HH:MM (ex: '14:30').
        """
        from datetime import datetime
        from zoneinfo import ZoneInfo

        try:
            local = datetime.fromisoformat(f"{nova_data}T{nova_hora}:00").replace(
                tzinfo=ZoneInfo("Europe/Lisbon")
            )
            iso_utc = local.astimezone(ZoneInfo("UTC")).isoformat()
            await marcai_client.reschedule_client_appointment(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
                agendamento_id=agendamento_id,
                nova_data_hora_iso=iso_utc,
            )
            return (
                f"OK — agendamento reagendado para {nova_data} as {nova_hora}. "
                "Confirma a alteracao ao cliente com naturalidade."
            )
        except Exception as exc:
            msg = str(exc)
            if "400" in msg or "24h" in msg or "antecedencia" in msg:
                return (
                    "ERRO: nao e possivel reagendar com menos de 24h de antecedencia. "
                    "Informa o cliente que precisa contactar a clinica directamente "
                    "para alteracoes em cima da hora."
                )
            if "409" in msg or "slot_taken" in msg:
                return (
                    "ERRO: o novo horario ja esta ocupado. Pede desculpa, "
                    "chama get_available_slots de novo e propoe alternativas."
                )
            return f"ERRO ao reagendar: {msg}. Diz ao cliente que vais passar a recepcao."

    return reschedule_appointment


def make_cancel_appointment_tool(tenant_id: str, cliente_id: str):

    @tool
    async def cancel_appointment(agendamento_id: str) -> str:
        """Cancela um agendamento existente.

        Usa esta tool quando a cliente pede para cancelar um agendamento
        (ex: "preciso cancelar a sessao de quinta").

        ANTES de chamar esta tool:
        1. Chama get_my_appointments para obter o id do agendamento.
        2. Confirma com a cliente qual agendamento quer cancelar.
        3. Obtem confirmacao explicita ("sim, quero cancelar").

        Args:
            agendamento_id: ID do agendamento (vem do get_my_appointments, campo id).
        """
        try:
            result = await marcai_client.cancel_client_appointment(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
                agendamento_id=agendamento_id,
            )
            late_cancel = result.get("lateCancel", False)
            if late_cancel:
                return (
                    "OK — agendamento cancelado. NOTA: foi um cancelamento tardio "
                    "(menos de 24h de antecedencia). Informa o cliente que este "
                    "cancelamento tardio fica registado."
                )
            return (
                "OK — agendamento cancelado com sucesso. "
                "Confirma o cancelamento ao cliente com naturalidade."
            )
        except Exception as exc:
            msg = str(exc)
            return f"ERRO ao cancelar: {msg}. Diz ao cliente que vais passar a recepcao."

    return cancel_appointment


def make_pausar_atendimento_tool(tenant_id: str, cliente_id: str):

    @tool
    async def pausar_atendimento() -> str:
        """Pausa o atendimento automatico e encerra a conversa com este cliente.

        Usa esta tool APENAS depois de esgotares o protocolo off-topic (ja
        deste o redirect, a firmeza e o farewell) e o cliente CONTINUA a
        insistir em assuntos fora do ambito — conversar com a Laura por
        motivos pessoais/sociais, ou temas nao relacionados com a clinica.

        Depois de chamar esta tool, da a mensagem final de despedida e NAO
        respondas mais — a conversa fica em modo manual para a equipa decidir
        pelo painel se retoma.

        Nao precisa de argumentos.
        """
        try:
            await marcai_client.pause_client_ia(tenant_id=tenant_id, cliente_id=cliente_id)
            return (
                "OK — atendimento automatico pausado. Da a mensagem final de "
                "despedida ao cliente e NAO respondas mais."
            )
        except Exception as exc:
            return f"ERRO ao pausar: {exc}. Da na mesma a despedida e termina."

    return pausar_atendimento
