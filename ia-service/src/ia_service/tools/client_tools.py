"""LangChain tools for the client agent (Client Lifecycle Phase 1).

Reuses `find_servico` and `get_available_slots` from `lead_tools.py`.
Adds client-specific tools: `get_my_appointments`, `create_client_appointment`.

All tools capture tenantId + clienteId via closure — the LLM never sees
these values as arguments and cannot target a different tenant/client.
"""

from __future__ import annotations

from langchain.tools import tool

from ..services import marcai_client, tenant_knowledge


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
                + "\n\nUSO INTERNO: nao anuncies a contagem de sessoes por "
                "iniciativa propria — so se o cliente perguntar."
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
        from zoneinfo import ZoneInfo

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

                # O backend devolve UTC; ao modelo chega SEMPRE hora de parede
                # de Lisboa — o ISO cru fazia a IA dizer "16:30" para uma
                # sessao das 17:30 (bug apanhado em teste, 2026-07-03).
                hours_until = "?"
                try:
                    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                    dt_str = dt.astimezone(ZoneInfo("Europe/Lisbon")).strftime(
                        "%Y-%m-%d %H:%M (hora de Lisboa)"
                    )
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
    owner_name = tenant_knowledge.load_clinica_config(tenant_id)["dona"]

    @tool
    async def create_client_appointment(data: str, hora: str, servico: str | None = None) -> str:
        """Marca uma sessao para a cliente.

        Chama esta tool APENAS quando a cliente aceita explicitamente
        um slot que acabaste de propor (ex: "11:00 da-me jeito").
        A tool valida em tempo real que o slot ainda esta livre.

        Args:
            data: Data no formato YYYY-MM-DD (ex: '2026-06-01').
            hora: Hora no formato HH:MM (ex: '11:00').
            servico: Nome do pacote a usar, EXACTAMENTE como devolvido por
                get_my_packages. OBRIGATORIO quando a cliente tem mais de um
                pacote activo — sem ele a sessao nao fica ligada a pacote
                nenhum e o consumo nao e descontado.
        """
        from datetime import datetime
        from zoneinfo import ZoneInfo

        try:
            # Nome + id do pacote → o template de confirmacao mostra o servico
            # real e o agendamento fica LIGADO ao CompraPacote (o consumo ao
            # Realizado desconta do pacote certo). Com VARIOS pacotes activos
            # a escolha nunca e adivinhada: ou vem em `servico`, ou a sessao
            # fica sem ligacao (review PR #100 — ligar "o primeiro" descontava
            # do pacote errado).
            packages: list[dict] = []
            try:
                packages = await marcai_client.get_client_packages(
                    tenant_id=tenant_id, cliente_id=cliente_id
                )
            except Exception:
                pass

            servico_nome = None
            compra_pacote_id = None
            com_sessoes = [p for p in packages if p.get("sessoesRestantes", 0) > 0]
            if servico:
                pkg = _match_pacote(packages, servico)
                if not pkg:
                    return (
                        f"ERRO: nao encontrei o pacote activo '{servico}'. "
                        "Chama get_my_packages e usa o nome EXACTO do pacote."
                    )
                servico_nome = pkg.get("pacoteNome")
                compra_pacote_id = str(pkg.get("_id") or "") or None
            elif len(com_sessoes) == 1:
                servico_nome = com_sessoes[0].get("pacoteNome")
                compra_pacote_id = str(com_sessoes[0].get("_id") or "") or None

            local = datetime.fromisoformat(f"{data}T{hora}:00").replace(
                tzinfo=ZoneInfo("Europe/Lisbon")
            )
            iso_utc = local.astimezone(ZoneInfo("UTC")).isoformat()
            await marcai_client.create_client_appointment(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
                data_hora_iso=iso_utc,
                tipo="Sessao",
                servico_nome=servico_nome,
                compra_pacote_id=compra_pacote_id,
            )
            return (
                f"OK — sessao marcada para {data} as {hora}. O sistema ja "
                "enviou a mensagem automatica de confirmacao ao cliente; a "
                "tua resposta NAO sera enviada. Responde apenas 'OK'."
            )
        except Exception as exc:
            msg = str(exc)
            conflito = (
                "max_pending" in msg
                or "agendamento pendente" in msg.lower()
                or "409" in msg
                or "slot_taken" in msg
            )
            if conflito:
                # A "colisao" pode ser com uma marcacao do PROPRIO cliente —
                # tipico quando o turno anterior JA marcou (resposta suprimida,
                # sem rasto no historico) e o modelo tenta outra vez (caso
                # Ines 2026-07-06). Verificar a ficha antes de dizer "ocupado".
                try:
                    appointments = await marcai_client.get_client_appointments(
                        tenant_id=tenant_id, cliente_id=cliente_id
                    )
                    alvo = datetime.fromisoformat(f"{data}T{hora}:00").replace(
                        tzinfo=ZoneInfo("Europe/Lisbon")
                    )
                    for appt in appointments:
                        try:
                            dt = datetime.fromisoformat(
                                str(appt.get("dataHora", "")).replace("Z", "+00:00")
                            )
                        except ValueError:
                            continue
                        if dt.astimezone(ZoneInfo("Europe/Lisbon")) == alvo:
                            return (
                                f"JA MARCADO: o cliente JA TEM esta sessao marcada "
                                f"para {data} as {hora} — a marcacao FOI FEITA "
                                "(provavelmente no turno anterior; o cliente ja "
                                "recebeu a confirmacao automatica). NAO digas que "
                                "o horario esta ocupado nem tentes marcar de novo "
                                "— confirma ao cliente que esta tudo marcado."
                            )
                except Exception:
                    pass
            if "requer_pacote" in msg or "tem de indicar o pacote" in msg.lower():
                return (
                    "ERRO: a segunda marcacao futura tem de ficar ligada a um "
                    "pacote. Chama get_my_packages e repete com `servico` = "
                    "nome exacto do pacote a usar."
                )
            limite = (
                "max_pending" in msg
                or "limite de marca" in msg.lower()
                or "agendamento pendente" in msg.lower()
            )
            if limite:
                return (
                    "ERRO: o cliente ja atingiu o limite de marcacoes futuras. "
                    "NAO tentes marcar outra. Diz ao cliente: "
                    "'Ja atingiu o limite de marcacoes que consigo fazer por "
                    "aqui — nas suas sessoes presenciais pode combinar as "
                    f"proximas directamente com a {owner_name}. Quer "
                    "reagendar alguma das existentes?'"
                )
            if "409" in msg or "slot_taken" in msg:
                return (
                    "ERRO: o slot ja foi ocupado. Pede desculpa, "
                    "chama get_available_slots de novo e propoe alternativas."
                )
            return f"ERRO ao marcar: {msg}. Diz ao cliente que vais passar a recepcao."

    return create_client_appointment


