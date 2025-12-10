#!/bin/bash

# Build script for Docker Swarm / Portainer
# Usage: ./build.sh [image-name] [--push]

set -e

# Configuration
IMAGE_NAME=${1:-outlookicsproxy:latest}
PUSH=false

# Check arguments
if [ "$2" = "--push" ]; then
    PUSH=true
fi

echo "🔨 Building Docker image for Outlook ICS Proxy"
echo "=============================================="
echo "Image name: $IMAGE_NAME"
echo "Push to registry: $PUSH"
echo ""

# Build the image
echo "🔨 Building Docker image..."
docker build -t "$IMAGE_NAME" .

# Verify that the image was created
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "❌ Error building the image"
    exit 1
fi

echo "✅ Image built successfully!"

# Display image information
echo ""
echo "📊 Image information:"
docker image inspect "$IMAGE_NAME" --format "{{.Size}}" | awk '{print "Size: " $1/1024/1024 " MB"}'
docker image inspect "$IMAGE_NAME" --format "{{.Created}}"

# Push to registry if requested
if [ "$PUSH" = true ]; then
    echo ""
    echo "📤 Pushing to registry..."
    docker push "$IMAGE_NAME"
    echo "✅ Image pushed to registry!"
fi

echo ""
echo "📋 Useful commands:"
echo "  - Deploy: ./deploy.sh outlookicsproxy --no-build"
echo "  - Test locally: docker run -p 3003:3003 $IMAGE_NAME"
echo "  - View images: docker images | grep outlookicsproxy"
echo "  - Remove image: docker rmi $IMAGE_NAME"


