FROM node:20-alpine

WORKDIR /app
COPY client/package*.json ./
RUN npm install
COPY client/ .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build
RUN npm install -g serve

ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "serve -s dist -l $PORT"]
