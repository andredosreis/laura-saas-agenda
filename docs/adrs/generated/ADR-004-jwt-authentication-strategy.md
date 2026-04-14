# ADR-004: JWT Authentication com Access Token de 1 Hora

**Status:** Accepted  
**Data:** 2025-12-31 (ajuste de duração: 2026-01-23)  
**Módulo:** AUTH  
**Autor:** André dos Reis  
**Score de Impacto:** 140 (Crítico)

---

## Contexto

O sistema necessita de um mecanismo de autenticação que funcione com a arquitectura stateless do backend (Node.js no Render, sem sessões em memória partilhada) e que carregue o `tenantId` em cada request para habilitar o isolamento de dados.

A implementação inicial de autenticação foi introduzida em Dezembro de 2025 (`feat: Implement user authentication, tenant management`). Em Janeiro de 2026, a duração do access token foi explicitamente aumentada para 1 hora (`feat: enhance session expiration handling with user notifications and extend access token duration to 1 hour`), indicando que a duração anterior era insuficiente para a UX pretendida.

Em Fevereiro de 2026, rate limiting foi adicionado às rotas públicas de auth como camada adicional de protecção (`feat: add rate limiting to public auth routes`).

---

## Decisão

Adoptar **JWT (JSON Web Tokens)** como mecanismo de autenticação, com a seguinte configuração:

- **Access token:** duração de **1 hora**, assinado com `JWT_SECRET`
- **Refresh token:** duração de **7 dias**, assinado com `JWT_REFRESH_SECRET` separado
- **Payload do access token:** `{ userId, tenantId, role, plano }` — carrega o contexto necessário para auth e multi-tenancy sem queries adicionais ao banco
- **Armazenamento no frontend:** `localStorage` do browser
- **Revogação:** refresh token invalidado no logout (estratégia de blacklist ou rotação)

O `tenantId` no JWT é a fonte de verdade para isolamento de dados — nunca aceite do body da request.

---

## Alternativas Consideradas

### 1. Sessions com Express-Session + Redis
- **Vantagem:** Revogação imediata de sessões; sem risco de XSS roubar tokens persistidos
- **Desvantagem:** Requer Redis como infraestrutura adicional; incompatível com a arquitectura stateless no Render (múltiplas instâncias não partilhariam sessões sem Redis); custo operacional adicional na fase actual
- **Descartada** por incompatibilidade com a arquitectura stateless e custo de infraestrutura

### 2. JWT com HttpOnly Cookies
- **Vantagem:** Mitiga ataques XSS (JavaScript no browser não acede ao cookie); CSRF é o trade-off mas mitigável com SameSite
- **Desvantagem:** Configuração de CORS e cookies cross-origin entre domínios distintos (Render + Vercel) é complexa; `SameSite=None` requer HTTPS e configuração cuidadosa; o deploy split complica a gestão de cookies
- **Considerada e não adoptada** — identificada como melhoria de segurança futura; a complexidade cross-origin com o deploy split (Render backend + Vercel frontend) foi o factor decisivo para manter localStorage na fase actual
- **Risco documentado:** JWT em localStorage é vulnerável a XSS — qualquer script injectado pode ler o token

### 3. OAuth 2.0 / Auth externo (Auth0, Clerk)
- **Vantagem:** Delegação de segurança a especialistas; funcionalidades prontas (MFA, social login)
- **Desvantagem:** Custo adicional; dependência de vendor; integração com multi-tenancy e `tenantId` customizado requereria configuração complexa
- **Descartada** por custo e complexidade de integração com o modelo de multi-tenancy

---

## Consequências

### Positivas
- **Stateless:** Cada request é autenticada sem consulta ao banco (JWT é auto-contido)
- **tenantId no token:** O contexto de tenant está disponível em qualquer middleware sem query adicional
- **Compatível com deploy split:** Funciona com frontend em Vercel e backend em Render sem configuração especial de cookies cross-origin
- **Duração razoável:** 1 hora equilibra segurança (janela de exposição limitada) e UX (sessões não expiram durante uso normal)

### Negativas / Trade-offs
- **localStorage vulnerável a XSS:** Se o frontend tiver uma vulnerabilidade XSS, o token pode ser roubado — **mitigação:** CSP headers, sanitização de inputs, Helmet.js
- **Plano stale no token:** O campo `plano` no JWT fica desactualizado por até 1 hora após upgrade de plano — um tenant que faz upgrade vê as novas funcionalidades apenas após re-login ou expiração do token (ver ADR sobre Feature Gating)
- **Revogação não imediata:** Access tokens não podem ser invalidados antes de expirar — logout invalida o refresh token mas o access token permanece válido até expirar (1h)
- **Rotação obrigatória do refresh token:** A segurança do sistema depende de o refresh token ser correctamente invalidado no logout e rotacionado a cada uso

### Risco documentado e aceite
> O armazenamento de JWT em `localStorage` é um risco de segurança conhecido. A mitigação actual é a curta duração do access token (1h) e a adição de Helmet.js + CSP. A migração para HttpOnly cookies é identificada como melhoria futura quando o deploy split for consolidado num único domínio ou quando CORS cross-origin for configurado correctamente.

---

## Links e Referências

- **Implementado:** 2025-12-31
- **Duração ajustada para 1h:** 2026-01-23
- **Rate limiting adicionado:** 2026-02-21
- **Ficheiros chave:**
  - `src/middlewares/authMiddleware.js` — Verificação e decodificação do JWT
  - `src/controllers/authController.js` — Geração de tokens
  - `laura-saas-frontend/src/contexts/AuthContext.tsx` — Armazenamento e gestão no frontend
- **ADRs relacionados:**
  - [ADR-005: RBAC com Sistema Duplo](./ADR-005-rbac-dual-system-role-permissions.md)
  - [ADR-001: Database-per-Tenant Architecture](./ADR-001-database-per-tenant-architecture.md)
