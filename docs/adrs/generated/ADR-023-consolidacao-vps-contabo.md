# ADR-023: Consolidação da Infraestrutura num VPS Único (Contabo)

**Status:** Proposed
**Data:** 2026-05-29
**Módulo:** INFRA
**Autor:** André dos Reis
**Score de Impacto:** 145 (Alto)

---

## Contexto

A infraestrutura do Marcai está actualmente **fragmentada por quatro provedores**, cada um a alojar uma peça do sistema:

| Componente | Provedor actual | Plano | Observações |
|---|---|---|---|
| Frontend React/Vite PWA | Vercel | free | CDN global, deploy automático |
| Backend Node.js/Express | Render (`laura-saas`) | free | Cold start / sleep após 15 min |
| ia-service Python (FastAPI/LangChain) | Render (`Marcai`) | free | Cold start / sleep |
| Evolution API (WhatsApp) | VPS Hostinger | — | Docker, `76.13.142.240:32768` |
| Redis (BullMQ — lembretes) | VPS Hostinger | — | Docker, `:32769` (ADR-023 antecedente: migrado do Upstash em 2026-05-29) |
| MongoDB (DB-per-tenant) | MongoDB Atlas | — | Região UE (GDPR) |

Esta fragmentação acumulou dores concretas, documentadas ao longo de várias ADRs:

1. **Cold start / sleep no Render free tier** (ADR-009): o processo adormece após 15 min de inactividade; o pipeline de notificações e CRONs podem falhar silenciosamente. Mitigado hoje com pings externos de 15 em 15 minutos — um penso, não uma cura.
2. **Redis exposto à internet:** como o backend (Render, Oregon/EUA) precisa de alcançar o Redis (Hostinger, UE), o Redis **tem de estar exposto** na porta 32769, protegido apenas por password. O Render free **não tem outbound IPs estáticos**, o que torna o allowlist por firewall frágil e inviável — não há forma robusta de fechar essa porta.
3. **Esgotamento do Upstash:** o BullMQ faz polling contínuo ao Redis e esgotou o limite de 500K comandos/mês do Upstash free, parando os lembretes em produção sem aviso (a causa que despoletou esta ADR).
4. **Latência geográfica:** backend em Oregon (EUA) ↔ Redis/Evolution na UE ↔ Atlas na UE — cada salto adiciona latência de rede transatlântica desnecessária para um produto 100% europeu.
5. **Gestão de segredos e deploys em quatro sítios:** variáveis de ambiente, configuração e deploys espalhados, sem fonte única de verdade; erro humano de configuração frequente.

O utilizador adquiriu um **VPS Contabo** (2026-05-29) com intenção de consolidar o sistema.

---

## Decisão

Consolidar **toda a computação** num **VPS único (Contabo, região UE)**, orquestrado por **Docker Compose**, mantendo o MongoDB no Atlas.

**Arquitectura alvo:**

```
                          Internet
                             │
                    ┌────────▼─────────┐
                    │   nginx (80/443) │  ← único ponto exposto
                    │  reverse proxy   │     TLS via certbot
                    │   + Let's Encrypt│
                    └───┬─────┬─────┬──┘
            ┌───────────┘     │     └───────────┐
   ┌────────▼──────┐ ┌────────▼──────┐ ┌────────▼──────┐
   │  backend Node │ │ ia-service Py │ │ Evolution API │
   │   (Express)   │ │  (FastAPI)    │ │   (WhatsApp)   │
   └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
           │                 │                  │
           └────────┬────────┴──────────────────┘
                    │   rede interna Docker (não exposta)
            ┌───────▼────────┐
            │  Redis (BullMQ) │  ← já NÃO exposto à internet
            └─────────────────┘

   MongoDB Atlas (UE) ◄──── conexão externa TLS (mantém-se)
   Frontend PWA ◄──────────  Vercel (mantém-se) OU nginx estático
```

**Pontos da decisão:**

1. **Backend Node, ia-service Python, Evolution API e Redis** correm no mesmo VPS, na **mesma rede interna Docker**. Comunicam por nomes de serviço (`redis:6379`, `evolution:8080`) — **nunca saem para a internet**.
2. **nginx** é o **único ponto exposto** (portas 80/443), com TLS Let's Encrypt (certbot, renovação automática), fazendo reverse proxy para os serviços internos.
3. **MongoDB fica no Atlas** (região UE, GDPR) — não auto-hospedar. Mantém backups geridos, réplicas e zero administração de base de dados.
4. **Frontend mantém-se na Vercel** numa primeira fase (CDN global grátis, óptimo para PWA). Opcionalmente migrável para nginx estático no VPS numa fase posterior.
5. **Infrastructure-as-code:** um `docker-compose.yml` versionado é a fonte única de verdade da topologia.

