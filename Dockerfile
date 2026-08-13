# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Setup the backend Express server
FROM node:20-alpine
WORKDIR /app

# Copy server package configuration and install dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server code
COPY server/ ./server/

# Copy the built frontend static files from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Copy the base CSV file as a fallback
COPY "base_dashboard.csv" "/app/base_dashboard.csv"

ENV CSV_PATH="/app/base_dashboard.csv"
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--max-old-space-size=460", "server/server.js"]
