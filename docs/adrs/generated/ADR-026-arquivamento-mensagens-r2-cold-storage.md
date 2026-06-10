# ADR-026: Arquivamento de Mensagens para R2 (Cold Storage)

**Status:** Proposed
**Data:** 2026-06-10
**Módulo:** MESSAGING / INFRA
**Autor:** André dos Reis
**Score de Impacto:** 90 (Médio-Alto)

---

## Contexto

O Marcai guarda **todas** as mensagens de WhatsApp (entrada e saída) na coleção `mensagems` de cada tenant (`tenant_<id>.mensagems`). É a única coleção que **cresce de forma ilimitada**: clientes, agendamentos e pacotes crescem com o negócio (lineares e previsíveis), mas as mensagens acumulam a cada conversa e nunca encolhem.

**Medições reais (2026-06-10, tenant de produção `695413fb…`):**

| Métrica | Valor |
|---|---|
| Cluster Atlas inteiro | **6 MB** (de 512 MB do tier gratuito M0) |
| Custo fixo por tenant | **~2,5–3 MB** (dominado por **índices**, ~12 coleções × custo fixo de índice) |
| Tamanho por mensagem | **~259 bytes/doc** |
| Equivalências | 1 MB ≈ 4.000 msgs · 10 MB ≈ 40.000 msgs |
| Estimativa de crescimento | clínica activa (~50 msgs/dia) ≈ **~5 MB/ano** em mensagens |

**Observação-chave (do código):** o `lead_orchestrator.py` / `client_orchestrator.py` constroem o contexto do agente com **apenas as últimas ~8 mensagens dos últimos 30 minutos**. Ou seja, **a IA não depende do histórico antigo** — as mensagens com mais de 30 minutos têm valor **zero** para a operação em tempo real. São mantidas apenas para:
- Histórico do inbox (a Laura ver a conversa passada de um contacto);
- **Análise futura de "como os clientes conversam"** (intenções, objecções, padrões de conversão) — um activo de produto que o utilizador quer preservar.

Conclusão: não queremos **apagar** mensagens (TTL), queremos **arquivá-las fora do Mongo** mantendo-as acessíveis.

---

## Decisão

Adoptar uma estratégia de **arquivamento para Cloudflare R2 (cold storage)**: mensagens com mais de um período de retenção configurável (default proposto: **6 meses**) saem da coleção `mensagems` do Mongo e passam para ficheiros comprimidos no R2, mantendo-se recuperáveis.

### Princípios

1. **Não destrutivo.** Arquivar ≠ apagar. O histórico completo continua a existir, só muda de sítio (Mongo quente → R2 frio). Preserva o activo analítico de conversas.
2. **A IA não é afectada.** Como o agente só usa a janela de 30 min, mover mensagens antigas não muda nada no comportamento conversacional.
3. **Reutiliza infra existente.** O R2 já está montado e em uso para backups (ver workflow `backup.yml`, bucket `marcaai`, região Europa Ocidental — GDPR). O arquivamento usa o mesmo bucket, prefixo separado (ex: `archive/messages/<tenantId>/<ano-mes>.ndjson.gz`).
4. **Multi-tenant respeitado.** O arquivamento corre por tenant, sempre com `tenantId` no scope (a regra de isolamento não é violada).
5. **Accionado por gatilho, não prematuro.** Só se implementa/activa quando houver sinal real de pressão (ver "Gatilhos" abaixo). Hoje, a 6 MB, **não se faz nada**.

### Formato de arquivo

- **NDJSON comprimido (gzip)** — uma mensagem por linha, fácil de reprocessar para análise (carregar num notebook, BigQuery, DuckDB, ou reimportar no Mongo).
- Particionado por **tenant + mês**: `archive/messages/<tenantId>/<YYYY-MM>.ndjson.gz`.
- Cada lote arquivado só é removido do Mongo **após confirmação de upload com sucesso** no R2 (write-then-delete, nunca o contrário).
- Um **manifesto** por tenant (`archive/messages/<tenantId>/_manifest.json`) lista os períodos já arquivados, para o inbox saber o que existe em frio.

---

## Alternativas Consideradas

### 1. Não fazer nada (manter tudo no Mongo)
- **Vantagem:** zero trabalho; a 6 MB há imensa folga
- **Desvantagem:** adia o problema; a coleção de mensagens é a única sem teto
- **Adoptada PARA JÁ** — esta ADR documenta a decisão e o gatilho, mas a implementação só arranca quando o gatilho disparar. Não sobre-engenheirar a 1,2% do limite.

### 2. TTL index (apagar mensagens com mais de X meses)
- **Vantagem:** trivial de implementar (um índice TTL no Mongo); mantém o Mongo leve automaticamente
- **Desvantagem:** **destrói** o histórico — perde-se o inbox antigo e o activo analítico de conversas que o utilizador quer manter
- **Descartada** — colide com o objectivo de usar o histórico para análise

### 3. Upgrade do Atlas (M10, 10 GB) sem arquivar
- **Vantagem:** mais simples; ~2.000 tenants de margem; zero código
- **Desvantagem:** custo recorrente; não resolve o crescimento ilimitado das mensagens, só o adia mais longe; mistura dados quentes e frios na mesma camada cara
- **Complementar, não alternativa** — o upgrade resolve a **contagem de tenants**; o arquivamento resolve o **volume de mensagens por tenant**. Provavelmente far-se-ão ambos, em momentos diferentes.

