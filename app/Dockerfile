FROM node:22-bookworm-slim

WORKDIR /app

# Pas de npm : Node 22 strippe le TypeScript, analyzeTrip et Overpass
# s'executent tels quels. Aucun appel a Base44.
COPY base44 ./base44
COPY src/lib/memoryStore.js ./src/lib/memoryStore.js
COPY devserver ./devserver

ENV HOST=0.0.0.0
ENV PORT=8787
ENV DATA_DIR=/data
ENV FEELGOOD_SEED=0
ENV NODE_ENV=production

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "devserver/server.mjs"]
