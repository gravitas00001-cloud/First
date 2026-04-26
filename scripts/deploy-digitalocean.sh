#!/bin/bash

# DigitalOcean Deployment Script
# This script helps deploy to DigitalOcean App Platform or Droplet

set -e

echo "🌊 DigitalOcean Deployment Helper"
echo ""
echo "Choose deployment method:"
echo "1) App Platform (managed, recommended)"
echo "2) Droplet (VPS, more control)"
read -p "Select option (1 or 2): " CHOICE

if [ "$CHOICE" = "1" ]; then
    echo "🚀 Setting up DigitalOcean App Platform deployment..."
    echo ""
    echo "1. Push your code to GitHub"
    echo "2. Go to https://cloud.digitalocean.com/apps"
    echo "3. Click 'Create App'"
    echo "4. Select your GitHub repository"
    echo "5. Configure environment variables:"
    echo "   - DEBUG=False"
    echo "   - SECURE_SSL_REDIRECT=True"
    echo "   - DATABASE_URL (from PostgreSQL cluster)"
    echo "   - SECRET_KEY"
    echo "   - ALLOWED_HOSTS"
    echo "   - EMAIL_DELIVERY_MODE=resend"
    echo "   - RESEND_API_KEY"
    echo "   - GOOGLE_OAUTH_CLIENT_ID"
    echo "   - GOOGLE_OAUTH_CLIENT_SECRET"
    echo ""
    echo "6. Set build command: pip install -r requirements.txt"
    echo "7. Set run command: gunicorn --chdir FakeKilo FakeKilo.wsgi:application --bind 0.0.0.0:8080"
    echo "8. Click 'Create App'"

elif [ "$CHOICE" = "2" ]; then
    echo "🖥️  Setting up Droplet deployment..."
    echo ""
    read -p "Enter Droplet IP address: " DROPLET_IP
    
    echo "📝 SSH setup instructions:"
    echo "1. SSH into your Droplet:"
    echo "   ssh root@$DROPLET_IP"
    echo ""
    echo "2. Install dependencies:"
    echo "   apt update && apt install -y python3.13 python3-pip postgresql nginx certbot python3-certbot-nginx"
    echo ""
    echo "3. Clone your repository:"
    echo "   cd /var && git clone https://github.com/gravitas00001-cloud/First.git"
    echo "   cd First"
    echo ""
    echo "4. Create virtual environment:"
    echo "   python3.13 -m venv venv"
    echo "   source venv/bin/activate"
    echo ""
    echo "5. Install Python packages:"
    echo "   pip install -r requirements.txt"
    echo ""
    echo "6. Create .env file with production settings"
    echo ""
    echo "7. Run migrations:"
    echo "   python FakeKilo/manage.py migrate"
    echo ""
    echo "8. Collect static files:"
    echo "   python FakeKilo/manage.py collectstatic"
    echo ""
    echo "9. Set up systemd service:"
    echo "   sudo nano /etc/systemd/system/fakekilo.service"
    echo "   (Copy gunicorn service file from README)"
    echo ""
    echo "10. Set up Nginx reverse proxy"
    echo "11. Set up SSL with Certbot"
    echo "12. Start services and enable on boot"
else
    echo "❌ Invalid option"
    exit 1
fi

echo ""
echo "ℹ️ For detailed instructions, check the README.md"