def _normaliza_nome(raw: str) -> str:
    import unicodedata

    decomposto = unicodedata.normalize("NFD", str(raw or "").casefold())
    return "".join(c for c in decomposto if unicodedata.category(c) != "Mn").strip()


def _match_pacote(packages: list[dict], nome: str) -> dict | None:
    """Encontra o pacote activo cujo nome casa com `nome` (sem acentos/caixa).

    Igualdade primeiro; depois containment. Ambiguidade → None (o agente deve
    usar os nomes exactos devolvidos por get_my_packages).
    """
    alvo = _normaliza_nome(nome)
    if not alvo:
        return None
    com_sessoes = [p for p in packages if p.get("sessoesRestantes", 0) > 0]
    exactos = [p for p in com_sessoes if _normaliza_nome(p.get("pacoteNome")) == alvo]
    if len(exactos) == 1:
        return exactos[0]
    parciais = [p for p in com_sessoes if alvo in _normaliza_nome(p.get("pacoteNome"))]
    return parciais[0] if len(parciais) == 1 else None


def make_get_pair_slots_tool(tenant_id: str):

    @tool
    def get_pair_slots(dia: str | None = None) -> str:
        """Devolve os horarios onde cabem DUAS sessoes seguidas (par emendado).

        Usa esta tool APENAS quando a cliente quer marcar dois tratamentos
        no mesmo dia, um a seguir ao outro (ex: rosto + corpo) e tem sessoes
        de pacote para as duas — DOIS pacotes activos, ou UM pacote com 2 ou
        mais sessoes restantes (ex: pacote de 10 de drenagem). Cada inicio
        devolvido comporta 2 horas continuas: a 1a sessao comeca a essa hora
        e a 2a comeca 60 minutos depois.

        NAO uses get_available_slots para propor pares — os inicios de par
        sao calculados com a duracao dupla e podem ser diferentes.

        Args:
            dia: Data YYYY-MM-DD para ver so esse dia, ou None para o
                proximo dia com espaco para um par.
        """
        from ..services import mongo_reader

        all_slots = mongo_reader.find_available_slots(
            tenant_id, dias_a_frente=30, slot_duration_min=120
        )
        if not all_slots:
            return (
                "Nao ha espaco para duas sessoes seguidas nos proximos dias. "
                "Propoe marcar as duas sessoes em dias separados."
            )

        by_date: dict[str, list[dict]] = {}
        for s in all_slots:
            by_date.setdefault(s["date"], []).append(s)

        if dia:
            day_slots = by_date.get(dia)
            if not day_slots:
                future = [d for d in by_date if d >= dia]
                if future:
                    return (
                        f"Nao ha espaco para um par no dia {dia}. "
                        f"O proximo dia com espaco e {future[0]}."
                    )
                return (
                    f"Nao ha espaco para um par no dia {dia} nem nos seguintes. "
                    "Propoe dias separados."
                )
            target, to_show = dia, day_slots
        else:
            target = next(iter(by_date))
            to_show = by_date[target]

        weekday = to_show[0]["weekday"]
        inicios = ", ".join(s["time"] for s in to_show)
        return (
            f"Inicios possiveis para DUAS sessoes seguidas em {weekday} {target}: {inicios}.\n"
            "A 2a sessao comeca 60 minutos depois da 1a (seguidas, na mesma sala).\n"
            "Propoe um inicio; com o OK da cliente chama create_client_appointment_pair."
        )

    return get_pair_slots


