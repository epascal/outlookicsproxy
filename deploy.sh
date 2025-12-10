#!/bin/bash

# Script de déploiement pour Docker Swarm / Portainer
# Usage: ./deploy.sh [stack-name] [--no-build]

set -e

# Configuration
STACK_NAME=${1:-icspatch}
IMAGE_NAME="icspatch:latest"
COMPOSE_FILE="docker-compose.yml"
NO_BUILD=false

# Vérifier les arguments
if [ "$2" = "--no-build" ]; then
    NO_BUILD=true
fi

echo "🚀 Déploiement de ICS Patch sur Docker Swarm"
echo "=============================================="
echo "Stack name: $STACK_NAME"
echo "Image: $IMAGE_NAME"
echo "Compose file: $COMPOSE_FILE"
echo "Skip build: $NO_BUILD"
echo ""

# Vérifier que Docker Swarm est initialisé
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
    echo "❌ Docker Swarm n'est pas initialisé sur ce nœud"
    echo "💡 Initialisez Docker Swarm avec: docker swarm init"
    exit 1
fi

# Vérifier que le fichier docker-compose.yml existe
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Fichier $COMPOSE_FILE non trouvé"
    exit 1
fi

# Construire l'image (sauf si --no-build est spécifié)
if [ "$NO_BUILD" = false ]; then
    echo "🔨 Construction de l'image Docker..."
    docker build -t "$IMAGE_NAME" .
    
    # Tag pour le registry si nécessaire (optionnel)
    # docker tag "$IMAGE_NAME" "your-registry.com/$IMAGE_NAME"
    # docker push "your-registry.com/$IMAGE_NAME"
else
    echo "⏭️  Construction de l'image ignorée (--no-build)"
fi

# Vérifier que l'image existe
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "❌ Image $IMAGE_NAME non trouvée. Construisez d'abord l'image ou supprimez --no-build"
    exit 1
fi

# Déployer le stack
echo "📦 Déploiement du stack..."
docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME"

# Attendre que le service soit prêt
echo "⏳ Attente du démarrage du service..."
sleep 10

# Vérifier le statut
echo "📊 Statut du service:"
docker service ls --filter name="$STACK_NAME"

echo ""
echo "✅ Déploiement terminé!"
echo "🌐 Service accessible sur: http://localhost:3003/calendar.ics"
echo ""
echo "📋 Commandes utiles:"
echo "  - Voir les logs: docker service logs -f ${STACK_NAME}_icspatch"
echo "  - Voir le statut: docker service ps ${STACK_NAME}_icspatch"
echo "  - Supprimer le stack: docker stack rm $STACK_NAME"
echo "  - Mettre à jour: ./deploy.sh $STACK_NAME"
echo "  - Mettre à jour sans rebuild: ./deploy.sh $STACK_NAME --no-build"
