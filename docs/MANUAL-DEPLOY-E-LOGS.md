# Manual — Deploy e Logs (Contabo)

Guia prático para publicar alterações em produção e ver o que se passa.
Escrito para uso rápido, sem assumir conhecimento de servidores.

---

## 1. O essencial em 30 segundos

| Parte | Onde corre | Como atualiza |
|---|---|---|
| **Frontend** (o site/app) | **Vercel** | **Automático** a cada merge em `main` ✅ |
| **Backend + IA + WhatsApp** | **Servidor Contabo** | **Manual**: entrar no servidor e dar 1 comando |

> ⚠️ Fazer merge no GitHub **não** atualiza o Contabo. O Contabo é uma máquina tua;
> tens de entrar lá e mandar atualizar. Este manual é sobre isso.

**Dados do servidor:**
- IP: `80.241.222.235`
- Utilizador: `marcai` (ou `root`)
- Pasta do projeto no servidor: `~/marcai` (ou seja, `/home/marcai/marcai`)
- Ficheiro de orquestração: `docker-compose.prod.yml`

---

## 2. Entrar no servidor (SSH)

No teu Mac, abre o **Terminal** (Cmd ⌘ + barra de espaço → escreve `Terminal` → Enter) e escreve:

```bash
ssh marcai@80.241.222.235
```

O que pode aparecer a seguir:

| Aparece | O que é | O que fazer |
|---|---|---|
| `Enter passphrase for key…` | A senha da tua **chave SSH** | Escreve a passphrase da chave |
| `marcai@…'s password:` | A senha do **utilizador marcai** | Escreve essa senha (não aparece no ecrã — é normal) |
| `Permission denied (publickey)` | A chave não foi aceite | Ver secção **2.1** (recuperar acesso) |
| `Connection timed out/refused` | Não chegou ao servidor | Verifica a net; confirma o IP no painel Contabo |

Quando entras, o início da linha muda para algo como `marcai@vmi3244070:~$` — **estás dentro**.
Para sair do servidor: escreve `exit` e Enter.

### 2.1 Recuperar acesso (esqueci a senha / publickey denied)

No **painel da Contabo** (contabo.com → o teu servidor → menu `⋮` no canto superior direito):

- **"Redefinir Credenciais"** 🔑 → define uma **nova senha de root** (anota-a). Depois tenta
  `ssh root@80.241.222.235` e usa essa senha.
- **"Controle VNC"** 🔒 → abre o console do servidor **pelo navegador/cliente VNC**, sem SSH.
  Útil se o SSH estiver mesmo bloqueado. Entras com `root` + a senha de root.

> Nota: o servidor foi endurecido (hardening) e o login por senha no SSH pode estar
> desligado. Nesse caso usa a **chave SSH** ou o **VNC**.

---

## 3. Fazer deploy (publicar alterações)

**Dentro do servidor** (depois do passo 2), corre:

```bash
cd ~/marcai
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

O que isto faz:
1. `git pull` → traz o código novo de `main`.
2. `docker compose … up -d --build` → reconstrói o **backend** e o **ia-service** com o
   código novo e reinicia-os. Demora ~1-3 min (está a construir as imagens).

Quando terminar, confirma que está tudo a correr:

```bash
docker compose -f docker-compose.prod.yml ps
```
Todos os serviços devem aparecer como **`running`** / **`Up`**.

> 💡 Dica: cria um atalho. Dentro do servidor, uma vez só:
> ```bash
> echo "cd ~/marcai && git pull && docker compose -f docker-compose.prod.yml up -d --build" > ~/deploy.sh && chmod +x ~/deploy.sh
> ```
> A partir daí, para fazer deploy é só: `~/deploy.sh`

---

## 4. Ver os logs (o que o sistema está a fazer)

### Opção A — No navegador (Dozzle) — mais fácil
Se o painel de logs estiver configurado, abre no browser:

```
https://logs.<o-teu-dominio>
```
(pede um login — utilizador/senha do *basic auth* do nginx). Mostra os logs de todos os
serviços em tempo real, sem terminal.

> Se a página não abrir, usa a Opção B (terminal). O Dozzle é opcional.

### Opção B — No terminal (sempre funciona)
**Dentro do servidor:**

```bash
# logs ao vivo do backend + ia-service (Ctrl+C para sair)
docker compose -f docker-compose.prod.yml logs -f backend ia-service

# só o backend
docker compose -f docker-compose.prod.yml logs -f backend

# últimas 100 linhas (sem ficar preso ao vivo)
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

**Serviços que podes ver nos logs:** `backend`, `ia-service`, `evolution-api`,
`nginx`, `postgres`, `redis`.

### O que procurar nos logs (mensagens-chave)
| Mensagem | Significa |
|---|---|
| `webhook_routed` | Uma mensagem entrou e foi encaminhada |
| `[webhook] áudio transcrito` | Uma nota de voz foi transcrita com sucesso |
| `transcribe_ok` (ia-service) | O Gemini devolveu a transcrição |
| `[webhook] áudio: download falhou` | Não conseguiu descarregar o áudio do Evolution |
| `webhook_manual_outbound_persisted` | Gravou uma resposta dada pelo telemóvel |
| `[Redis] Ligado` | A fila de lembretes está ligada |

---

## 5. Reiniciar / ver estado

```bash
# estado de todos os serviços
docker compose -f docker-compose.prod.yml ps

# reiniciar um serviço (ex.: backend)
docker compose -f docker-compose.prod.yml restart backend

# reiniciar tudo
docker compose -f docker-compose.prod.yml restart
```

---

## 6. Testar as funcionalidades novas (smoke-test)

Depois de um deploy, com os logs abertos (`logs -f backend ia-service`):

1. **Nota de voz (áudio):** manda um áudio para o WhatsApp do salão.
   - Esperado nos logs: `[webhook] áudio transcrito` + `transcribe_ok`.
   - Se a IA estiver **ligada**, ela responde em texto.
2. **Resposta pelo telemóvel:** responde a um cliente pelo telemóvel do salão.
   - Esperado: a mensagem aparece no **inbox de Conversas** e o contacto fica com **`⏸ tu`**
     (IA pausada nesse cliente). Para a IA voltar a esse cliente, reativa no inbox.

> ⚠️ Para a IA **responder** a um áudio, a IA tem de estar **ligada** (botão no inbox +
> o contacto com IA ativa). Com a IA desligada, o áudio é transcrito e gravado, mas a IA
> fica em silêncio.

---

## 7. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `git pull` diz "Already up to date" mas correste no Mac | Correste **localmente**, não no servidor | Entra no servidor primeiro (secção 2) |
| `failed to read .env … unexpected character` | Estás a correr no Mac (lê o `.env` local) | Faz no servidor; e limpa a linha errada do `.env` local |
| Deploy feito mas nada mudou | Esqueceste o `--build` | Repete com `… up -d --build` |
| `audio: download falhou` nos logs | Forma do pedido ao Evolution | Reportar — pode precisar de ajuste à versão do Evolution |
| Um serviço aparece `Restarting`/`Exit` no `ps` | Crash no arranque | Ver `logs --tail=100 <serviço>` para a causa |

---

## 8. Tornar o deploy automático (opcional, recomendado)

Para nunca mais entrares no servidor à mão, dá para montar um **GitHub Action** que faz
SSH ao Contabo e corre o deploy sozinho a cada merge em `main` — igual à Vercel.
Requer adicionar uma chave SSH como *secret* no GitHub. Ver issue/PR dedicado quando for criado.
