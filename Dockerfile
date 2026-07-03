# jmzops (JmZOps) — Express + MySQL status page application
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install

COPY backend ./backend
COPY frontend ./frontend

RUN addgroup -S app && adduser -S app -G app
USER app

ENV PORT=3000
EXPOSE 3000

CMD ["node", "backend/server.js"]
