# ADR-011: Desacoplamento Agendamento/Financeiro + Modular Monolith

**Status:** Accepted  
**Data:** 2026-04-12  
**Módulo:** ARCH  
**Autor:** André dos Reis  
**Score de Impacto:** 145 (Crítico)

---

## Contexto

O sistema actual acopla directamente o módulo de agendamento ao módulo financeiro — um cliente só consegue ser agendado se tiver um pacote comprado associado. Esta decisão, tomada no início do desenvolvimento, fazia sentido para o modelo de negócio original (clínica com pacotes de sessões pré-pagas).

Com o crescimento do produto, surgiu uma dor crítica: a clínica recebe muitas avaliações iniciais — consultas gratuitas ou de primeiro contacto onde o cliente ainda não comprou nenhum pacote. O sistema actual **bloqueia o agendamento destas avaliações**, forçando a profissional a registar o cliente de forma ad-hoc ou a gerir fora do sistema. Isto representa um bloqueador de aquisição de novos clientes.

Paralelamente, identificou-se que o crescimento do sistema vai exigir separação de responsabilidades mais clara para suportar evolução futura para microserviços e containerização Docker.

---

## Decisão

Adoptar duas decisões complementares:

**1. Desacoplar Agendamento de Financeiro**

O agendamento passa a ser independente — qualquer cliente pode ser agendado sem ter pacote comprado. O módulo financeiro é consultado de forma opcional após o agendamento, para verificar e registar a situação do cliente:

```
Fluxo novo:
  Cliente agenda (livre) 
    → comparece
    → profissional verifica: tem pacote? → desconta sessão
                             não tem?    → regista venda ou avaliação gratuita
```

O campo `pacoteId` no `Agendamento` passa de obrigatório para opcional. Um novo estado `avaliacao` é adicionado ao enum de tipos de agendamento.

**2. Reorganizar em Modular Monolith**

O código é reorganizado em módulos com fronteiras claras, cada um com os seus próprios controllers, services e routes — sem dependências directas entre módulos, comunicando por interfaces explícitas:

```
src/
  modules/
    agendamento/
      controllers/
      services/
      routes/
      models/
    financeiro/
      controllers/
      services/
      routes/
      models/
    clientes/       ← partilhado
    notificacoes/   ← partilhado
    ia/             ← futuro
  shared/
    middlewares/
    schemas/
    utils/
```

---

## Alternativas Consideradas

### 1. Manter acoplamento — adicionar flag "avaliação gratuita"
- **Vantagem:** Mudança mínima no código existente
- **Desvantagem:** Não resolve o problema estrutural — o acoplamento permanece; qualquer nova excepção requer mais flags; a dívida técnica cresce
- **Descartada** por não resolver a causa raiz

### 2. Microserviços imediatos (Agendamento Service + Financeiro Service)
- **Vantagem:** Separação total; cada serviço escala independentemente
- **Desvantagem:** Com um developer e um cliente activo, a complexidade operacional de microserviços (deploys separados, comunicação HTTP, observabilidade distribuída, gestão de falhas parciais) é desproporcional ao benefício actual
- **Descartada** — identificada como evolução futura quando o volume justificar

### 3. Modular Monolith (decisão adoptada)
- **Vantagem:** Fronteiras claras hoje, migração para microserviços amanhã sem reescrita — cada módulo já é um microserviço em potência, só falta empacotar num container e mudar imports para chamadas HTTP
- **Desvantagem:** Requer disciplina de equipa para não violar as fronteiras dos módulos
- **Adoptada** como equilíbrio óptimo para o estágio actual

---

## Consequências

### Positivas
- **Desbloqueio de aquisição:** Avaliações e primeiras consultas podem ser agendadas sem fricção
- **Separação de responsabilidades:** Cada módulo pode evoluir independentemente
- **Caminho claro para microserviços:** A fronteira do módulo é a fronteira futura do container Docker
- **Testabilidade:** Módulos isolados são mais fáceis de testar unitariamente

### Negativas / Trade-offs
- **Migração do código existente:** Controllers e services actuais precisam de ser reorganizados — trabalho de refactoring com risco de regressões em produção
- **Disciplina de fronteiras:** Sem enforcement automático, um developer pode importar directamente entre módulos violando a separação — code review é a barreira
- **Agendamentos sem pacote:** A profissional precisa de um fluxo claro para gerir clientes sem pacote após a consulta — UX a definir

### Regra crítica
> **Módulos não importam uns dos outros directamente. Comunicação entre módulos é feita por interfaces de service ou eventos internos — nunca por import directo de controllers ou models de outro módulo.**

---

## Plano de migração

1. Tornar `pacoteId` opcional no schema `Agendamento`
2. Adicionar estado `avaliacao` ao enum de tipos
3. Remover validação obrigatória de pacote no controller de agendamentos
4. Reorganizar estrutura de pastas para `src/modules/`
5. Adicionar verificação pós-consulta no fluxo financeiro

---

## Links e Referências

- **Data da decisão:** 2026-04-12
- **Ficheiros afectados:**
  - `src/models/Agendamento.js` — tornar pacoteId opcional
  - `src/controllers/agendamentosController.js` — remover validação de pacote
  - `src/app.js` — reorganização de routes
- **ADRs relacionados:**
  - [ADR-001: Database-per-Tenant Architecture](./ADR-001-database-per-tenant-architecture.md)
  - [ADR-012: Containerização Docker com evolução para microserviços](./ADR-012-docker-containerization-strategy.md)
  - [ADR-013: Notification Pipeline com BullMQ](./ADR-013-notification-pipeline-bullmq.md)
