# Skill: Documentação Direcionada (Context7)

## Objetivo
Instruir o agente (Gemini) a atuar da mesma forma que o MCP "context7" do Claude, forçando a busca de documentação de bibliotecas através das fontes oficiais.

## Regras e Workflow (IsSkillFile)

1. **Antes de implementar funcionalidades complexas ou usar bibliotecas:**
   - Evitar "hallucinações" ou uso de código obsoleto.
   - NÃO fazer buscas globais abertas na internet.
   - USAR a tool `search_web` com o parâmetro opcional `domain: [url_oficial]` mapeando para o site oficial da documentação.
   - SE tiver acesso a URLs diretas das APIs, usar `read_url_content`.

2. **Mapeamento de Domínios Oficiais do Projeto:**
   - **React/Vite:** `domain:react.dev` ou `domain:vitejs.dev`
   - **Node.js:** `domain:nodejs.org`
   - **Express:** `domain:expressjs.com`
   - **Mongoose / MongoDB:** `domain:mongoosejs.com`
   - **Tailwind:** `domain:tailwindcss.com`

3. **Exceções:**
   Não precisa realizar pesquisa para:
   - Declaração de variáveis
   - Padrões de lógica puros do Javascript/Typescript
   - CRUDs que usem a estrutura de controladores e modelos que já está documentada nos ficheiros Mongoose do próprio projeto.
