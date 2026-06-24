# ADR-029: Disaster Recovery do Stack Contabo — Backup Off-Site para R2

**Status:** Proposed
**Data:** 2026-06-23
**Módulo:** INFRA
**Autor:** André dos Reis
**Score de Impacto:** 120 (Alto)

---

## Contexto

No fim de semana de **20-21/06/2026** o VPS Contabo teve um incidente e o acesso ficou
indisponível (recuperado a 23/06). O episódio expôs uma pergunta que nunca foi formalizada:
**se o Contabo for abaixo de vez (ou perdermos o acesso à conta/região), o que é que perdemos
e quanto tempo demora a voltar?**

A arquitectura actual (ADR-023) já protege o **activo mais crítico**:

- **Código** → no GitHub; o deploy faz `git clone` (não vive só no VPS).
- **Base de dados** → no **MongoDB Atlas** (não no Contabo), com backups geridos do Atlas
  **+** dump diário do cluster inteiro para Cloudflare R2 (GitHub Action `backup.yml`,
  rotação daily/weekly/monthly). Volume real ~0,5 MB.

Mas há componentes que **vivem apenas no VPS Contabo** e que se perdem numa falha total:

| Componente | Onde vive | Reproduzível? | Dor se perdido |
|---|---|---|---|
| **`.env`** (segredos) | `/opt/marcai/.env` (gitignored) | ❌ não está no Git | Alta — JWT secrets, `EVOLUTION_API_KEY`, `MONGODB_URI`, chaves R2, VAPID, SMTP… reconstruir à mão é lento e arriscado |
| **Evolution — volume `evolution_data`** | `/evolution/instances` | ❌ | Alta — é a **sessão/emparelhamento do WhatsApp**; sem ele é preciso **reler o QR** |
| **Evolution — postgres** | volume do `marcai-postgres` | ❌ | Média — chats/contactos do lado da Evolution |
| **Config nginx** | `nginx/conf.d/marcai.conf` (domínios via `sed`) | ⚠️ parcial | Baixa — reconstruível pelos scripts de `deploy/` |
| **Redis** | volume `redis-data` | ✅ transitório | Baixa — fila BullMQ regenera-se |

O Contabo oferece um **plano de auto-backup pago** (cobrança mensal), mas: (a) tem custo
recorrente; (b) "não acopla tudo" — é snapshot da VM, não granular/selectivo; e
**(c) se perdermos o acesso ao próprio Contabo, esse backup fica inacessível** — exactamente
o cenário do fim de semana. Um backup só faz sentido como rede de segurança se estiver
**fora** do sistema que pode falhar.

