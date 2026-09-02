FROM node:24-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --chown=node:node . .
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173
ENV JURISFLOW_DATA_DIR=/app/data

EXPOSE 4173

USER node
CMD ["node", "server.mjs"]
