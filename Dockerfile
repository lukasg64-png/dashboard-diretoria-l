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

# Copy the base Excel file as a fallback
COPY "base Dashboard.xlsx" "/app/base Dashboard.xlsx"

ENV EXCEL_PATH="/app/base Dashboard.xlsx"
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server/server.js"]
