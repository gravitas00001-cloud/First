import logging
from functools import wraps
from urllib.parse import urlsplit

import requests
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ImproperlyConfigured
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, IntegrityError, transaction
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from google.auth import exceptions as google_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .email_service import EmailDeliveryError, send_signup_otp_email
from .models import CustomUser, PendingSignup

logger = logging.getLogger(__name__)


def normalize_origin(origin):
    if not origin:
        return None

    parsed = urlsplit(origin)
    if not parsed.scheme or not parsed.netloc:
        return None

    return f"{parsed.scheme}://{parsed.netloc}"


def normalize_email_address(email):
    if not email:
        return ""

    return CustomUser.objects.normalize_email(str(email).strip())


def response_payload_or_text(response):
    try:
        return response.json()
    except ValueError:
        return response.text


def serialize_user(user):
    return {
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "registration_method": user.registration_method,
    }


def database_unavailable_response():
    return Response(
        {
            "error": "Database is temporarily unavailable. Please try again shortly.",
            "status": False,
        },
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def database_guard(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        try:
            return view_func(*args, **kwargs)
        except DatabaseError:
            logger.exception("Database operation failed in %s", view_func.__name__)
            return database_unavailable_response()

    return wrapped


def frontend_context():
    frontend_config = {
        "appName": settings.APP_NAME,
        "googleClientId": settings.GOOGLE_OAUTH_CLIENT_ID,
        "signupOtpLength": settings.SIGNUP_OTP_LENGTH,
        "signupOtpExpiryMinutes": settings.SIGNUP_OTP_EXPIRY_MINUTES,
        "signupOtpResendCooldownSeconds": settings.SIGNUP_OTP_RESEND_COOLDOWN_SECONDS,
        "urls": {
            "home": reverse("home"),
            "verify": reverse("verify_page"),
            "dashboard": reverse("dashboard_page"),
            "currentUser": reverse("current_user"),
            "googleLogin": reverse("google_login"),
            "requestSignupOtp": reverse("request_signup_otp"),
            "resendSignupOtp": reverse("resend_signup_otp"),
            "verifySignupOtp": reverse("verify_signup_otp"),
            "tokenObtainPair": reverse("token_obtain_pair"),
            "tokenRefresh": reverse("token_refresh"),
        },
    }

    return {
        "app_name": settings.APP_NAME,
        "google_client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "signup_otp_length": settings.SIGNUP_OTP_LENGTH,
        "signup_otp_expiry_minutes": settings.SIGNUP_OTP_EXPIRY_MINUTES,
        "signup_otp_resend_cooldown_seconds": settings.SIGNUP_OTP_RESEND_COOLDOWN_SECONDS,
        "frontend_config": frontend_config,
    }


def auth_success_response(user):
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "tokens": {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            "user": serialize_user(user),
            "status": True,
        },
        status=status.HTTP_200_OK,
    )


class SafeTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except DatabaseError:
            logger.exception("Database operation failed in token obtain flow")
            return database_unavailable_response()


def signup_conflict_response(user):
    if user.registration_method == "google":
        message = "Account already exists with Google. Use Google sign-in instead."
    else:
        message = "Account already exists. Sign in instead."

    return Response(
        {"error": message, "status": False},
        status=status.HTTP_409_CONFLICT,
    )


def otp_rate_limit_response(pending_signup):
    retry_after = max(
        int(
            (
                pending_signup.resend_available_at
                - timezone.now()
            ).total_seconds()
        ),
        1,
    )

    return Response(
        {
            "error": f"Please wait {retry_after} seconds before requesting another code.",
            "retry_after": retry_after,
            "status": False,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def validate_signup_fields(*, first_name, last_name, email, password):
    errors = {}

    if not first_name:
        errors["first_name"] = "First name is required."
    if not last_name:
        errors["last_name"] = "Last name is required."
    if not email:
        errors["email"] = "Email is required."
    if not password:
        errors["password"] = "Password is required."

    if errors:
        raise DjangoValidationError(errors)

    candidate_user = CustomUser(
        email=email,
        first_name=first_name,
        last_name=last_name,
        registration_method="email",
    )
    validate_password(password, user=candidate_user)


def send_pending_signup_otp(pending_signup):
    otp_code = pending_signup.refresh_otp()
    email_delivery_result = send_signup_otp_email(
        recipient_email=pending_signup.email,
        first_name=pending_signup.first_name,
        otp_code=otp_code,
    )
    pending_signup.save()
    return email_delivery_result


@api_view(["POST"])
@database_guard
def request_signup_otp(request):
    first_name = str(request.data.get("first_name", "")).strip()
    last_name = str(request.data.get("last_name", "")).strip()
    email = normalize_email_address(request.data.get("email"))
    password = str(request.data.get("password", ""))

    try:
        validate_signup_fields(
            first_name=first_name,
            last_name=last_name,
            email=email,
            password=password,
        )
    except DjangoValidationError as exc:
        message_dict = getattr(exc, "message_dict", None)
        detail = message_dict or {"non_field_errors": exc.messages}
        first_error = next(iter(detail.values()))
        if isinstance(first_error, list):
            first_error = first_error[0]

        return Response(
            {
                "error": first_error,
                "errors": detail,
                "status": False,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    existing_user = CustomUser.objects.filter(email=email).first()
    if existing_user:
        return signup_conflict_response(existing_user)

    pending_signup = PendingSignup.objects.filter(email=email).first()
    if pending_signup and not pending_signup.can_resend_otp():
        return otp_rate_limit_response(pending_signup)

    if pending_signup is None:
        pending_signup = PendingSignup(email=email)

    pending_signup.first_name = first_name
    pending_signup.last_name = last_name
    pending_signup.set_password(password)

    try:
        send_pending_signup_otp(pending_signup)
    except ImproperlyConfigured as exc:
        return Response(
            {"error": str(exc), "status": False},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except EmailDeliveryError as exc:
        return Response(
            {
                "error": "Could not send verification code email",
                "provider_error": exc.args[0],
                "status": False,
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    response_payload = {
        "message": "Verification code sent to your email address.",
        "email": email,
        "expires_in_minutes": settings.SIGNUP_OTP_EXPIRY_MINUTES,
        "status": True,
    }

    return Response(
        response_payload,
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@database_guard
def resend_signup_otp(request):
    email = normalize_email_address(request.data.get("email"))
    if not email:
        return Response(
            {"error": "Email is required.", "status": False},
            status=status.HTTP_400_BAD_REQUEST,
        )

    existing_user = CustomUser.objects.filter(email=email).first()
    if existing_user:
        return signup_conflict_response(existing_user)

    pending_signup = PendingSignup.objects.filter(email=email).first()
    if not pending_signup:
        return Response(
            {
                "error": "No pending signup found for that email. Start signup again.",
                "status": False,
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    if not pending_signup.can_resend_otp():
        return otp_rate_limit_response(pending_signup)

    try:
        send_pending_signup_otp(pending_signup)
    except ImproperlyConfigured as exc:
        return Response(
            {"error": str(exc), "status": False},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except EmailDeliveryError as exc:
        return Response(
            {
                "error": "Could not resend verification code email",
                "provider_error": exc.args[0],
                "status": False,
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    response_payload = {
        "message": "A new verification code has been sent.",
        "email": email,
        "expires_in_minutes": settings.SIGNUP_OTP_EXPIRY_MINUTES,
        "status": True,
    }

    return Response(
        response_payload,
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@database_guard
def verify_signup_otp(request):
    email = normalize_email_address(request.data.get("email"))
    otp = str(request.data.get("otp", "")).strip()

    if not email or not otp:
        return Response(
            {"error": "Email and OTP are required.", "status": False},
            status=status.HTTP_400_BAD_REQUEST,
        )

    existing_user = CustomUser.objects.filter(email=email).first()
    if existing_user:
        PendingSignup.objects.filter(email=email).delete()
        return signup_conflict_response(existing_user)

    pending_signup = PendingSignup.objects.filter(email=email).first()
    if not pending_signup:
        return Response(
            {
                "error": "No pending signup found for that email. Start signup again.",
                "status": False,
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    if pending_signup.otp_is_expired:
        return Response(
            {"error": "This verification code has expired. Request a new code.", "status": False},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if pending_signup.otp_attempts_remaining == 0:
        return Response(
            {"error": "Too many incorrect attempts. Request a new code.", "status": False},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    if not pending_signup.check_otp(otp):
        pending_signup.otp_attempts += 1
        pending_signup.save(update_fields=["otp_attempts", "updated_at"])

        if pending_signup.otp_attempts_remaining == 0:
            return Response(
                {"error": "Too many incorrect attempts. Request a new code.", "status": False},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        return Response(
            {
                "error": "Invalid verification code.",
                "attempts_remaining": pending_signup.otp_attempts_remaining,
                "status": False,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            user = CustomUser(
                email=email,
                first_name=pending_signup.first_name,
                last_name=pending_signup.last_name,
                registration_method="email",
                is_active=True,
            )
            user.password = pending_signup.password_hash
            user.save()
            pending_signup.delete()
    except IntegrityError:
        return Response(
            {"error": "Account already exists. Sign in instead.", "status": False},
            status=status.HTTP_409_CONFLICT,
        )

    return auth_success_response(user)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@database_guard
def current_user(request):
    return Response(
        {
            "user": serialize_user(request.user),
            "status": True,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@database_guard
def google_auth(request):
    code = request.data.get("code")
    token = request.data.get("token")
    if not code and not token:
        return Response(
            {"error": "Code or token not provided", "status": False},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        if code:
            redirect_uri = normalize_origin(request.headers.get("Origin"))
            if not redirect_uri:
                return Response(
                    {
                        "error": "Missing valid Origin header. Serve your frontend from http://localhost or http://127.0.0.1 instead of file://",
                        "status": False,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if redirect_uri not in settings.GOOGLE_OAUTH_ALLOWED_ORIGINS:
                return Response(
                    {
                        "error": "Origin is not allowed for Google login",
                        "status": False,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not settings.GOOGLE_OAUTH_CLIENT_SECRET:
                return Response(
                    {
                        "error": "Google OAuth client secret is not configured",
                        "status": False,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            google_response = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                    "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                timeout=10,
            )
            google_response_payload = response_payload_or_text(google_response)

            if not google_response.ok:
                return Response(
                    {
                        "error": "Could not exchange authorization code with Google",
                        "google_error": google_response_payload,
                        "status": False,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not isinstance(google_response_payload, dict):
                return Response(
                    {
                        "error": "Google returned an unexpected token response",
                        "status": False,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            token = google_response_payload.get("id_token")
            if not token:
                return Response(
                    {"error": "Google did not return an ID token", "status": False},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        id_info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )

        email = normalize_email_address(id_info.get("email"))
        if not email:
            return Response(
                {"error": "Google account email was not provided", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not id_info.get("email_verified", False):
            return Response(
                {"error": "Google account email is not verified", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        first_name = id_info.get("given_name", "")
        last_name = id_info.get("family_name", "")

        user, created = CustomUser.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "registration_method": "google",
                "is_active": True,
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        else:
            if user.registration_method != "google":
                return Response(
                    {
                        "error": "User needs to sign in through email",
                        "status": False,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            updated_fields = []
            if user.first_name != first_name:
                user.first_name = first_name
                updated_fields.append("first_name")
            if user.last_name != last_name:
                user.last_name = last_name
                updated_fields.append("last_name")
            if not user.is_active:
                user.is_active = True
                updated_fields.append("is_active")

            if updated_fields:
                user.save(update_fields=updated_fields)

        return auth_success_response(user)

    except ValueError:
        return Response(
            {"error": "Invalid Google token", "status": False},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except google_exceptions.TransportError:
        return Response(
            {"error": "Could not reach Google", "status": False},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except requests.RequestException:
        return Response(
            {"error": "Could not reach Google", "status": False},
            status=status.HTTP_502_BAD_GATEWAY,
        )


def Home(request):
    return render(request, "Core/auth.html", frontend_context())


def verify_page(request):
    return render(request, "Core/verify.html", frontend_context())


def dashboard_page(request):
    return render(request, "Core/dashboard.html", frontend_context())
