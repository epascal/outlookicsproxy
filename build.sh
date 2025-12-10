#!/bin/bash

# Script de build pour Docker Swarm / Portainer
# Usage: ./build.sh [image-name] [--push]

set -e

# Configuration
IMAGE_NAME=${1:-icspatch:latest}
PUSH=false

# Vérifier les arguments
if [ "$2" = "--push" ]; then
    PUSH=true
fi

echo "🔨 Construction de l'image Docker pour ICS Patch"
echo "================================================"
echo "Image name: $IMAGE_NAME"
echo "Push to registry: $PUSH"
echo ""

# Construire l'image
echo "🔨 Construction de l'image Docker..."
docker build -t "$IMAGE_NAME" .

# Vérifier que l'image a été créée
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "❌ Erreur lors de la construction de l'image"
    exit 1
fi

echo "✅ Image construite avec succès!"

# Afficher les informations de l'image
echo ""
echo "📊 Informations de l'image:"
docker image inspect "$IMAGE_NAME" --format "{{.Size}}" | awk '{print "Taille: " $1/1024/1024 " MB"}'
docker image inspect "$IMAGE_NAME" --format "{{.Created}}"

# Push vers le registry si demandé
if [ "$PUSH" = true ]; then
    echo ""
    echo "📤 Push vers le registry..."
    docker push "$IMAGE_NAME"
    echo "✅ Image poussée vers le registry!"
fi

echo ""
echo "📋 Commandes utiles:"
echo "  - Déployer: ./deploy.sh icspatch --no-build"
echo "  - Tester localement: docker run -p 3003:3003 $IMAGE_NAME"
echo "  - Voir les images: docker images | grep icspatch"
echo "  - Supprimer l'image: docker rmi $IMAGE_NAME"


