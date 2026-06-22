# ADR-029: Manter o Contabo como host único + backup próprio em Cloudflare R2 (em vez de migrar para Hostinger)

**Status:** Accepted
**Data:** 2026-06-21
**Módulo:** INFRA
**Autor:** André dos Reis
**Score de Impacto:** Alto

---

## Contexto

O [ADR-023](./ADR-023-consolidacao-vps-contabo.md) consolidou toda a stack de produção num único VPS Contabo (`80.241.222.235`): `nginx`+TLS, `backend` Node, `ia-service` Python, `evolution`, `redis` — tudo em Docker.

Em **2026-06-20** o Contabo ficou **inacessível** e continuava DOWN em **2026-06-21** (re-confirmado): `ping` com 100% packet loss, portas **22/SSH, 80, 443 todas em timeout**, mesmo depois de reiniciar pelo painel (que dizia "em execução"). A causa ainda não está confirmada — suspeita de **firewall (ufw / cloud Contabo) a bloquear** ou de a **stack de rede/containers não subir no boot**. Como nem o SSH respondia, o problema não eram os containers em si.

Isto levantou duas questões, que se decidem em conjunto:

1. **Onde hospedar?** Surgiu a hipótese de migrar para o **Hostinger** (`76.13.142.240`), que já corre Evolution+Redis como reserva. Mas o **Contabo é mais barato** que o Hostinger para esta stack *(a confirmar com valores: Contabo ~€X/mês vs Hostinger ~€Y/mês)*.
2. **Como fazer backup?** O Contabo oferece um **backup pago de snapshot do VPS**. Em alternativa, a Cloudflare R2 já é usada no projeto para o dump diário do Mongo e para arquivamento de mensagens ([ADR-026](./ADR-026-arquivamento-mensagens-r2-cold-storage.md)).

---

## Decisão

1. **Manter o Contabo como host único** — revertendo o plano de migração para o Hostinger — porque é **mais barato** para a mesma stack.
2. **Não contratar o backup pago do Contabo.** Em vez disso, **backup application-level para Cloudflare R2** (S3-compatível, já em uso), tornando o VPS **descartável e reproduzível**. Esta parte **não é só economia — é a jogada inteligente**: backup separado do que protege (boa prática) e dados num fornecedor neutro (independência), conforme os princípios abaixo.
3. Tratar o VPS como **cattle, not pets**: o *estado* vive **fora** do servidor — dados no R2, código no GitHub, stack no `docker-compose.prod.yml`. Uma falha do Contabo passa a ser **recuperável em minutos**, no próprio Contabo ou em qualquer outro provider.

### Princípios de desenho

1. **Host barato + estado externalizado > host caro + lock-in de backup do provider.** O dinheiro poupado no host e no backup pago paga-se em portabilidade.
2. **Backup só do que NÃO se reconstrói.** O que importa:
   - **MongoDB** → `mongodump` diário para R2 (já existe — falta validar/restaurar).
   - **Sessão do Evolution / WhatsApp** → tarball do volume para R2 (**novo, e o mais crítico**: sem isto, uma falha obriga a **novo QR** e perda da ligação WhatsApp).
   - **`.env` / nginx / compose** → snapshot cifrado para R2 (ou git privado).
   - **Redis/BullMQ, imagens Docker, OS** → **descartáveis** (filas regeneráveis; stack reconstruída por `docker compose`).
3. **O backup não pode viver no mesmo sítio que aquilo que protege.** Backup do Contabo guardado na própria infra/conta Contabo é um **único ponto de falha** — se o servidor ou a conta caem, cai o original *e* o backup juntos. O R2 é deliberadamente um **terceiro independente** (regra **3-2-1**: ≥2 suportes, ≥1 fora do provider). Já tínhamos falado nisto: backup num só lugar não é boa prática.
4. **Não ficar refém do provider.** Com os dados num fornecedor neutro que eu controlo (R2), saio do Contabo **quando quiser**. Se os backups vivessem no Contabo, sair tornava-se uma armadilha: o provider podia **atrasar ou recusar libertar os dados**, ou **cobrar um preço alto** pela exportação/egress — um *exit cost* artificial. Externalizar o estado **elimina esse risco de chantagem** e mantém a saída sempre barata.
5. **Hostinger fica como reserva quente / alvo de DR**, não como destino primário. Como os backups R2 são *provider-agnostic*, restauram no Hostinger se o Contabo se revelar instável — é o que torna a decisão "ficar no Contabo" segura.

---

## Alternativas Consideradas

### 1. Migrar a stack para o Hostinger
- **Vantagem:** o Hostinger já corre Evolution+Redis ("reserva" comprovada, UP); migração já mapeada.
- **Desvantagem:** **mais caro** que o Contabo para a mesma stack; mover por um incidente único (causa ainda não confirmada) é prematuro.
- **Não adotada como primário** — mas **fica como DR**, viabilizado pelos backups portáteis no R2.

