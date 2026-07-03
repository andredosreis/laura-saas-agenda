"""Tenant knowledge loader (Phase 4a).

Reads markdown prompts per tenant from `prompts/tenants/<tenantId>/`.
Falls back to `prompts/tenants/_default/` when tenant-specific file
does not exist. Results are LRU-cached in-memory.

Usage:
    txt = load_catalogo(tenant_id)             # always-injected
    txt = load_voz(tenant_id)                  # always-injected
    txt = load_politicas(tenant_id)            # always-injected
    cfg = load_clinica_config(tenant_id)       # identidade (nome, dona, profissao)
    section = find_servico(tenant_id, "drenagem")  # on-demand
    section = find_faq(tenant_id, "pagamento")     # on-demand

Editing markdown files requires a service restart to invalidate the cache.
"""

from __future__ import annotations

import unicodedata
from functools import lru_cache
from pathlib import Path

# Resolve prompts dir from this file's location so it works regardless of CWD.
# tenant_knowledge.py → services/ → ia_service/ → prompts/tenants/
_PROMPTS_DIR = Path(__file__).parent.parent / "prompts" / "tenants"
_DEFAULT_DIR = _PROMPTS_DIR / "_default"


# ─────────────────────────── Helpers ───────────────────────────


def _strip_accents(text: str) -> str:
    """Lowercase + remove accents for case+accent-insensitive matching."""
    nfd = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn")


def _resolve_path(tenant_id: str, filename: str) -> Path:
    """Return tenant-specific path if it exists, else fallback to _default."""
    tenant_path = _PROMPTS_DIR / tenant_id / filename
    if tenant_path.is_file():
        return tenant_path
    return _DEFAULT_DIR / filename


def _read_file(tenant_id: str, filename: str) -> str:
    """Read a markdown file (with fallback to _default). Returns empty string on miss."""
    path = _resolve_path(tenant_id, filename)
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")


def _parse_h2_sections(text: str) -> dict[str, str]:
    """Parse markdown into a dict of {h2_title: content_under_section}.

    Each value is the lines from "## Title" up to (but not including) the
    next "## " or EOF. Includes the H2 line itself so the output can be
    quoted directly to the LLM.
    """
    sections: dict[str, str] = {}
    current_title: str | None = None
    current_lines: list[str] = []

    for line in text.splitlines():
        if line.startswith("## "):
            # flush previous section
            if current_title is not None:
                sections[current_title] = "\n".join(current_lines).rstrip() + "\n"
            current_title = line[3:].strip()
            current_lines = [line]
        elif current_title is not None:
            current_lines.append(line)
        # lines before the first H2 (e.g. # Title, intro) are ignored

    if current_title is not None:
        sections[current_title] = "\n".join(current_lines).rstrip() + "\n"

    return sections


# ──────────────────────── Always-injected ────────────────────────
#
# These three are short and go in every system prompt. Cache one per tenant.


@lru_cache(maxsize=128)
def load_catalogo(tenant_id: str) -> str:
    return _read_file(tenant_id, "catalogo.md")


@lru_cache(maxsize=128)
def load_voz(tenant_id: str) -> str:
    return _read_file(tenant_id, "voz.md")


@lru_cache(maxsize=128)
def load_politicas(tenant_id: str) -> str:
    return _read_file(tenant_id, "politicas.md")


# ─────────────────── Identidade da clínica ───────────────────
#
# clinica.md tem linhas `chave: valor` (nome, dona, profissao). Alimenta os
# placeholders {{clinica_nome}}, {{owner_nome}} e {{owner_profissao}} dos
# system prompts — o produto é multi-tenant, nunca hardcodar a identidade
# de uma clínica concreta nos templates.
#
# Os defaults são genéricos mas gramaticais: os prompts escrevem
# "a {{owner_nome}}" / "da {{clinica_nome}}", por isso os valores não
# devem incluir artigo.

_CLINICA_DEFAULTS = {
    "nome": "clínica",
    "dona": "responsável",
    "profissao": "profissional de estética e bem-estar",
    # Preço "a partir de" citado ao lead/cliente ({{preco_entrada}}). É por
    # tenant (clinica.md) — nunca hardcodar um valor concreto nos templates
    # partilhados. Default preserva o comportamento histórico (Laura).
    "preco_entrada": "40 €",
}


@lru_cache(maxsize=128)
def load_clinica_config(tenant_id: str) -> dict[str, str]:
    """Identidade da clínica com fallback a _default. Não mutar o resultado."""
    cfg = dict(_CLINICA_DEFAULTS)
    raw = _read_file(tenant_id, "clinica.md")
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key in cfg and value:
            cfg[key] = value
    return cfg


# ────────────────────────── On-demand ──────────────────────────
#
# servicos.md and faqs.md can be larger. We cache the parsed dict per
# tenant, then search inside it.


@lru_cache(maxsize=128)
def _read_servicos(tenant_id: str) -> dict[str, str]:
    return _parse_h2_sections(_read_file(tenant_id, "servicos.md"))


@lru_cache(maxsize=128)
def _read_faqs(tenant_id: str) -> dict[str, str]:
    return _parse_h2_sections(_read_file(tenant_id, "faqs.md"))


def _search_sections(sections: dict[str, str], query: str) -> str | None:
    """Find a section whose normalized title best matches the query.

    Matching strategy (first hit wins):
      1. Exact title match after normalization (`drenagem linfática modeladora`).
      2. All query words appear in title — handles "pacote 10" against
         "Pacote de 10 Sessões..." and "pre operatorio" against
         "Pré e Pós-Operatório".
      3. Substring fallback (handles single-word queries).
    """
    if not query.strip():
        return None
    needle = _strip_accents(query)
    needle_words = [w for w in needle.split() if w]

    # 1. Exact match
    for title, content in sections.items():
        if _strip_accents(title) == needle:
            return content

    # 2. All-words match (most useful for multi-word queries)
    if len(needle_words) >= 2:
        for title, content in sections.items():
            title_norm = _strip_accents(title)
            if all(w in title_norm for w in needle_words):
                return content

    # 3. Substring fallback
    for title, content in sections.items():
        if needle in _strip_accents(title):
            return content

    return None


def find_servico(tenant_id: str, nome: str) -> str | None:
    """Return the markdown section describing a service, or None if not found."""
    return _search_sections(_read_servicos(tenant_id), nome)


def find_faq(tenant_id: str, pergunta: str) -> str | None:
    """Return the markdown section answering an FAQ, or None if not found."""
    return _search_sections(_read_faqs(tenant_id), pergunta)
