FROM node:22-alpine AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY examples/checkout-nextjs-app ./examples/checkout-nextjs-app
RUN npm ci
RUN npx tsc -b --force packages/core packages/next packages/js \
  && npm --workspace examples/checkout-nextjs-app run build

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/examples/checkout-nextjs-app ./examples/checkout-nextjs-app
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["npm", "--workspace", "examples/checkout-nextjs-app", "run", "start", "--", "--hostname", "0.0.0.0"]
