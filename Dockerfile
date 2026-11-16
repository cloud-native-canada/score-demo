FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server ./server

USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
