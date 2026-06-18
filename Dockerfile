FROM mcr.microsoft.com/playwright:v1.61.0-jammy AS build

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/templates ./templates
COPY --from=build /app/config ./config
COPY --from=build /app/src/db/migrations ./dist/src/db/migrations
EXPOSE 8080
CMD ["node", "dist/src/server.js"]