def make_create_client_appointment_pair_tool(tenant_id: str, cliente_id: str):

    @tool
    async def create_client_appointment_pair(
        data: str,
        hora: str,
        servico_primeira: str,
        servico_segunda: str,
        tratamento_primeira: str | None = None,
        tratamento_segunda: str | None = None,
    ) -> str:
        """Marca DUAS sessoes seguidas para a cliente (par emendado).

        Usa APENAS quando a cliente aceitou explicitamente um inicio proposto
        via get_pair_slots E tem pacotes activos para os dois tratamentos.
        A 1a sessao comeca em `hora`; a 2a comeca 60 minutos depois.
        Se as duas sessoes saem do MESMO pacote (ex: corpo e rosto do pacote
        de 10 de drenagem, com 2+ sessoes restantes), passa o mesmo nome de
        pacote nos dois `servico_*` e distingue os tratamentos nos
        `tratamento_*` — e o que a cliente ve nas confirmacoes.

        Args:
            data: Data no formato YYYY-MM-DD (ex: '2026-08-04').
            hora: Hora da 1a sessao no formato HH:MM (ex: '10:00').
            servico_primeira: Nome do pacote da 1a sessao, EXACTAMENTE como
                devolvido por get_my_packages (ex: 'Drenagem Rosto').
            servico_segunda: Nome do pacote da 2a sessao (ex: 'Drenagem Corpo';
                pode ser o mesmo da primeira).
            tratamento_primeira: O tratamento concreto da 1a sessao como a
                cliente o disse (ex: 'Drenagem de corpo'). Se omitido, usa o
                nome do pacote.
            tratamento_segunda: O tratamento concreto da 2a sessao (ex:
                'Drenagem de rosto'). Se omitido, usa o nome do pacote.
        """
        from datetime import datetime
        from zoneinfo import ZoneInfo

        try:
            packages = await marcai_client.get_client_packages(
                tenant_id=tenant_id, cliente_id=cliente_id
            )
            pkg1 = _match_pacote(packages, servico_primeira)
            pkg2 = _match_pacote(packages, servico_segunda)
            if not pkg1 or not pkg2:
                em_falta = servico_primeira if not pkg1 else servico_segunda
                return (
                    f"ERRO: nao encontrei o pacote activo '{em_falta}'. "
                    "Chama get_my_packages e usa os nomes EXACTOS dos pacotes. "
                    "Se a cliente nao tem os dois pacotes, nao podes marcar o par."
                )

            # O label que a cliente ve (confirmacao/lembretes) e o tratamento
            # concreto quando distinguido; o pacote e so o selector de consumo.
            label1 = (tratamento_primeira or "").strip() or pkg1.get("pacoteNome")
            label2 = (tratamento_segunda or "").strip() or pkg2.get("pacoteNome")

            local = datetime.fromisoformat(f"{data}T{hora}:00").replace(
                tzinfo=ZoneInfo("Europe/Lisbon")
            )
            iso_utc = local.astimezone(ZoneInfo("UTC")).isoformat()
            await marcai_client.create_client_appointment(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
                data_hora_iso=iso_utc,
                tipo="Sessao",
                servico_nome=label1,
                compra_pacote_id=str(pkg1.get("_id") or "") or None,
                par={
                    "servicoNome": label2,
                    "compraPacoteId": str(pkg2.get("_id") or "") or None,
                },
            )
            return (
                f"OK — par marcado: {label1} as {hora} e "
                f"{label2} logo a seguir (60 min depois), em {data}. "
                "O sistema ja enviou as confirmacoes automaticas ao cliente; "
                "a tua resposta NAO sera enviada. Responde apenas 'OK'."
            )
        except Exception as exc:
            msg = str(exc)
            limite = (
                "max_pending" in msg
                or "agendamento pendente" in msg.lower()
                or "limite de marca" in msg.lower()
            )
            if limite:
                return (
                    "ERRO: o cliente ja atingiu o limite de marcacoes futuras. "
                    "Verifica com get_my_appointments o que ja esta marcado "
                    "antes de tentar de novo."
                )
            if "sessoes_insuficientes" in msg:
                return (
                    "ERRO: o pacote indicado nao tem sessoes suficientes para "
                    "duas marcacoes. Confirma os pacotes com get_my_packages."
                )
            if "409" in msg or "slot_taken" in msg:
                return (
                    "ERRO: esse espaco ja foi ocupado. Chama get_pair_slots "
                    "de novo e propoe outro inicio."
                )
            if "fora_disponibilidade" in msg or "400" in msg:
                return (
                    "ERRO: esse inicio nao comporta duas sessoes seguidas. "
                    "Chama get_pair_slots e propoe um dos inicios devolvidos."
                )
            return f"ERRO ao marcar o par: {msg}. Diz ao cliente que vais passar a recepcao."

    return create_client_appointment_pair


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
                "O sistema ja enviou a confirmacao automatica com a nova data; "
                "a tua resposta NAO sera enviada. Responde apenas 'OK'."
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


