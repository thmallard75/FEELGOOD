# Image de test / prod : API FeelGood + écran de connexion (pas la démo Pages).
# Render et `docker compose` utilisent ce fichier.

# --- Build du front (comptes réels, même origine que l'API) ---
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_SELF_HOSTED=true
ENV VITE_API_URL=
ENV VITE_DEMO_MODE=
RUN npm run build

# --- API Node + fichiers statiques ---
FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install --omit=dev --ignore-scripts pg@8.16.3

COPY base44 ./base44
COPY src/lib/memoryStore.js ./src/lib/memoryStore.js
COPY devserver ./devserver
COPY --from=web /web/dist ./dist

ENV HOST=0.0.0.0
ENV PORT=8787
ENV DATA_DIR=/data
ENV FEELGOOD_SEED=0
ENV NODE_ENV=production

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "devserver/server.mjs"]