### 2. Contratar o backup de snapshot pago do Contabo
- **Vantagem:** restaura a *máquina inteira* num clique.
- **Desvantagem:** o backup fica **no mesmo provider que protege** — único ponto de falha, cai tudo junto (viola a regra 3-2-1); **prende-te ao Contabo** (sair fica refém: o provider pode atrasar, recusar ou cobrar caro para libertar os dados); custo recorrente; e é **redundante** face ao backup R2 que já temos.
- **Descartada.**

### 3. Voltar ao Render / PaaS gerido
- **Desvantagem:** André já decidiu **abandonar o Render** (custo/controlo) — ver memória de infra e ADR-023.
- **Descartada.**

### 4. Multi-cloud / Kubernetes / orquestração gerida
- **Desvantagem:** over-engineering para a escala atual (poucos clientes pagantes); custo e complexidade operacional desproporcionados.
- **Descartada** (reavaliar com escala).

---

## Consequências

### Positivas
- **Custo mínimo** de host e zero custo de backup de provider.
- **Portabilidade total:** os backups no R2 restauram em qualquer provider — o lock-in desaparece e o Hostinger fica como DR pronto.
- **O incidente vira risco gerido:** com estado externalizado, "o Contabo morreu" deixa de ser catástrofe e passa a ser um `docker compose up` + restore.
- **Resiliência + independência (a verdadeira razão, acima do custo):** o backup vive **fora** do provider que protege (3-2-1) e os dados são **meus**, num fornecedor neutro — não fico refém do Contabo para os reaver, nem exposto a um *exit cost* se decidir sair.

### Negativas / Trade-offs
- **Recuperação não é "1 clique":** exige reprovisionar (`docker compose up`) + restaurar dados — mais passos que um snapshot de VPS.
- **A decisão é contingente** ao *root cause* do outage ser uma **má-configuração recuperável**, não um padrão de falha do Contabo (a confirmar em 2026-06-22).

### Riscos
- **Se o Contabo voltar a cair repetidamente,** a poupança não compensa o downtime → **reabrir esta decisão e migrar para o Hostinger** (o DR já está pronto).
- **Um backup nunca restaurado não é um backup.** O RTO só é real depois de um **teste de restore ponta-a-ponta**. Enquanto não for testado, a recuperabilidade é teórica.
- **Estado do painel super-admin** ([ADR-024](./ADR-024-painel-super-admin-multi-tenant.md) Fase 1+2) está em `main` mas **não em produção** enquanto não houver host vivo — depende deste plano.

---

## Plano de Implementação

Faseado, do recuperar para o blindar (a executar a partir de 2026-06-22).

### Fase 0 — Recuperar o Contabo
1. SSH/console → diagnosticar porque 22/80/443 não responderam (firewall ufw / cloud Contabo, docker não subiu no boot, stack de rede). **Documentar a causa** — é o que valida (ou não) esta ADR.
2. Hardening do boot: containers com `restart: unless-stopped`; garantir que a stack sobe no reboot; firewall com 22/80/443 abertas de forma persistente.

### Fase 1 — Backups → Cloudflare R2 (cron diário)
3. **Mongo:** validar o `mongodump → R2` existente e **restaurar um dump de teste**.
4. **Evolution:** tarball do volume de sessão/instância → R2 (novo — evita novo QR).
5. **Config:** `.env` / nginx / compose → snapshot cifrado para R2 (ou git privado).

### Fase 2 — Provar a recuperabilidade
6. **Teste de restore ponta-a-ponta:** provisionar limpo → restaurar do R2 → app viva. **Documentar RTO/RPO.**
7. Manter o Hostinger como DR (Evolution+Redis já lá); os backups R2 restauram lá se necessário.

---

## Links e Referências

- **Decidido em:** 2026-06-21, após o outage do Contabo de 2026-06-20/21.
- **ADRs relacionados:**
  - [ADR-023: Consolidação da Infraestrutura num VPS Único (Contabo)](./ADR-023-consolidacao-vps-contabo.md) — esta ADR **estende/ajusta** a 023: mantém o Contabo, mas externaliza o estado e dispensa o backup pago.
  - [ADR-026: Arquivamento de Mensagens em R2 (Cold Storage)](./ADR-026-arquivamento-mensagens-r2-cold-storage.md) — o R2 já é padrão estabelecido no projeto.
  - [ADR-001: Database-per-Tenant Architecture](./ADR-001-database-per-tenant-architecture.md) — o que o `mongodump` tem de cobrir (todas as DBs `tenant_*` + a partilhada).
  - [ADR-024: Painel Super-Admin Multi-Tenant](./ADR-024-painel-super-admin-multi-tenant.md) — em `main`, à espera de host vivo.
