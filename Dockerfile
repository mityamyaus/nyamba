FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node dist ./dist
COPY --chown=node:node lib ./lib
COPY --chown=node:node data ./data
COPY --chown=node:node server.cjs ./
RUN mkdir -p .app-data .catalog-cache && chown -R node:node .app-data .catalog-cache
USER node
ENV NODE_ENV=production PORT=4173 BIND_ADDRESS=0.0.0.0
EXPOSE 4173
CMD ["node","server.cjs"]
