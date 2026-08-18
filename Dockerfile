FROM node:22-alpine

WORKDIR /app

# Instala dependencias
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install --omit=dev

# Copia codigo da aplicacao
COPY . .

# Variaveis de ambiente padrao
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173
ENV COOKIE_SECURE=true

EXPOSE 4173

CMD ["node", "server.mjs"]
