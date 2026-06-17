FROM mcr.microsoft.com/playwright:v1.53.1-jammy AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.53.1-jammy

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/templates ./templates
COPY --from=build /app/config ./config
COPY --from=build /app/src/db/migrations ./dist/src/db/migrations
EXPOSE 8080
CMD ["node", "dist/src/server.js"]