### 4. Mover mensagens para outra base de dados barata (ex: outra coleção/cluster)
- **Vantagem:** continua consultável via Mongo
- **Desvantagem:** continua a pagar storage de base de dados quente para dados frios; mais infra a gerir
- **Descartada** — o R2 (object storage) é muito mais barato por GB e já existe; mensagens antigas são "bits parados", caso de uso perfeito para cold storage

---

## Consequências

### Positivas
- **Mongo fica leve e barato** — só dados quentes (recentes) ficam na camada cara; estende a vida do tier gratuito/M10
- **Histórico preservado e analisável** — NDJSON no R2 é trivial de reprocessar para a análise de conversas que o utilizador quer fazer
- **IA inalterada** — janela de 30 min não toca em dados arquivados
- **GDPR mantido** — R2 em região europeia; arquivos por tenant facilitam pedidos de eliminação/exportação por titular de dados
- **Reutiliza R2** — sem novo fornecedor nem custo de setup

### Negativas / Trade-offs
- **Inbox precisa de saber lidar com frio** — ao recuar muito no histórico de um contacto, ou se mostra "mensagens antigas arquivadas" ou se faz lazy-load do R2 (latência maior, aceitável para histórico)
- **Mais um job a manter** — o worker de arquivamento (provavelmente BullMQ, alinhado com ADR-013) é mais código e mais um ponto de falha
- **Pedidos GDPR ficam em dois sítios** — eliminar dados de um titular implica varrer Mongo **e** os arquivos R2 desse tenant
- **Risco de perda no move** — mitigado pela ordem write-then-delete e verificação de upload antes de remover do Mongo

### Pontos de atenção
> - **Reversibilidade:** manter sempre a capacidade de reimportar um arquivo NDJSON para o Mongo (restauro de histórico para o inbox).
> - **Eliminação por tenant:** quando um tenant é apagado, os seus arquivos R2 (`archive/messages/<tenantId>/`) têm de ser apagados também.
> - **Não confundir com backup:** o backup (`backup.yml`) é uma cópia *completa* periódica para desastre; o arquivamento *move* dados frios para fora da base operacional. São coisas distintas, ambas no R2 mas com prefixos e ciclos de vida separados.

---

## Gatilhos (quando implementar/activar)

Hoje (6 MB, 1,2% do limite) **não se faz nada**. Ordem de actuação por sinal real:

1. **Cluster a ~400 MB (≈80% do M0)** → primeiro passo é normalmente **upgrade Atlas para M10** (resolve contagem de tenants, é o mais barato em tempo).
2. **Coleção `mensagems` de um tenant a dominar o storage** (ex: > 50–100 MB num só tenant, milhares de conversas) → activar o **arquivamento desta ADR** para esse(s) tenant(s).
3. **Necessidade de análise de conversas em escala** → o formato NDJSON no R2 já serve directamente esse caso de uso, independentemente da pressão de storage.

---

## Plano de Implementação (quando o gatilho disparar)

### Fase 1 — Exportador (read-only, sem apagar)
1. Job que, por tenant, lê `mensagems` com `createdAt < (hoje − retenção)` e escreve `archive/messages/<tenantId>/<YYYY-MM>.ndjson.gz` no R2.
2. Verificação de integridade do upload (contagem/checksum) **antes** de qualquer remoção.
3. Manifesto por tenant.

### Fase 2 — Remoção segura
1. Após upload confirmado, apagar do Mongo o lote arquivado (write-then-delete).
2. Agendar como job BullMQ recorrente (alinhado com ADR-013), idempotente e reversível.

### Fase 3 — Inbox consciente do frio
1. Inbox mostra mensagens quentes do Mongo; ao recuar além do horizonte de retenção, indica "histórico arquivado" e/ou faz lazy-load do R2.

### Fase 4 — Análise (o objectivo do utilizador)
1. Pipeline de leitura dos NDJSON do R2 para análise de padrões de conversa (intenções, objecções, conversão) — alimenta melhorias de prompt/produto.

---

## Links e Referências

- **Decidido em:** sessão de 2026-06-10 (capacity planning após limpeza dos datasets `sample_*` do Atlas e confirmação do backup)
- **Dados que fundamentam a decisão:** medição real do cluster (6 MB total; ~259 B/mensagem; ~2,5 MB de índices fixos por tenant)
- **ADRs relacionados:**
  - [ADR-001: Database-per-Tenant Architecture](./ADR-001-database-per-tenant-architecture.md) — arquivamento corre por tenant, respeita o isolamento
  - [ADR-007: Two-Tier LLM Strategy](./ADR-007-two-tier-llm-strategy.md) — o agente usa só a janela de 30 min, por isso o histórico antigo é arquivável sem afectar a IA
  - [ADR-013: Notification Pipeline (BullMQ)](./ADR-013-notification-pipeline-bullmq.md) — infra de jobs onde o worker de arquivamento encaixa
  - [ADR-023: Consolidação no VPS Contabo](./ADR-023-consolidacao-vps-contabo.md) — capacity planning da infra
  - [ADR-024: Painel Super-Admin Multi-Tenant](./ADR-024-painel-super-admin-multi-tenant.md) — métricas de uso por tenant (incl. storage de mensagens) podem disparar o gatilho de arquivamento
- **Infra reutilizada:** Cloudflare R2 (bucket `marcaai`, Europa Ocidental), já em uso para backups via `.github/workflows/backup.yml`
