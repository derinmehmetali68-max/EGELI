FROM node:20-alpine

WORKDIR /app

# Copy root package files first for better layer caching
COPY package*.json ./

# Copy server directory
COPY server/package*.json ./server/
RUN cd server && npm install

# Copy client directory
COPY client/package*.json ./client/
RUN cd client && npm install

# Copy all source code
COPY server ./server
COPY client ./client

# Build frontend
RUN cd client && npm run build

# Create data directory for SQLite
RUN mkdir -p /app/server/data

# Expose port
EXPOSE 5174

# Set environment
ENV NODE_ENV=production
ENV PORT=5174
ENV DB_PATH=/app/server/data/library.db

# Start server
WORKDIR /app/server
CMD ["sh", "-c", "npm run migrate && npm start"]
