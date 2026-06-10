# Identidade da clínica — formato `chave: valor`
# Alimenta os placeholders {{clinica_nome}}, {{owner_nome}} e
# {{owner_profissao}} nos system prompts (lead + client).
#
# IMPORTANTE: os prompts escrevem "a {{owner_nome}}" e "da {{clinica_nome}}",
# por isso os valores NÃO devem incluir artigo ("Laura", não "a Laura").
#
# Cada tenant deve ter o seu próprio clinica.md em prompts/tenants/<id>/.
# Estes defaults genéricos são apenas fallback.

nome: clínica
dona: responsável
profissao: profissional de estética e bem-estar
