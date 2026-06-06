# Backend Node.js/Express (Marcai) — imagem de produção
# Usado por docker-compose.prod.yml (serviço `backend`, build: .)
FROM node:20-slim

# Utilizador não-root para correr a app (segurança)
WORKDIR /app

# Instala dependências primeiro (camada cacheável) — só produção.
# --legacy-peer-deps: o lockfile tem um conflito de peer deps APENAS em
# devDependencies (eslint@9 vs @eslint/js@10), que --omit=dev nem instala.
# Não afecta o runtime de produção.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Código da aplicação (runtime)
COPY src/ src/
COPY seeds/ seeds/

ENV NODE_ENV=production
ENV PORT=5000

# Versão deployada — passada no build (docker compose build-arg). Fica disponível
# em /api/version para confirmar que commit está a correr.
ARG GIT_SHA=unknown
ARG BUILT_AT=
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

EXPOSE 5000

# server.js arranca o Express + o worker BullMQ de notificações no mesmo processo
CMD ["node", "src/server.js"]
