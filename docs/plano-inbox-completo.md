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

### Recolha de dados (em curso)

A captura é feita pelo `logLidParaFase3` no `webhookController`, sempre que chega uma mensagem `@lid` (fromMe ou entrada). Faz **duas** coisas:
1. **Log** (`lidPayload`) — útil enquanto o container não reiniciar.
2. **Persistência DURÁVEL** numa coleção Mongo `lidcaptures` (model `LidCapture`, TTL 7 dias) — **sobrevive a restarts/deploys** (os docker logs NÃO, são apagados a cada `docker compose up --build`).

> Lição: a captura só-por-logs perde-se a cada deploy. Por isso a fonte de verdade é o Mongo.

**Daqui a 2-3 dias** (ou quando aparecer pelo menos 1 `@lid`), ler do Mongo via `docker exec` (a imagem não inclui `scripts/`, por isso usa-se node inline):

```bash
# Quantos @lid foram capturados + os payloads (procurar o número real)
ssh root@80.241.222.235 "docker exec marcai-backend node --input-type=module -e \"import mongoose from 'mongoose'; await mongoose.connect(process.env.MONGODB_URI); const c = mongoose.connection.collection('lidcaptures'); console.log('total:', await c.countDocuments()); const docs = await c.find().sort({createdAt:-1}).limit(5).toArray(); console.log(JSON.stringify(docs, null, 2)); await mongoose.disconnect();\""
```

No payload (`docs[].payload`), procurar o campo com o número real: `key.senderPn`, `key.participantPn`, `key.remoteJidAlt`, `participant`, ou um número em `@s.whatsapp.net` em qualquer campo.

### Decisão

- **`@lid` frequente + número visível no payload** → implementar a resolução (ler o campo, gravar sob o número real). É o maior valor do plano.
- **`@lid` raro** → não vale a pena; Fase 1+2 já cobrem o essencial.
- **Número não vem no payload** → via Postgres do Evolution (mapping `@lid`↔número) — mais complexo, avaliar.

### Limpeza

Quando a Fase 3 for decidida/implementada, remover o diagnóstico temporário:
- `logLidParaFase3` + o import de `LidCapture` no `webhookController`;
- o model `src/models/LidCapture.js` (a coleção `lidcaptures` auto-expira em 7 dias via TTL).
