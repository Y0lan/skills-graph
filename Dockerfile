FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build
RUN useradd -r -u 999 -s /bin/sh appuser && chown -R appuser:appuser /app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