def make_registar_presenca_tool(tenant_id: str, cliente_id: str, agendamento_id: str):
    """agendamento_id capturado por closure — vem do follow-up pendente
    detectado pelo orchestrator; o LLM nunca escolhe o agendamento."""

    @tool
    async def registar_presenca(compareceu: bool, feedback: str = "") -> str:
        """Regista se a cliente compareceu a sessao do follow-up pendente.

        Usa esta tool quando a cliente responde a mensagem de follow-up
        pos-sessao:
        - resposta indica que a sessao aconteceu (ex: "correu bem",
          "adorei") -> compareceu=True
        - resposta indica que faltou (ex: "nao fui", "tive um imprevisto")
          -> compareceu=False
        - resposta ambigua -> NAO chames a tool; pergunta primeiro.

        Chama UMA unica vez por follow-up.

        Args:
            compareceu: True se a sessao aconteceu, False se a cliente faltou.
            feedback: Resumo curto do que a cliente disse sobre a sessao.
        """
        try:
            result = await marcai_client.registar_presenca(
                tenant_id=tenant_id,
                cliente_id=cliente_id,
                agendamento_id=agendamento_id,
                compareceu=compareceu,
                feedback=feedback,
            )
            if not result.get("statusAtualizado", False):
                return (
                    "OK — resposta registada. O estado da sessao ja tinha sido "
                    "definido pela equipa e nao foi alterado. Continua a conversa."
                )
            if compareceu:
                return "OK — presenca registada. Continua a conversa naturalmente."
            return (
                "OK — falta registada. Propoe com empatia remarcar a sessao "
                "(usa get_available_slots para veres horarios livres)."
            )
        except Exception as exc:
            return f"ERRO ao registar presenca: {exc}. Continua a conversa na mesma."

    return registar_presenca


