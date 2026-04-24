#!/bin/bash

# Docker Deployment Script
# This script builds and runs the Docker container

set -e

echo "🐳 Docker Deployment Script"

# Build the Docker image
echo "📦 Building Docker image..."
docker build -t fakekilo:latest .

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  No .env file found. Using defaults."
fi

# Run migrations
echo "🗄️ Running migrations..."
docker run --rm \
    --env-file .env \
    fakekilo:latest \
    python FakeKilo/manage.py migrate

# Collect static files
echo "📁 Collecting static files..."
docker run --rm \
    -v fakekilo-static:/app/staticfiles \
    --env-file .env \
    fakekilo:latest \
    python FakeKilo/manage.py collectstatic --noinput

echo "✅ Docker image ready!"
echo ""
echo "To run the container:"
echo "  docker run -p 8000:8000 --env-file .env fakekilo:latest"
echo ""
echo "Or use docker-compose:"
echo "  docker-compose up"
