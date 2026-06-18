# Plano — Inbox completo (ver todas as mensagens)

**Objetivo:** o inbox de Conversas deve mostrar a conversa **completa** — inbound do cliente, respostas da IA, **respostas da Laura pelo telemóvel**, notificações e media. É a camada de observabilidade do produto conversacional (IA de conversão): sem completude, não se consegue afinar a IA, fazer handoff, nem confiar no registo.

**Causa raiz:** o `webhookController` descarta categorias inteiras de mensagens na captura — `@lid`, não-texto (áudio/imagem), `> 5 min`, duplicadas — e, até à Fase 1, fazia-o **em silêncio**.

---

## Estado das fases

| Fase | O quê | Estado |
|---|---|---|
| **1. Observabilidade** | Logar cada descarte com `motivo` + media (não perder em silêncio) | ✅ **deployado** |
| **2. Placeholders fromMe** | Media da Laura (áudio/imagem/...) na thread como `🎤 [áudio]` em vez de sumir | ✅ **deployado** |
| **3. Resolver `@lid`** | Capturar mensagens `@lid` resolvendo o número real (devolve respostas da Laura) | 🔬 **a recolher dados** (ver abaixo) |
| **2b. Placeholder inbound** | Media do cliente (imagem/doc) na thread | ⏳ por dados |
| **4. Guarda 5 min** | Confiar na dedup por ID em vez de descartar por idade | ⏳ por dados (risco de replay) |

---

## Fase 3 — Resolver `@lid` (em recolha de dados)

### O problema

O WhatsApp/Evolution v2 identifica alguns contactos por um **`@lid`** (*Linked Identifier*, ID interno) em vez do número (`@s.whatsapp.net`). Hoje o webhook descarta essas mensagens porque não consegue mapear ao número → não sabe a que conversa pertencem. É uma das razões prováveis de não se verem certas respostas da Laura.

### Porque ainda não está implementada

A doc oficial da Evolution (consultada via context7) **não documenta** onde fica o número real num payload `@lid`. Implementar sem saber = adivinhar o campo. O número real ou vem **noutro campo do payload** (a confirmar) ou tem de ser resolvido pela **mapping `@lid`↔número no Postgres do Evolution** (`marcai-postgres`).

### Recolha de dados (em curso desde o deploy desta nota)

Foi adicionado um **log de captura temporário** no `webhookController` (`logLidParaFase3`) que, sempre que chega uma mensagem `@lid` (fromMe ou entrada), regista o **payload completo** (`lidPayload`). Assim descobrimos onde está o número real, sem adivinhar.

**Daqui a 2-3 dias**, correr em produção:

```bash
# Frequência do @lid (vale a pena fazer a Fase 3?)
ssh root@80.241.222.235 "docker logs --since 72h marcai-backend 2>&1 | grep -c '\"motivo\":\"lid\"'"

# Payload(s) @lid capturado(s) — procurar o campo com o número real
ssh root@80.241.222.235 "docker logs --since 72h marcai-backend 2>&1 | grep 'lidPayload' | tail -3"
```

No payload, procurar campos candidatos ao número real: `key.senderPn`, `key.participantPn`, `key.remoteJidAlt`, `participant`, ou um número em `@s.whatsapp.net` em qualquer campo.

### Decisão

- **`@lid` frequente + número visível no payload** → implementar a resolução (ler o campo, gravar sob o número real). É o maior valor do plano.
- **`@lid` raro** → não vale a pena; Fase 1+2 já cobrem o essencial.
- **Número não vem no payload** → via Postgres do Evolution (mapping `@lid`↔número) — mais complexo, avaliar.

### Limpeza

Quando a Fase 3 for decidida/implementada, **remover o `logLidParaFase3`** (diagnóstico temporário) do `webhookController`.