---

## Alternativas Consideradas

### 1. Manter o status quo (split Vercel + Render + Hostinger)
- **Vantagem:** zero esforço de migração; deploy automático já configurado
- **Desvantagem:** mantém todas as dores — cold start, Redis exposto sem firewall viável, latência transatlântica, segredos em 4 sítios, e o risco recorrente de esgotamento de quotas em free tiers
- **Descartada:** os problemas são estruturais, não pontuais

### 2. Render paid tier (Starter) para backend + ia-service
- **Vantagem:** elimina cold start; ganha outbound IPs estáticos → permite firewall no Redis Hostinger; mínima mudança de arquitectura
- **Desvantagem:** custo recorrente por serviço (~$7/mês × 2); mantém a fragmentação por 3 provedores e a latência EUA↔UE; não resolve a gestão dispersa
- **Não adoptada:** resolve sintomas (cold start, IP) mas não a fragmentação nem a latência; pior custo-benefício que um VPS único

### 3. Fly.io (Docker nativo, regiões UE)
- **Vantagem:** Docker nativo, sem cold start, regiões próximas de Portugal, escala mais simples que VPS
- **Desvantagem:** ainda é um provedor PaaS com a sua curva e limites; rede interna entre apps Fly e um Redis gerido implica configuração adicional; menos controlo que VPS
- **Não adoptada:** o utilizador já investiu num VPS Contabo; o VPS dá controlo total e custo fixo mais previsível

### 4. VPS auto-hospedar TUDO, incluindo MongoDB
- **Vantagem:** custo único, controlo absoluto
- **Desvantagem:** auto-hospedar MongoDB com DB-per-tenant implica gerir backups, réplicas, upgrades e point-in-time recovery manualmente — risco de perda de dados de clientes incompatível com equipa de uma pessoa
- **Descartada:** o Atlas gere isto melhor e mais barato em risco; a base de dados é o activo mais crítico, não vale a pena assumir esse ops

### 5. Kubernetes (k3s) no VPS
- **Vantagem:** orquestração avançada, self-healing, futuro-multi-nó
- **Desvantagem:** complexidade massiva e desproporcionada para a escala actual (1 VPS, poucos serviços)
- **Descartada:** over-engineering; Docker Compose chega e sobra

---

## Consequências

### Positivas

- **Rede interna elimina a exposição do Redis e do Evolution:** passam a comunicar por rede Docker privada — **resolve de raiz** o problema da firewall/outbound-IP que o Render free tornava insolúvel. Apenas o nginx (80/443) fica exposto.
- **Fim dos cold starts / sleep:** o VPS está sempre acordado — o pipeline de lembretes e CRONs deixam de depender de pings externos.
- **Latência reduzida:** todos os serviços de computação no mesmo host e na UE; saltos internos são localhost. Só o Atlas é externo (e está na UE).
- **Fonte única de verdade:** um `docker-compose.yml` versionado descreve toda a topologia; segredos num único `.env` no servidor.
- **Custo fixo e previsível:** um VPS em vez de múltiplos planos pagos; sem surpresas de quota (o caso Upstash não se repete).
- **Sem dependência de free tiers frágeis:** controlo total sobre recursos e limites.

### Negativas / Trade-offs

