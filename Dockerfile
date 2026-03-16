FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build
RUN useradd -r -u 999 -s /bin/false appuser && chown -R appuser:appuser /app
USER appuser
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--env-file-if-exists=.env", "dist-server/server/index.js"]
