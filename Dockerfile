FROM node:22-alpine AS builder

RUN npm install -g pnpm@10

WORKDIR /app

COPY . .

RUN pnpm install

ENV BASE_PATH=/
ENV NODE_ENV=production

RUN PORT=9001 pnpm --filter @workspace/lumiere build

RUN pnpm --filter @workspace/api-server build

FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/lumiere/dist/public ./public

ENV NODE_ENV=production
ENV PORT=9001
ENV STATIC_DIR=/app/public

EXPOSE 9001

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