**Nota:** esta decisão chegou a ser conversada num chat anterior (a ideia de "manter Contabo
+ backup R2"), mas **nunca foi documentada nem commitada** — este ADR fecha esse buraco.

---

## Decisão

**Fazer backup off-site, para Cloudflare R2, apenas dos componentes irreproduzíveis que vivem
só no Contabo** — `.env` (cifrado), dump do postgres da Evolution e o volume `evolution_data`
— deixando de fora o que já está protegido ou é facilmente reconstruível.

Princípios:

1. **Backup só do que dói perder e não se reproduz.** Código (GitHub) e BD (Atlas+R2) já estão
   cobertos — não duplicar. Redis é transitório — ignorar. Foco: `.env`, Evolution (volume + pg).
2. **Off-site e independente do Contabo.** Destino = R2 (mesmo bucket/credenciais do `backup.yml`),
   para que a cópia sobreviva à indisponibilidade total do VPS.
3. **Segredos NUNCA em claro fora do VPS.** O `.env` é cifrado (ex: `age`/`gpg` com chave guardada
   à parte) **antes** de ir para o R2. Pôr segredos em claro num bucket é uma vulnerabilidade.
4. **Restauro documentado e testado.** Um backup que nunca foi restaurado não é um backup — o
   runbook de recuperação tem de existir e ser exercitado pelo menos uma vez.

A decisão de **manter ou cancelar o plano de auto-backup pago do Contabo** fica em aberto:
reavaliar depois de este backup selectivo estar a correr (provavelmente passa a ser redundante).

---

## "Vale a pena?" — Análise

**Custo de fazer:** baixo. Um job (cron no Contabo ou GitHub Action via SSH) que: `pg_dump` da
Evolution, `tar` do volume `evolution_data`, cifra o `.env`, e faz upload para R2. Os dados são
pequenos (BD ~0,5 MB; volume/pg da Evolution na ordem de poucos MB) → **muito dentro do free tier
de 10 GB do R2**, custo monetário ≈ 0 €. Manutenção: mínima.

**Benefício:** o produto **é** WhatsApp — uma falha do Contabo hoje significa **WhatsApp em baixo**
até reconstruir tudo à mão e **reler o QR**. Com este backup, o RTO (tempo de recuperação) cai de
*horas/dias de reconstrução* para *minutos de restauro*, e elimina o risco de perder os segredos.

**Custo de NÃO fazer:** repetir o fim de semana — reconstrução manual, re-emparelhamento do
WhatsApp (downtime de negócio), e reconstrução do `.env` de memória.

**Conclusão (recomendação):** **vale a pena**, na versão *selectiva* (não snapshot completo da VM).
É barato, ataca exactamente o que ficou exposto no incidente, e não duplica o que já está seguro.
O esforço é dominado por **fazer bem a cifragem do `.env` e testar o restauro** — não pela cópia em si.

---

## Alternativas Consideradas

### 1. Status quo — confiar só no Atlas/GitHub + plano pago do Contabo
- **Vantagem:** zero trabalho novo.
- **Desvantagem:** `.env` e Evolution continuam sem rede off-site; o plano pago é inacessível se
  perdermos o Contabo (o cenário real do fim de semana). **Descartada.**

### 2. Snapshot completo da VM (imagem) para off-site
- **Vantagem:** restauro "tudo de uma vez".
- **Desvantagem:** pesado (GBs), caro de mover/guardar, e overkill quando o código está no Git, a
  BD no Atlas, e o que falta são MBs. **Não adoptada** — desproporcional.

### 3. Backup selectivo dos componentes Contabo-only para R2 *(adoptada)*
- **Vantagem:** barato, off-site, ataca exactamente o gap, não duplica.
- **Desvantagem:** exige tratar a cifragem de segredos e manter um runbook de restauro.

### 4. Migrar a Evolution para um serviço gerido / postgres gerido
- **Vantagem:** tira o estado do VPS de vez.
- **Desvantagem:** trabalho e custo maiores; fora do âmbito desta decisão. **Futuro, se escalar.**

---

## Consequências

### Positivas
- **Recuperação rápida** de uma falha do Contabo (minutos vs reconstrução manual).
- **Sem re-emparelhar o WhatsApp** no restauro (o volume `evolution_data` é restaurado).
- **Segredos protegidos** off-site (cifrados) — deixa de haver o `.env` como ponto único.
- **Possível poupança** — pode tornar o plano pago do Contabo redundante.

### Negativas / Trade-offs
- **Mais um job a manter** (e a monitorizar — um backup que falha em silêncio é pior que nenhum).
- **Gestão da chave de cifragem** — a chave que decifra o `.env` tem de ser guardada **fora** do
  Contabo e do R2 (senão a cifragem não protege de nada).

### Pontos de atenção
> - **Sessão WhatsApp pode ser invalidada:** restaurar `evolution_data` evita o QR *na maioria dos
>   casos*, mas o WhatsApp pode invalidar a sessão (mudança de dispositivo/versão) — o runbook tem
>   de prever o fallback de reler o QR.
> - **Compatibilidade de versão:** restaurar o postgres/volume assume a mesma major da Evolution
>   (hoje `v2.3.7`, ADR-016) — registar a versão junto do backup.
> - **Testar o restauro** pelo menos uma vez (idealmente num VPS limpo) — caso contrário não há
>   garantia de que funciona.

---

## Plano (se aprovado)

1. **Script de backup** (`deploy/` ou `scripts/`): `pg_dump` da Evolution + `tar` de
   `evolution_data` + cifrar `.env` → upload para `s3://<bucket>/contabo/` no R2 (reutilizar
   credenciais R2 do `backup.yml`).
2. **Agendamento:** decidir **cron no Contabo** (acede aos volumes localmente — mais simples) vs
   **GitHub Action via SSH** (centralizado com o `backup.yml`, mas precisa de alcançar os volumes).
   *Recomendação inicial:* cron no Contabo, porque os dados são locais ao VPS.
3. **Cifragem:** `age` (ou `gpg`); a chave privada guardada fora do Contabo/R2 (ex: gestor de
   segredos pessoal / GitHub secret).
4. **Rotação:** daily/weekly à semelhança do `backup.yml` (lifecycle no bucket).
5. **Runbook de restauro** em `docs/` + **um teste real** de recuperação.
6. **Reavaliar** o plano pago do Contabo (manter vs cancelar) depois de isto estar a correr.

---

## Links e Referências

- **Incidente que motivou:** Contabo em baixo 20-21/06/2026 (recuperado 23/06).
- **ADRs relacionados:**
  - [ADR-023: Consolidação no VPS Contabo](./ADR-023-consolidacao-vps-contabo.md) — topologia, persistência e backups de config
  - [ADR-016: Evolution API v2 Upgrade](./ADR-016-evolution-api-v2-upgrade.md) — versão `v2.3.7`
  - [ADR-021: Evolution Instance per Tenant](./ADR-021-evolution-instance-per-tenant.md)
  - [ADR-026: Arquivamento de Mensagens para R2 (Cold Storage)](./ADR-026-arquivamento-mensagens-r2-cold-storage.md) — outro uso do R2 (não confundir: arquivo ≠ backup)
- **Backup da BD existente:** `.github/workflows/backup.yml` (mongodump Atlas → R2), restauro `scripts/maintenance/restore-backup.sh`.
