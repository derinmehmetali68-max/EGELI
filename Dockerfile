FROM node:20-alpine

WORKDIR /app

# Copy all files first
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/server/data

# Install dependencies
RUN cd server && npm install
RUN cd client && npm install

# Build frontend
RUN cd client && npm run build

# Expose port
EXPOSE 5174

# Set environment
ENV NODE_ENV=production
ENV PORT=5174
ENV DB_PATH=/app/server/data/library.db

# Start server (will run migrate on first start)
WORKDIR /app/server
CMD ["sh", "-c", "npm run migrate && npm run seed && npm start"]
