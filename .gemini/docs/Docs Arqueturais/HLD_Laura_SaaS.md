### HLD: Laura SaaS Agenda

Versão: 1.0
Data: 2026-04-07
Responsável: André dos Reis

---

### Objetivo técnico
Prover uma plataforma SaaS multi-tenant robusta (Node.js/React) para automação de agendamentos na área da saúde e estética. O sistema assegura isolamento total de dados por tenantId e orquestra automações resolvendo a dependência de agendamento manual, efetuando o desacoplamento de custos de APIs através de infraestrutura auto-hospedada (WhatsApp) associada à IA semântica inteligente.

Dependências com outros sistemas
- Evolution API (Integração assíncrona WhatsApp webhook)
- OpenAI API GPT-4o-mini (Integração semântica NLPs e functions)
- Disparadores Web Push VAPID

---

### Arquitetura geral
O sistema comporta a topologia central de **Monolito em Camadas Modular**, o que desmembra o Front-end PWA mantendo a Core API sem estado interno salvaguardado na memória (stateless), maximizando a capacidade de replicação em cenários instáveis sem grandes dores de cabeça escalares.

Ambiente de implantação
- Cloud (Misto arquitetural)
- Deploy do cliente e Core API na **Vercel** acoplados a uma fonte Cloud Externa primária (**MongoDB Atlas**) e ao worker contêiner do Docker auto-hospedado para Gateway do WA (**Evolution APP**).

Tecnologias principais
- API & Back: Node.js (ESM), Express 4, MongoDB (Mongoose)
- Client Front: React 19, TypeScript, Vite, Tailwind
- Observação & Auth: Pino, Sentry, Zod, JWT

Padrões adotados
- Monolito em Camadas (Models, Controllers, Services puros)
- Sistema rígido nativo Multi-tenant Lógico

---

### Componentes e responsabilidades
| Componente | Responsabilidades | Dependências |
| ----------- | ----------------- | ------------ |
| App Frontend (PWA) | Interface de consumo visual dos dados. Atua local/offline caching. | API Backend |
| API Backend (Core) | Engine central do estado das frentes. Responsável pelos CRUDs com garantias por tenant e middlewares. | DB Mongo, Sentry |
| Integração IAM / CRON | Orquestrar pings assíncronos do tempo e processamentos longos diários de Lembretes. | API Backend |
| Gateway Evolution APP | Capturar todas as entradas de bot do cliente provendo o fluxo bidirecional WhatsApp de baixo-custo. | API Endpoint Auth |
| NLP & IA Module | Consumir blocos de mensagens em webhooks, acionando formatação GPT function-calling para extração do json do ticket. | Provider de IA |

---

### Fluxo de requisições e de dados
**Fluxo de requisição**
- Cliente envia texto ao Whatstapp atrelando a um Profissional (Tenant)
- Servidor da Evolution API converte em POST Webhook
- NodeJs valida limites, despacha ao Service.
- Service bate no modelo NLP para validar inteção da query.

**Fluxo de dados**
- User WA → EvolutionGateway → Validação Endopoint (Node) → OpenAI (Intent Extract/Action) → MongoDB (Set da Marcação via TenatId) → Web Push + Callback ao Wa. 

---

### Modelo de dados (alto nível)
Entidades principais
- Tenant (Professional/Config)
- Cliente (Target primário do usuário)
- Agendamento (Sessão do dia/hora)
- Pacote (Volume limitador transacional de sessões)
- Transação Financeira (Logs do dinheiro atrelados a agendamentos ou pacotes fixos)

Relações
- Um único "Tenant" detém "N" conexões exclusivas de Cliente, Agendamento e Caixa. Isolamento logico imperador imposto antes da leitura/escrita. (Tenancy Isolators Base).

Fonte de verdade
- O provedor mestre operante em MongoDB. Cache de sessões web é apenas temporário secundário.

---

### Interfaces públicas
| Nome | Tipo | Protocolo | Exposição | SLAs/Limites |
| ---- | ---- | ---------- | --------- | ------------- |
| Private Frontend API | API | REST JSON | Interna | < 500ms p/ 95% Regs. |
| Webhook Provider | Hook Endpoint | REST Webhook | Ext. Restrita | Rate Limiting Ativado. |

---

### Considerações de escalabilidade e disponibilidade
Abordagem geral
- Para escala rápida, utilizaremos processamento paralelo horizontal da rede Vercel associado à distribuição do cluster da Atlas Mongo.

Técnicas aplicadas
- Limitadores ativos **express-rate-limit**.
- Bloqueio transversal das invocações pelo **Helmet**.
- Configurações pontuais do banco para índices da query.
- Avaliação da introdução do conceito *Backpressure MQ* utilizando Redis / Bull quando o sistema crescer o escopo diário.

