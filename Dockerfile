FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN cd server && npm install
RUN cd client && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd client && npm run build

# Run migrations
RUN cd server && npm run migrate || true

# Expose port
EXPOSE 5174

# Set environment
ENV NODE_ENV=production
ENV PORT=5174

# Start server
WORKDIR /app/server
CMD ["npm", "start"]

