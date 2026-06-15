FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY . .
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
