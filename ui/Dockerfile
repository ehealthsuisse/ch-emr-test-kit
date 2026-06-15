# Build the custom per-IG profile CRUD SPA, then serve it from nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# A valid placeholder so `nginx -t` passes before the entrypoint regenerates it.
RUN printf 'resolver 127.0.0.11 valid=10s ipv6=off;\n' > /etc/nginx/resolver.conf
COPY docker-entrypoint.d/10-resolver.sh /docker-entrypoint.d/10-resolver.sh
RUN chmod +x /docker-entrypoint.d/10-resolver.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
