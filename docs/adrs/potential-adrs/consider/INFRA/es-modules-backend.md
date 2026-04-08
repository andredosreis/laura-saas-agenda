# Potential ADR: ES Modules (ESM) no Backend Node.js

**Module**: INFRA
**Category**: Architecture
**Priority**: Consider (Score: 80)
**Date Identified**: 2026-04-08

---

## What Was Identified

O backend Node.js utiliza **ES Modules** (`"type": "module"` no `package.json`) em vez de CommonJS, decisão implementada em **25 de setembro de 2025** (`refactor: update package.json to use ES modules and remove tsconfig.json`). A migração ocorreu junto com a refatoração de rotas e controllers para o padrão `import/export`.

## Why This Might Deserve an ADR

- **Impact**: Afeta todos os arquivos do backend — sintaxe de imports, compatibilidade com bibliotecas, configuração de Jest/testes
- **Trade-offs**: ESM é o padrão moderno mas algumas bibliotecas Node.js têm suporte parcial; `__dirname` e `require()` não estão disponíveis nativamente em ESM
- **Complexity**: Configuração de Jest com ESM requer adaptações; dynamic imports têm sintaxe diferente
- **Team Knowledge**: Desenvolvedores acostumados com CommonJS podem se surpreender com limitações do ESM no Node.js

## Evidence Found in Codebase

### Key Files
- [`package.json`](../../../../package.json) — `"type": "module"`
- [`src/server.js`](../../../../src/server.js) — Entry point com ESM

### Impact Analysis
- Migrado: 2025-09-25
- Motivação no commit: padronização com frontend (que já usava ESM via Vite)
- Impacto: 100% dos arquivos backend

## Questions to Address in ADR (if created)

- Por que ESM em vez de manter CommonJS?
- Como foram resolvidos os problemas de compatibilidade com bibliotecas?
- Como Jest está configurado para funcionar com ESM?

## Related Potential ADRs
- [Split Deploy Render+Vercel](../must-document/INFRA/split-deploy-render-vercel.md)
