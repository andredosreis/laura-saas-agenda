# Git Workflow — Laura SaaS Agenda

Lê este ficheiro ao criar commits ou pull requests.

---

## Formato de Commit

```
<tipo>: <descrição curta em português>
```

| Tipo | Quando usar |
|---|---|
| `feat` | Nova funcionalidade para o utilizador |
| `fix` | Correcção de bug |
| `refactor` | Reorganização de código sem mudança de comportamento |
| `test` | Adição ou correcção de testes |
| `docs` | Documentação (ADRs, guidelines, README) |
| `chore` | Config, deps, CI, scripts |
| `security` | Melhorias de segurança (rate limit, helmet, etc.) |

**Exemplos:**
```
feat: adicionar banner de trial a expirar no dashboard
fix: corrigir isolamento de tenant em agendamentosController
test: adicionar testes de isolamento multi-tenant para clientes
docs: actualizar ADR-006 com plano de migração Z-API
chore: mover scripts de manutenção para scripts/maintenance/
security: adicionar rate limiting nas rotas públicas de auth
```

---

## Regras

- **Um commit por melhoria** — nunca agrupar alterações não relacionadas
- **Ler os ficheiros alterados antes de commitar** — nunca commitar às cegas
- Nunca commitar sem os testes passarem localmente
- Nunca usar `--no-verify` para contornar hooks

---

## Branch Naming

```
feature/<descricao-curta>
fix/<descricao-curta>
refactor/<descricao-curta>
docs/<descricao-curta>
```

**Exemplos:**
```
feature/banner-trial-expiracao
fix/isolamento-tenant-agendamentos
docs/adr-014-migration-strategy
```

---

## Fluxo de Trabalho

```bash
# 1. Criar branch a partir do main actualizado
git checkout main && git pull
git checkout -b feature/nome-da-feature

# 2. Implementar + verificar
npm test                     # testes passam
npm run build                # (frontend) sem erros TypeScript

# 3. Commitar
git add src/controllers/clienteController.js   # ficheiros específicos, nunca git add .
git commit -m "feat: descrição da mudança"

# 4. Push e PR
git push -u origin feature/nome-da-feature
gh pr create --title "feat: descrição" --body "..."
```

---

## Pull Request

**Título:** seguir o mesmo formato de commit (`feat:`, `fix:`, etc.)

**Body mínimo:**
```markdown
## O que muda
- Descrição concisa do que foi implementado

## Como testar
- Passos para verificar a mudança

## Checklist
- [ ] Testes passam
- [ ] Isolamento multi-tenant verificado (se backend)
- [ ] Design system respeitado (se frontend)
```

---

## O Que Nunca Fazer

- `git push --force` no `main`
- Commitar `.env` ou ficheiros com secrets
- Commits com múltiplas melhorias não relacionadas
- Commitar `console.log` de debug
- Squash de commits em PRs sem aprovação explícita
