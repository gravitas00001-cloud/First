# Gravit

A Django-based authentication and user management system with email verification, Google OAuth integration, and REST API support.

## Features

- Custom user authentication with email verification
- Google OAuth 2.0 integration
- JWT token-based authentication
- Email OTP verification via Resend API
- REST API endpoints
- CORS support for multiple origins
- Production-ready security configurations

## Prerequisites

- Python 3.13+
- pip or pipenv
- Virtual environment

## Local Development Setup

### 1. Clone the repository
```bash
git clone https://github.com/gravitas00001-cloud/Gravit.git
cd Gravit
```

### 2. Create and activate virtual environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure environment variables
Copy the `.env.example` to `.env` and update with your configuration:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```
DEBUG=True
SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=localhost,127.0.0.1
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
EMAIL_DELIVERY_MODE=resend
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=your-email@domain.com
```

### 5. Apply migrations
```bash
python manage.py migrate
```

### 6. Create superuser (optional)
```bash
python manage.py createsuperuser
```

### 7. Run development server
```bash
python manage.py runserver
```

Access at `http://localhost:8000`

## Production Deployment

### Environment Variables Required
- `DEBUG=False`
- `SECRET_KEY` - Generate a secure key
- `ALLOWED_HOSTS` - Your domain names
- `DATABASE_URL` - PostgreSQL database URL (optional, defaults to SQLite)
- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`
- `EMAIL_DELIVERY_MODE` - resend, smtp, or console
- `RESEND_API_KEY` - If using Resend email delivery

### Using Gunicorn
```bash
gunicorn FakeKilo.wsgi:application --bind 0.0.0.0:8000
```

### Using Docker (Optional)
Create a `Dockerfile` and deploy to your container platform.

### Database Migration (Production)
```bash
python manage.py migrate --settings=FakeKilo.settings
```

### Collect Static Files
```bash
python manage.py collectstatic --noinput
```

## API Endpoints

- `GET /api/auth/` - Authentication endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/verify` - Email verification
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh JWT token

## Email Configuration

### Resend (Recommended)
Set `EMAIL_DELIVERY_MODE=resend` and provide `RESEND_API_KEY`

### SMTP (Gmail)
```
EMAIL_DELIVERY_MODE=smtp
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
EMAIL_USE_TLS=True
```

### Console (Development)
`EMAIL_DELIVERY_MODE=console` - Prints emails to console

## Security Considerations

- ✅ `DEBUG=False` in production
- ✅ Secure `SECRET_KEY` generation
- ✅ Environment-based configuration
- ✅ CSRF protection enabled
- ✅ Secure password hashing
- ✅ JWT token authentication
- ✅ CORS protection
- ✅ X-Frame-Options protection

## Troubleshooting

### Port Already in Use
```bash
python manage.py runserver 8001
```

### Database Issues
```bash
python manage.py migrate
python manage.py migrate --run-syncdb
```

### Static Files Not Loading
```bash
python manage.py collectstatic --clear --noinput
```

## Contributing

1. Create a feature branch
2. Commit changes
3. Push to branch
4. Create a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please create an issue on GitHub.
# First
