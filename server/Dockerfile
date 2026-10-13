FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/*.cjs ./
USER node
EXPOSE 3000
CMD ["node", "index.cjs"]
