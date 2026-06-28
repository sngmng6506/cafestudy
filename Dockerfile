FROM node:22-alpine AS deps

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/src ./src
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts

EXPOSE 3000

CMD ["npm", "start"]
