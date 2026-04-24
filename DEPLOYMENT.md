# FakeKilo Deployment Guide

This guide covers multiple deployment options for your Django application.

## Quick Summary of Deployment Files

- **Procfile**: Configuration for Heroku deployment
- **runtime.txt**: Specifies Python version for Heroku
- **Dockerfile**: Container image definition
- **.dockerignore**: Excludes files from Docker builds
- **docker-compose.yml**: Local development with PostgreSQL
- **scripts/deploy-heroku.sh**: Automated Heroku setup
- **scripts/deploy-docker.sh**: Docker build and deployment
- **scripts/deploy-digitalocean.sh**: DigitalOcean deployment helper

---

## Option 1: Heroku Deployment (Easiest)

### Prerequisites
- Heroku account (heroku.com)
- Heroku CLI installed

### Deployment Steps

1. **Make the script executable and run it:**
   ```bash
   chmod +x scripts/deploy-heroku.sh
   ./scripts/deploy-heroku.sh
   ```

2. **The script will:**
   - Create a Heroku remote
   - Set up PostgreSQL
   - Configure environment variables
   - Deploy your app
   - Run migrations automatically

3. **Manual Alternative (without script):**
   ```bash
   heroku login
   heroku create your-app-name
   heroku addons:create heroku-postgresql:essential-0
   git push heroku main
   ```

### Post-Deployment
- Set environment variables:
  ```bash
  heroku config:set DEBUG=False
  heroku config:set SECRET_KEY="your-secret-key"
  heroku config:set ALLOWED_HOSTS="your-app-name.herokuapp.com"
  ```

---

## Option 2: Docker & Docker Compose (Local Testing)

### Prerequisites
- Docker installed
- Docker Compose installed

### Local Testing with Docker Compose

1. **Start the development environment:**
   ```bash
   docker-compose up
   ```

2. **First time setup (run migrations):**
   ```bash
   docker-compose exec web python FakeKilo/manage.py migrate
   docker-compose exec web python FakeKilo/manage.py createsuperuser
   ```

3. **Access your app:**
   - Web: http://localhost:8000
   - Admin: http://localhost:8000/admin

### Production Docker Deployment

1. **Build the image:**
   ```bash
   chmod +x scripts/deploy-docker.sh
   ./scripts/deploy-docker.sh
   ```

2. **Run the container:**
   ```bash
   docker run -p 8000:8000 \
     --env-file .env \
     fakekilo:latest
   ```

---

## Option 3: DigitalOcean App Platform (Managed)

### Easiest Production Option

1. **Run the helper script:**
   ```bash
   chmod +x scripts/deploy-digitalocean.sh
   ./scripts/deploy-digitalocean.sh
   ```

2. **Follow the App Platform setup:**
   - Connect your GitHub repository
   - Configure environment variables
   - Deploy with one click
   - Automatic HTTPS

---

## Option 4: DigitalOcean Droplet (Full Control)

### Manual Setup on Droplet

1. **Connect to your Droplet:**
   ```bash
   ssh root@your_droplet_ip
   ```

2. **Install system dependencies:**
   ```bash
   apt update && apt install -y \
     python3.13 \
     python3-pip \
     postgresql \
     nginx \
     git \
     certbot \
     python3-certbot-nginx
   ```

3. **Clone and setup your project:**
   ```bash
   cd /var
   git clone https://github.com/gravitas00001-cloud/First.git
   cd First
   python3.13 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. **Setup PostgreSQL:**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE fakekilo;
   CREATE USER fakekilouser WITH PASSWORD 'strong_password';
   GRANT ALL PRIVILEGES ON DATABASE fakekilo TO fakekilouser;
   ```

5. **Create systemd service** (`/etc/systemd/system/fakekilo.service`):
   ```ini
   [Unit]
   Description=FakeKilo Django Application
   After=network.target
   
   [Service]
   User=www-data
   Group=www-data
   WorkingDirectory=/var/First
   ExecStart=/var/First/venv/bin/gunicorn \
     FakeKilo.wsgi:application \
     --bind 127.0.0.1:8000 \
     --workers 4 \
     --worker-class sync
   
   [Install]
   WantedBy=multi-user.target
   ```

6. **Configure Nginx** (`/etc/nginx/sites-available/default`):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       
       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
       
       location /static/ {
           alias /var/First/staticfiles/;
       }
   }
   ```

7. **Enable and start services:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable fakekilo
   sudo systemctl start fakekilo
   sudo systemctl restart nginx
   ```

8. **Setup SSL with Certbot:**
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

---

## Environment Variables Checklist

### Required for Production
- `DEBUG=False`
- `SECRET_KEY` (generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`)
- `ALLOWED_HOSTS` (your domain)
- `DATABASE_URL` (PostgreSQL connection string)

### Security Settings
- `SECURE_SSL_REDIRECT=True`
- `SESSION_COOKIE_SECURE=True`
- `CSRF_COOKIE_SECURE=True`
- `SECURE_HSTS_SECONDS=31536000`

### Email Configuration
- `EMAIL_DELIVERY_MODE=resend` (or `smtp`)
- `RESEND_API_KEY=re_...`
- `RESEND_FROM_EMAIL=your-domain.com`

### OAuth
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

---

## Recommended Deployment Path

**For Beginners:** Heroku (simplest, free tier available)  
**For Production:** DigitalOcean App Platform (managed) or Droplet (full control)  
**For Development:** Docker Compose (local testing)

---

## Troubleshooting

### 502 Bad Gateway
- Check if gunicorn is running
- Check logs: `heroku logs --tail` or `docker logs <container_id>`

### Static Files Not Loading
- Run: `python FakeKilo/manage.py collectstatic`
- Ensure Nginx is configured correctly

### Database Connection Issues
- Verify `DATABASE_URL` format
- Check database user permissions
- Ensure PostgreSQL is running

### Email Not Sending
- Verify `RESEND_API_KEY` is correct
- Check email logs in Resend dashboard
- Ensure `EMAIL_DELIVERY_MODE=resend` is set

---

## Security Reminders

⚠️ **Before Going Live:**
- [ ] Set `DEBUG=False` in production
- [ ] Generate a new `SECRET_KEY`
- [ ] Use strong database passwords
- [ ] Enable HTTPS/SSL
- [ ] Set secure cookie flags
- [ ] Configure CORS properly
- [ ] Use environment variables for all secrets
- [ ] Never commit `.env` to git
- [ ] Enable HSTS headers

---

## Additional Resources

- [Django Deployment Checklist](https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/)
- [Heroku Django Documentation](https://devcenter.heroku.com/articles/deploying-python)
- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
