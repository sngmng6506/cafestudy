FROM node:22-alpine AS deps

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci --ignore-scripts

FROM deps AS build

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
  && if [ ! -e /usr/bin/chromium-browser ] && [ -e /usr/bin/chromium ]; then \
       ln -s /usr/bin/chromium /usr/bin/chromium-browser; \
     fi \
  && echo "chromium resolved at:" && (command -v chromium-browser || command -v chromium || echo "NOT FOUND")

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/src ./src
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts

EXPOSE 3001

CMD ["sh", "-c", "npm run db:migrate && npm start"]
