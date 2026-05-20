FROM node:22-slim AS builder

RUN npm install -g pnpm@10

WORKDIR /app

COPY . .

RUN pnpm install

ENV BASE_PATH=/
ENV NODE_ENV=production

RUN PORT=9200 pnpm --filter @workspace/lumiere build

RUN pnpm --filter @workspace/api-server build

FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/lumiere/dist/public ./public
COPY --from=builder /app/scripts ./scripts

ENV NODE_ENV=production
ENV PORT=9200
ENV STATIC_DIR=/app/public

EXPOSE 9200

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
