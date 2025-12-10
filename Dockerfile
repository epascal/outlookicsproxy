# Image optimisée pour Node.js 22.20.0 avec support TypeScript natif
FROM node:22.20.0-alpine

# Installer dumb-init pour une meilleure gestion des signaux
RUN apk add --no-cache dumb-init

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S icspatch -u 1001

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer toutes les dépendances (production + dev pour ts-node)
RUN npm ci && npm cache clean --force

# Copier le code source
COPY . .

# Changer la propriété des fichiers vers l'utilisateur non-root
RUN chown -R icspatch:nodejs /app

# Passer à l'utilisateur non-root
USER icspatch

# Exposer le port
EXPOSE 3003

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3003
ENV TARGET_TZ=Europe/Zurich

# Utiliser dumb-init comme PID 1
ENTRYPOINT ["dumb-init", "--"]

# Commande par défaut (Node.js 22.20.0 supporte TypeScript nativement)
CMD ["node", "--loader", "ts-node/esm", "server.ts"]

# Labels pour Docker Swarm et Portainer
LABEL maintainer="icspatch"
LABEL description="ICS Timezone Proxy Server"
LABEL version="1.0.0"
