# ADR-008: Web Push (VAPID) + PWA como Estratégia de Notificações Mobile

**Status:** Accepted  
**Data:** 2025-10-25  
**Módulo:** NOTIF  
**Autor:** André dos Reis  
**Score de Impacto:** 135 (Crítico)

---

## Contexto

A profissional autónoma usa a Laura principalmente no telemóvel. Notificações proactivas são essenciais para o produto: confirmações de novos agendamentos, lembretes de consultas do dia, e alertas de clientes que cancelaram. Sem notificações push, a profissional precisa de abrir a aplicação activamente para verificar actualizações — o que contradiz a proposta de valor de automação.

As duas opções principais para notificações mobile são: app nativa (iOS/Android com push nativo) ou Progressive Web App com Web Push. A decisão de tecnologia de notificações está directamente ligada à decisão de plataforma (PWA vs app nativa).

---

## Decisão

Adoptar **Progressive Web App (PWA)** com **Web Push Notifications via protocolo VAPID** como estratégia de notificações mobile, em vez de desenvolver apps nativas para iOS e Android.

A implementação inclui:
- **Service Worker** (`laura-saas-frontend/public/sw.js`) para intercepção e exibição de notificações em background
- **VAPID keys** geradas e geridas como segredos (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- **Backend de envio** via `web-push` library em `src/services/notificationService.js`
- **Subscrição no frontend** em `laura-saas-frontend/src/services/pushNotification.ts`
- **Ícones iOS** (`apple-touch-icon`) para instalação em ecrã inicial do iPhone

---

## Alternativas Consideradas

### 1. App nativa iOS + Android (React Native ou nativas)
- **Vantagem:** Acesso a APIs nativas (câmera, GPS, Bluetooth); push notifications nativas com maior fiabilidade; melhor performance em operações intensivas
- **Desvantagem:** Duas bases de código separadas (iOS + Android); processo de submissão e aprovação nas App Stores (tempo + custo); manutenção de SDKs nativos; custo de developer accounts Apple ($99/ano) e Google ($25); tempo de desenvolvimento 2-3x maior
- **Descartada** por custo e tempo de desenvolvimento incompatíveis com a fase actual de produto

### 2. Capacitor / Ionic (PWA empacotada como app nativa)
- **Vantagem:** Código web reutilizado numa shell nativa; push notifications nativas; uma base de código
- **Desvantagem:** Adiciona uma camada de complexidade (build nativo sobre o web); ainda requer submissão às App Stores; overhead de manutenção do Capacitor; overkill para as funcionalidades actuais
- **Descartada** por complexidade adicional sem benefícios claros para o caso de uso actual

### 3. Notificações apenas por email
- **Vantagem:** Simplicidade máxima; sem Service Worker; sem gestão de VAPID keys
- **Desvantagem:** Email não é canal primário da profissional alvo (usa WhatsApp e telemóvel); latência de entrega; sem notificação em tempo real
- **Descartada** por inadequação ao comportamento do utilizador alvo

---

## Consequências

### Positivas
- **Uma base de código:** O mesmo React app funciona como PWA em Android, iOS e Desktop — sem duplicação
- **Sem App Store:** Deploy imediato sem aprovação; updates chegam ao utilizador sem esperar aprovação da App Store
- **Custo zero de infraestrutura de push:** VAPID é um protocolo aberto; não há custo por notificação enviada (vs Firebase Cloud Messaging ou APNs com serviços pagos)
- **Instalável:** A profissional pode instalar a Laura no ecrã inicial do telemóvel como uma app, com ícone próprio

### Negativas / Trade-offs
- **Limitações no Safari iOS:** Web Push só foi suportado no Safari iOS a partir da versão 16.4 (Março 2023); utilizadores com iOS mais antigo não recebem notificações push; **mitigação:** WhatsApp como canal de fallback para lembretes
- **Service Worker tem lifecycle complexo:** Actualizações do Service Worker requerem gestão cuidadosa (múltiplos commits de `update service worker revision`) — um SW desactualizado pode não exibir notificações correctamente
- **VAPID keys como segredos:** As keys precisam de ser geridas em dois ambientes distintos (Render para o backend, Vercel para a variável pública no frontend) — houve problemas documentados com a variável no Vercel (`fix: Suporta VITE_VAPID_PUBLIC se Vercel bloquear _KEY`)
- **Permissão do utilizador obrigatória:** O browser exige consentimento explícito para notificações — utilizadores que recusam não recebem alertas; sem fallback automático documentado

### Limitação iOS documentada
> Em dispositivos iOS com Safari < 16.4, as notificações Web Push não são suportadas. A estratégia de fallback é o canal WhatsApp, que já envia lembretes via Z-API. Para versões mais recentes do iOS, a experiência é equivalente a uma app nativa.

---

## Links e Referências

- **PWA Phase 1:** 2025-10-25
- **Web Push funcional:** 2025-10-28
- **Ícones iOS:** 2025-10-28
- **Service Worker actualizado:** múltiplas vezes até 2026-02-23
- **Ficheiros chave:**
  - `laura-saas-frontend/public/sw.js` — Service Worker
  - `laura-saas-frontend/public/manifest.json` — PWA Manifest
  - `src/services/notificationService.js` — Backend VAPID e envio de push
  - `laura-saas-frontend/src/services/pushNotification.ts` — Subscrição no frontend
- **ADRs relacionados:**
  - [ADR-009: Deploy Split Render + Vercel](./ADR-009-split-deploy-render-vercel.md)
