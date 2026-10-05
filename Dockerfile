# Build the web console
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY web ./web
RUN npm run build

# Runtime: API, workers and the built console in one process
FROM node:22-alpine
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server/index.js"]
