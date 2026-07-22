# PENDENTE — Nome do produto, domínio e email transacional

> **Estado:** parado à espera da decisão do nome do produto (2026-07-17).
> **Bloqueia:** emails para clientes (reset de password, verificação de email).
> **Não bloqueia:** o alerta de WhatsApp em baixo — ver "Fazer já" no fim.

## Porque parou

O nome **Marcai** está tomado em toda a linha, e um dos casos é um concorrente
directo. Verificado por DNS e por inspecção dos sites a 2026-07-17:

| Domínio | Dono | O que é |
|---|---|---|
| `marcai.pt` | **outro** | *"Marcai \| Software de agendamento e gestão de marcações"* — agendamento para negócios de serviços **em Portugal**. Mesmo nome, mesma categoria, mesmo mercado. Planos Básico/Pro/Premium a 19€/49€/99€/mês. Demo num salão de beleza. |
| `marcai.app` | **outro** | Ferramenta de imagens de produto com IA. Empresa diferente do `.pt`. |
| `marcai.com` | **outro** | Nameservers no Japão (`gmoserver.jp`). |
| `marcai.io` | **outro** | Atrás de Cloudflare. |
| `appxpro.online` | **NOSSO** | GoDaddy (`domaincontrol.com`), DNS sob nosso controlo, **sem MX**. |

Confirmado que o `marcai.pt` **não é nosso**: não está ligado a nenhum dos 5
projectos Vercel da conta (`laura-saas-agenda`, `laura-saas-agenda-mfqt`,
`portfolio-andre`, `hypeflow`, `appxpro`), e o André não o comprou. O whois do
`.pt` não revela o registante (a DNS.PT só devolve dados da própria associação),
por isso a identificação do dono é por eliminação, não por registo.

⚠️ **Ambiguidade honesta:** o preçário self-serve (19/49/99) e os nomes
Básico/Pro/Premium assemelham-se ao modelo *anterior* do Marcai (o enum
`Tenant.plano.tipo` ainda tem `basico`/`pro`/`elite`), e o vertical bate certo.
A parecença é coincidência — não há ligação à nossa conta.

## Impacto real

- **SEO/marca:** quem pesquisar "Marcai" em Portugal encontra o outro produto.
- **Comercial:** a oferta é consultoria a €490 setup + €149/mês. O nome é a
  primeira coisa que a cliente verifica.
- **Email:** sem domínio próprio não há emails para clientes (ver abaixo).

## Custo de mudar o nome (medido a 2026-07-17)

~139 ocorrências de "Marcai" em `src/`, `laura-saas-frontend/src/`,
`ia-service/src/`. Quase todas mecânicas. O trabalho a sério é:

- `laura-saas-frontend/src/components/MarcaiLogo.jsx` — logo
- `laura-saas-frontend/vite.config.ts:58-59` — `name`/`short_name` do manifest
  PWA (é o que aparece no telemóvel de quem instala)
- `src/services/emailService.js` — templates e `DEFAULT_FROM`
- `Sidebar.jsx`, `InstallPrompt.tsx`, `PWAUpdatePrompt.tsx`, `VerificarEmail.jsx`

Estimativa: meia dia + logo novo. **O custo só cresce** — cada cliente, cada
email enviado e cada link indexado torna a mudança mais cara.

## Estado do email (porque está bloqueado)

O código está pronto e correcto. O que falta é **um domínio verificado**.

- **Enviar ≠ ter caixa de correio.** Para enviar de `noreply@<dominio>` **não é
  preciso** criar conta de email nenhuma. A Resend só exige prova de controlo do
  **domínio** (registos SPF/DKIM no DNS). Não há inbox, não há password.
- **`*.vercel.app` está fora de questão** — não é nosso, não controlamos o DNS.
  Não é limitação de plano; é de propriedade. A Vercel também não aloja email.
- **A integração Resend do marketplace da Vercel NÃO serve.** Injecta a
  `RESEND_API_KEY` no *projecto Vercel* (o frontend Vite), e os emails saem do
  backend Node no **Contabo**. A variável nunca lá chegaria. Regra geral: as
  integrações da Vercel só servem código que corre na Vercel — o nosso backend,
  ia-service, Redis e Evolution vivem todos no Contabo.
- **Falha silenciosa actual:** sem `RESEND_API_KEY`, o `sendEmail` devolve
  `{success:true, dev:true}` e só escreve no log (`emailService.js:44-50`). Uma
  cliente que carregue em "esqueci-me da senha" vê *"email enviado"* e não recebe
  nada. Com a chave posta, passa a erro honesto: o `forgotPassword` apanha a
  falha, limpa o token e devolve 500 (`authController.js:798-808`).

## Fazer JÁ — não depende do nome (2 min)

O alerta de "WhatsApp em baixo" (PR #89) só escreve para o André, e a Resend
deixa o remetente de teste `onboarding@resend.dev` enviar para o email da própria
conta. Está morto desde o PR #89: o cron deteta a queda e não consegue avisar.

Em `/opt/marcai/.env` no Contabo (**não** na Vercel), e restart:

```bash
RESEND_API_KEY=re_...
ALERT_EMAIL=<o email da conta Resend>
# NÃO definir EMAIL_FROM — o default onboarding@resend.dev é o que faz isto
# funcionar sem domínio (emailService.js:6)
PUBLIC_API_URL=https://api.80.241.222.235.sslip.io   # exigido pelo F21
```

Ver também `RESEND_API_KEY`/`SENTRY_DSN` vazios em produção — ver
`project_evolution_health_alert` nas memórias.

## Checklist de activação — quando o nome estiver decidido

1. [ ] Verificar disponibilidade a sério (DNS + registador, **não** a API de
       compra da Vercel — ela devolve "não disponível" para TLDs que não vende,
       ex. `.pt`, e foi isso que induziu em erro nesta investigação).
2. [ ] Comprar o domínio. Recomendação: garantir **pelo menos `.pt` e `.com`** —
       vender em Portugal com o `.pt` do concorrente é uma desvantagem recorrente.
3. [ ] Resend → Domains → adicionar um **subdomínio** (`mail.<dominio>`), não a
       raiz: mantém a reputação de envio separada e não mexe nos MX do domínio
       principal (se houver Google Workspace na raiz, mexer parte o email pessoal).
4. [ ] Copiar os registos SPF/DKIM para o DNS do registador.
5. [ ] `/opt/marcai/.env`: `EMAIL_FROM=<Nome> <noreply@mail.<dominio>>` + restart.
6. [ ] Testar reset de password ponta a ponta com uma conta real.
7. [ ] `EMAIL_REQUIRED=true` — o servidor passa a recusar arrancar sem a chave, e
       nunca mais se volta ao estado de falha silenciosa.
8. [ ] Renomear o produto no código (ver "Custo de mudar o nome").
9. [ ] Actualizar a lista de sub-processadores do DPA — a Resend trata nomes e
       emails de clientes das clínicas. Confirmar a região de envio (RGPD, ver
       `docs/operacoes/rgpd-conformidade.md`).

## Atalho interino (opcional, ~15 min)

Se for preciso provar a cadeia de emails **antes** de decidir o nome: o
`appxpro.online` é nosso, tem DNS sob nosso controlo e não tem MX. Verificar
`mail.appxpro.online` na Resend (registos na GoDaddy) e pôr o `EMAIL_FROM` a
apontar para lá. A marca fica errada, mas o reset de password funciona. Quando o
domínio novo existir, muda-se **uma linha** do `.env` — zero código.