Meta de disponibilidade
- Uptime 99.9% / SLA limitante máximo tolerado < 48hs por erro da infra.

---

### Segurança
Autenticação
- Forte rotina baseada no padrão de emissão e consumo de Tokens JWT rotativos, forçando revogações do *Access e Refresh* contínuas para impedir injeção maliciosa.

Autorização
- Verificação imperativa isolada garantida no "middleware auth", exigindo confirmação de posse de dados restritos ao identificador universal do `tenantId`. 

Proteção de dados
- Prevenção do vácuo logístico através da invalidação das portas API pela lib de schemas **Zod**, CORS engessado ao Host Origin FRONTEND_URL. PII Sensível dos Prontuários (Anamnese) encapsulado sobre o tenant com fase agendada para Anonimização. Trafégo contínuo HTTPS obrigaćões Cloud.

Gestão de segredos
- Arquivamentos operados exclusivamente na camada global Cloud / OS (.env cofre interno Vercel).

---

### Observabilidade
Logs
- Arquitetura contida e persistente dos dumps guiada pelo lib `Pino` sob os níveis rígidos Info, Warn e Error contendo impreterivelmente carimbo do `tenantId` nos JSONs finais.

Métricas
- Endpoint persistente automatizado (`/health`), acionado de fora para provar instâncias MongoDB Ativas além da veracidade paralela da API.

Tracing
- Rastreios amplificados com monitoramento contínuo das exceções da API pelo SDK **Sentry** (com contexto populado `Sentry.setUser`), onde falhas pesadas suprimem exibição do "stack errors" pro client da net.

Dashboards e alertas
- Alarmes e escalações por Slack / Mail atrelados as picas latências ou crash do Sentry.

---

### Riscos arquiteturais e mitigação
#### Ban/Punishment pelo WhatsApp Target
- **Probabilidade:** Média
- **Impacto:** Alto, com quebra dos disparos do lembrete.
- **Mitigação:**
  - Aplicação e observação moderada nas filas do disparos do webhook via app.
- **Plano de contingência:** Provisão de pool de números de chip reserva com fallback para troca quente caso restrito.

#### Disparos e Custos Abusivos da OpenAI
- **Probabilidade:** Baixa
- **Impacto:** Financeiro Médio
- **Mitigação:**
  - Aplições severas de controle nos endpoints limitando abusos do webhook público.
- **Plano de contingência:** Suspensão imediata automática do call AI acionando bypass estático simples para clientes pelo WhatsApp.

#### Queda de conexão/Downtime Database 
- **Probabilidade:** Baixa / Muito Baixa
- **Impacto:** Extremo e geral do serviço Core.
- **Mitigação:**
  - Implementação de instâncias tolerantes nas Multi-zonas e backup contínuo do Atlas DB.
- **Plano de contingência:** Acionamento emergente do restore via backup limpo do cluster para retormada.

#### CRON Jobs/Jobs Assíncronos falhos Silenciosos
- **Probabilidade:** Média
- **Impacto:** Faltas de pacientes por falta de lembrete em tempo programado.
- **Mitigação:**
  - Injeção obrigatória do wrapper de Sentry Alerts nas rotinas de Timeouts operáveis do backend.
- **Plano de contingência:** Relatórios de check secundários por notificação Web Push avisando erro silencioso a Admins.

#### Vazamento Criptográfico / Comprometimento Sessão (JWT)
- **Probabilidade:** Baixa
- **Impacto:** Crítico e comprometedor à PI.
- **Mitigação:**
  - Invalidate rigoroso do refresh token rotation após um novo acionamento do fluxo da conta.
- **Plano de contingência:** Extinção de keys mestre rodando a derrubada de Logouts paralela e global da suite da operadora.

---

### ADRs e próximos passos
ADRs associados
- [ADR 001 - Decisão PWA vs Mobile Apps Nativas - Escolha PWA para rapidez e flexibilidade]
- [ADR 002 - Migração Z-API WebWpp Webhook Oficial para Stack auto-hospedada Evolution API pela eliminação total dos fee mensuráveis]

Decisões pendentes
- Aberta 1 — Queue para processamento assíncrono (BullMQ + Redis vs Serverless Queues. Relevante quando: volume de webhooks WhatsApp aumentar).
- Aberta 2 — Stack de pagamentos (Stripe vs MB Way vs outro. Relevante quando: planos Pro e Elite forem lançados).
- Aberta 3 — Anonimização de dados PII/anamnese (Como tratar dados médicos sensíveis a longo prazo. Relevante quando: mais tenants activos, possível RGPD).

Próximos passos
- FDD/LLD Generation: Expandir a documentação HLD atual para cenários microscópicos das Features implementáveis por branch e rota dentro da Fase Escopo.