def make_avisar_equipa_tool(tenant_id: str, cliente_id: str):
    owner_name = tenant_knowledge.load_clinica_config(tenant_id)["dona"]

    @tool
    async def avisar_equipa(motivo: str) -> str:
        """Envia um alerta REAL a equipa da clinica com um motivo.

        Usa esta tool SEMPRE que prometeres ao cliente que vais pedir ou
        confirmar algo com a equipa/responsável (ex: cliente contesta os dados
        da ficha, pedido que so a equipa pode resolver). NUNCA digas
        "vou pedir à responsável" sem chamar esta tool — sem ela o aviso nao
        chega a ninguem.

        Chama UMA unica vez por assunto — nao repitas para o mesmo motivo.

        Args:
            motivo: Resumo curto e objectivo do que a equipa deve verificar
                (ex: "Cliente diz que devia ter 3 sessoes; a ficha mostra 1").
        """
        try:
            data = await marcai_client.alertar_equipa(
                tenant_id=tenant_id, cliente_id=cliente_id, motivo=motivo
            )
            if data.get("deduplicado"):
                return (
                    "OK — a equipa JA tinha sido avisada ha minutos sobre "
                    "este assunto (alerta nao repetido). Nao anuncies novo "
                    "aviso; continua a conversa normalmente."
                )
            if not data.get("whatsappEnviado") and not data.get("pushEnviado"):
                return (
                    "ATENCAO — o pedido ficou registado mas NENHUM canal de "
                    "alerta esta configurado (WhatsApp da equipa em falta): "
                    "a equipa pode nao ver isto de imediato. Diz que "
                    "deixaste nota para a equipa, SEM prometer contacto "
                    "imediato nem prazos."
                )
            return (
                "OK — equipa avisada. Ainda nao falaste com ninguem da "
                f"equipa nem sabes quando respondem. Se {owner_name} responder "
                "ao alerta, o recado sera encaminhado ao cliente. Diz "
                "que deixaste o pedido e que entram em contacto assim que "
                "possivel — NUNCA prometas prazos ('ainda hoje') nem digas "
                "que reforcaste algo pessoalmente. Continua a conversa "
                "normalmente — isto NAO bloqueia marcacoes."
            )
        except Exception as exc:
            return (
                f"ERRO ao avisar equipa: {exc}. "
                "Diz ao cliente que vais passar o pedido a equipa na mesma."
            )

    return avisar_equipa


def make_sinalizar_renovacao_tool(tenant_id: str, cliente_id: str):

    @tool
    async def sinalizar_interesse_renovacao() -> str:
        """Avisa a equipa de que a cliente quer renovar o pacote.

        Usa esta tool APENAS quando o pacote da cliente terminou (era a
        ultima sessao) E a cliente disse explicitamente que quer renovar
        ou saber mais sobre a renovacao.

        NAO faças a venda: nao inventes precos nem condicoes. A equipa
        contacta a cliente para fechar a renovacao.

        Nao precisa de argumentos.
        """
        try:
            await marcai_client.sinalizar_renovacao(tenant_id=tenant_id, cliente_id=cliente_id)
            return (
                "OK — equipa avisada. Diz a cliente que a equipa entra em "
                "contacto em breve para tratar da renovacao. NAO fales de precos."
            )
        except Exception as exc:
            return (
                f"ERRO ao avisar equipa: {exc}. "
                "Diz a cliente que vais passar o pedido a equipa na mesma."
            )

    return sinalizar_interesse_renovacao
