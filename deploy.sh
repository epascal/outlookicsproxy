#!/bin/bash

# Deployment script for Docker Swarm / Portainer
# Usage: ./deploy.sh [stack-name] [--no-build]

set -e

# Configuration
STACK_NAME=${1:-calendar}
IMAGE_NAME="outlookicsproxy:latest"
COMPOSE_FILE="docker-compose.yml"
NO_BUILD=false

# Check arguments
if [ "$2" = "--no-build" ]; then
    NO_BUILD=true
fi

echo "🚀 Deploying Outlook ICS Proxy on Docker Swarm"
echo "==============================================="
echo "Stack name: $STACK_NAME"
echo "Image: $IMAGE_NAME"
echo "Compose file: $COMPOSE_FILE"
echo "Skip build: $NO_BUILD"
echo ""

# Verify that Docker Swarm is initialized
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
    echo "❌ Docker Swarm is not initialized on this node"
    echo "💡 Initialize Docker Swarm with: docker swarm init"
    exit 1
fi

# Verify that docker-compose.yml file exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ File $COMPOSE_FILE not found"
    exit 1
fi

# Build the image (unless --no-build is specified)
if [ "$NO_BUILD" = false ]; then
    echo "🔨 Building Docker image..."
    docker build -t "$IMAGE_NAME" .
    
    # Tag for registry if needed (optional)
    # docker tag "$IMAGE_NAME" "your-registry.com/$IMAGE_NAME"
    # docker push "your-registry.com/$IMAGE_NAME"
else
    echo "⏭️  Image build skipped (--no-build)"
fi

# Verify that the image exists
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "❌ Image $IMAGE_NAME not found. Build the image first or remove --no-build"
    exit 1
fi

# Deploy the stack
echo "📦 Deploying stack..."
docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME"

# Wait for the service to be ready
echo "⏳ Waiting for service to start..."
sleep 10

# Check status
echo "📊 Service status:"
docker service ls --filter name="$STACK_NAME"

echo ""
echo "✅ Deployment completed!"
echo "🌐 Service accessible at: http://localhost:3003/calendar.ics"
echo ""
echo "📋 Useful commands:"
echo "  - View logs: docker service logs -f ${STACK_NAME}_outlookicsproxy"
echo "  - View status: docker service ps ${STACK_NAME}_outlookicsproxy"
echo "  - Remove stack: docker stack rm $STACK_NAME"
echo "  - Update: ./deploy.sh $STACK_NAME"
echo "  - Update without rebuild: ./deploy.sh $STACK_NAME --no-build"
