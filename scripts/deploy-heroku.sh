#!/bin/bash

# Heroku Deployment Script
# This script sets up and deploys your Django app to Heroku

set -e

echo "🚀 Starting Heroku deployment..."

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI not found. Please install it first."
    echo "   Visit: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Get app name
read -p "Enter your Heroku app name: " APP_NAME

if [ -z "$APP_NAME" ]; then
    echo "❌ App name is required"
    exit 1
fi

echo "📦 Setting up remote..."
heroku git:remote -a "$APP_NAME" 2>/dev/null || true

echo "🔐 Setting environment variables..."
heroku config:set \
    DEBUG=False \
    SECURE_SSL_REDIRECT=True \
    SESSION_COOKIE_SECURE=True \
    CSRF_COOKIE_SECURE=True \
    -a "$APP_NAME"

echo "⚙️ Setting up PostgreSQL addon..."
heroku addons:create heroku-postgresql:essential-0 --app "$APP_NAME" 2>/dev/null || echo "PostgreSQL already attached"

echo "🔑 Set your SECRET_KEY (generate one):"
read -p "Enter SECRET_KEY: " SECRET_KEY
heroku config:set SECRET_KEY="$SECRET_KEY" -a "$APP_NAME"

echo "🌐 Enter your domain (e.g., myapp.herokuapp.com):"
read -p "Domain: " DOMAIN
heroku config:set ALLOWED_HOSTS="$DOMAIN" -a "$APP_NAME"

echo "📧 Configure email settings:"
read -p "Email delivery mode (resend/smtp): " EMAIL_MODE
heroku config:set EMAIL_DELIVERY_MODE="$EMAIL_MODE" -a "$APP_NAME"

if [ "$EMAIL_MODE" = "resend" ]; then
    read -p "RESEND_API_KEY: " RESEND_KEY
    heroku config:set RESEND_API_KEY="$RESEND_KEY" -a "$APP_NAME"
fi

echo "🔐 Setting Google OAuth credentials:"
read -p "GOOGLE_OAUTH_CLIENT_ID: " GOOGLE_ID
read -p "GOOGLE_OAUTH_CLIENT_SECRET: " GOOGLE_SECRET
heroku config:set \
    GOOGLE_OAUTH_CLIENT_ID="$GOOGLE_ID" \
    GOOGLE_OAUTH_CLIENT_SECRET="$GOOGLE_SECRET" \
    -a "$APP_NAME"

echo "🚀 Pushing to Heroku..."
git push heroku main

echo "✅ Deployment complete!"
echo "Your app is available at: https://$DOMAIN"