- **Responsabilidade operacional passa para nós:** updates de SO, patches de segurança, monitorização de uptime, gestão de disco. Antes era do provedor.
- **Perda do deploy automático "grátis" do Render/Vercel:** é preciso montar deploy (script `git pull` + `docker compose up -d --build`, ou um CI/CD via GitHub Actions com SSH). Trade-off aceitável e automatizável.
- **HTTPS passa a ser nossa responsabilidade:** geri-lo com nginx + certbot (Let's Encrypt). Renovação é automática, mas é mais uma peça a vigiar.
- **Ponto único de falha:** se o VPS cair, cai tudo (backend, IA, WhatsApp, lembretes). Mitigável com monitorização (UptimeRobot/Healthchecks), backups de configuração e um runbook de recuperação. A base de dados (o activo crítico) continua protegida no Atlas.
- **Necessário um domínio** a apontar para o IP do Contabo (para o nginx + TLS).

### Ganho de segurança (destaque)

> Hoje o Redis está exposto na internet protegido só por password, porque o Render free não permite firewall por IP estático. Com a consolidação, **o Redis e o Evolution deixam de ter qualquer porta exposta** — vivem na rede interna do Docker. A superfície de ataque reduz-se ao nginx (80/443). Este é, por si só, justificação suficiente para a migração.

---

## Plano de Migração

Migração faseada, **sem downtime percebido pelo cliente**, com possibilidade de rollback em cada fase.

### Fase 0 — Preparação (sem impacto em produção)
1. Provisionar o VPS Contabo (região UE/Alemanha — GDPR).
2. Hardening base: utilizador não-root, chaves SSH, `ufw` (permitir só 22/80/443), `fail2ban`, updates automáticos.
3. Instalar Docker + Docker Compose.
4. Registar/apontar um **domínio** (ou subdomínios: `api.`, `ia.`, `wa.`) para o IP do VPS.

### Fase 1 — Stack de base
1. Escrever o `docker-compose.yml`: nginx, backend, ia-service, evolution, redis, numa rede interna.
2. Configurar nginx como reverse proxy + certbot (Let's Encrypt) para os domínios.
3. Subir **Redis + Evolution** primeiro, validar isoladamente.

### Fase 2 — Backend + ia-service
1. Migrar variáveis de ambiente para o `.env` do servidor (incluindo `REDIS_URL=redis://redis:6379` interno — sem password/porta exposta necessária na rede interna, ou com password mantida).
2. `MONGODB_URI` continua a apontar para o Atlas (sem alteração).
3. Subir backend + ia-service; validar `GET /api/auth/me → 401`, health checks, logs de arranque (`[Redis] Ligado`, `[Worker] iniciado`).

### Fase 3 — Cutover do WhatsApp (ponto sensível)
1. O webhook do Evolution aponta para o backend. Reapontar o webhook para o novo domínio (`https://api.dominio/webhook/evolution`).
2. **Cuidado com a fila de lembretes:** delayed jobs na fila do Redis antigo (Hostinger) **não migram**. Estratégia: drenar o Redis antigo (deixar o worker antigo a correr até esvaziar) enquanto o novo já recebe jobs novos; ou migrar numa janela de baixa actividade.
3. Garantir que só **uma** instância do worker BullMQ está activa de cada vez (evitar envios duplicados durante a transição).

### Fase 4 — Frontend (opcional)
1. Manter na Vercel (recomendado nesta fase) **ou** servir o build estático via nginx no VPS.
2. Actualizar `VITE_API_URL` para o novo domínio da API (`/api/v1`).

### Fase 5 — Desligar o antigo
1. Confirmar estabilidade (logs, lembretes a sair, WhatsApp a responder) por alguns dias.
2. Suspender serviços Render (`laura-saas`, `Marcai`) e o Redis/Evolution na Hostinger.
3. Cancelar Upstash (já esgotado) e, eventualmente, o VPS Hostinger.

### Rollback
Em cada fase, o ambiente antigo permanece intacto até a fase seguinte estar validada. Reverter = reapontar webhook/DNS para o ambiente antigo.

### Persistência e backups
- Volume Docker nomeado para o Redis (`redis-data`) — a fila sobrevive a restarts.
- Backups de configuração (`docker-compose.yml`, `.env`, configs nginx) versionados/guardados fora do VPS.
- MongoDB: backups automáticos do Atlas (mantêm-se).

---

## Links e Referências

- **VPS Contabo adquirido:** 2026-05-29
- **Redis migrado para self-hosted (Hostinger):** 2026-05-29 — passo intermédio que esta ADR vem suceder
- **Ficheiros chave (a criar):**
  - `docker-compose.yml` — topologia completa dos serviços
  - `nginx/` — configuração do reverse proxy + TLS
  - `.env` (no servidor) — fonte única de segredos
- **ADRs relacionados:**
  - [ADR-009: Deploy Split Render + Vercel](./ADR-009-split-deploy-render-vercel.md) — a arquitectura que esta ADR substitui; já antecipava a VPS como "fase futura"
  - [ADR-012: Docker Containerization Strategy](./ADR-012-docker-containerization-strategy.md)
  - [ADR-013: Notification Pipeline com BullMQ + Redis](./ADR-013-notification-pipeline-bullmq.md) — o pipeline que depende do Redis
  - [ADR-014: Evolution API WhatsApp Migration](./ADR-014-evolution-api-whatsapp-migration.md)
  - [ADR-021: Evolution Instance per Tenant](./ADR-021-evolution-instance-per-tenant.md)
  - [ADR-001: Database-per-Tenant](./ADR-001-database-per-tenant-architecture.md) — MongoDB Atlas mantém-se
