from datetime import timedelta
from unittest.mock import patch

import requests

from django.test import TestCase
from django.test.utils import override_settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from .email_service import EmailDeliveryError, send_signup_otp_email
from .models import CustomUser, PendingSignup


class FrontendPageTests(TestCase):
    def test_home_renders_auth_page(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Sign in to continue")
        self.assertContains(response, "Create your account")

    def test_verify_page_renders(self):
        response = self.client.get("/verify/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Confirm your code")

    def test_dashboard_page_renders(self):
        response = self.client.get("/dashboard/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Loading your dashboard...")


class GoogleAuthTests(TestCase):

    def test_google_login_requires_code_or_token(self):
        response = self.client.post("/google_login/", {})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"error": "Code or token not provided", "status": False},
        )

    def test_google_login_rejects_unknown_origin_for_code_flow(self):
        response = self.client.post(
            "/google_login/",
            {"code": "sample-code"},
            HTTP_ORIGIN="http://evil.test",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"error": "Origin is not allowed for Google login", "status": False},
        )

    def test_google_login_options_sets_cors_headers_for_allowed_origin(self):
        origin = "http://127.0.0.1:5500"
        response = self.client.options(
            "/google_login/",
            **{
                "HTTP_ORIGIN": origin,
                "HTTP_ACCESS_CONTROL_REQUEST_METHOD": "POST",
                "HTTP_ACCESS_CONTROL_REQUEST_HEADERS": "X-Requested-With",
            },
        )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response["Access-Control-Allow-Origin"], origin)
        self.assertIn("X-Requested-With", response["Access-Control-Allow-Headers"])
        self.assertEqual(response["Access-Control-Allow-Methods"], "GET, POST, OPTIONS")

    @patch("Core.views.id_token.verify_oauth2_token")
    def test_google_token_login_creates_active_google_user(self, verify_oauth2_token):
        verify_oauth2_token.return_value = {
            "email": "ada@example.com",
            "given_name": "Ada",
            "family_name": "Lovelace",
            "email_verified": True,
        }

        response = self.client.post("/google_login/", {"token": "signed-google-token"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["status"])
        self.assertIn("access", payload["tokens"])
        self.assertIn("refresh", payload["tokens"])

        user = CustomUser.objects.get(email="ada@example.com")
        self.assertEqual(user.registration_method, "google")
        self.assertTrue(user.is_active)
        self.assertFalse(user.has_usable_password())

    @patch("Core.views.id_token.verify_oauth2_token")
    def test_google_token_login_rejects_existing_email_account(self, verify_oauth2_token):
        CustomUser.objects.create_user(email="ada@example.com", password="secret123")
        verify_oauth2_token.return_value = {
            "email": "ada@example.com",
            "given_name": "Ada",
            "family_name": "Lovelace",
            "email_verified": True,
        }

        response = self.client.post("/google_login/", {"token": "signed-google-token"})

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {"error": "User needs to sign in through email", "status": False},
        )

    @patch("Core.views.id_token.verify_oauth2_token")
    def test_google_token_login_requires_verified_email(self, verify_oauth2_token):
        verify_oauth2_token.return_value = {
            "email": "ada@example.com",
            "given_name": "Ada",
            "family_name": "Lovelace",
            "email_verified": False,
        }

        response = self.client.post("/google_login/", {"token": "signed-google-token"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {"error": "Google account email is not verified", "status": False},
        )


class CurrentUserApiTests(TestCase):
    def test_current_user_requires_authentication(self):
        response = self.client.get("/api/me/")

        self.assertEqual(response.status_code, 401)

    def test_current_user_returns_authenticated_user(self):
        user = CustomUser.objects.create_user(
            email="ada@example.com",
            password="secret123",
            first_name="Ada",
            last_name="Lovelace",
            registration_method="email",
            is_active=True,
        )
        access_token = str(RefreshToken.for_user(user).access_token)

        response = self.client.get(
            "/api/me/",
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "user": {
                    "email": "ada@example.com",
                    "first_name": "Ada",
                    "last_name": "Lovelace",
                    "registration_method": "email",
                },
                "status": True,
            },
        )


class SignupOtpTests(TestCase):
    def create_pending_signup(self, email="grace@example.com", password="StrongPass!123"):
        pending_signup = PendingSignup(
            first_name="Grace",
            last_name="Hopper",
            email=email,
        )
        pending_signup.set_password(password)
        otp_code = pending_signup.refresh_otp()
        pending_signup.save()
        return pending_signup, otp_code

    @patch("Core.views.send_signup_otp_email")
    def test_request_signup_otp_creates_pending_signup_and_sends_email(self, send_signup_otp_email):
        response = self.client.post(
            "/signup/request_otp/",
            {
                "first_name": "Grace",
                "last_name": "Hopper",
                "email": "grace@example.com",
                "password": "StrongPass!123",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "message": "Verification code sent to your email address.",
                "email": "grace@example.com",
                "expires_in_minutes": 10,
                "status": True,
            },
        )
        send_signup_otp_email.assert_called_once()

        pending_signup = PendingSignup.objects.get(email="grace@example.com")
        self.assertEqual(pending_signup.first_name, "Grace")
        self.assertEqual(pending_signup.last_name, "Hopper")
        self.assertTrue(pending_signup.password_hash)
        self.assertTrue(pending_signup.otp_hash)
        self.assertIsNotNone(pending_signup.otp_last_sent_at)

    @override_settings(
        DEBUG=True,
        EMAIL_DELIVERY_MODE="auto",
        RESEND_API_KEY="",
        RESEND_FROM_EMAIL="",
    )
    def test_request_signup_otp_uses_console_fallback_in_debug(self):
        response = self.client.post(
            "/signup/request_otp/",
            {
                "first_name": "Grace",
                "last_name": "Hopper",
                "email": "grace@example.com",
                "password": "StrongPass!123",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["status"])
        self.assertEqual(payload["email"], "grace@example.com")
        self.assertNotIn("debug_otp", payload)

    @patch("Core.views.send_signup_otp_email")
    def test_request_signup_otp_enforces_resend_cooldown(self, send_signup_otp_email):
        pending_signup, _ = self.create_pending_signup()

        response = self.client.post(
            "/signup/request_otp/",
            {
                "first_name": pending_signup.first_name,
                "last_name": pending_signup.last_name,
                "email": pending_signup.email,
                "password": "StrongPass!123",
            },
        )

        self.assertEqual(response.status_code, 429)
        payload = response.json()
        self.assertFalse(payload["status"])
        self.assertIn("Please wait", payload["error"])
        self.assertGreaterEqual(payload["retry_after"], 1)
        self.assertLessEqual(payload["retry_after"], 60)
        send_signup_otp_email.assert_not_called()

    @patch("Core.views.send_signup_otp_email")
    def test_resend_signup_otp_refreshes_code_after_cooldown(self, send_signup_otp_email):
        pending_signup, _ = self.create_pending_signup()
        previous_otp_hash = pending_signup.otp_hash

        PendingSignup.objects.filter(pk=pending_signup.pk).update(
            otp_last_sent_at=timezone.now() - timedelta(seconds=61)
        )

        response = self.client.post(
            "/signup/resend_otp/",
            {"email": pending_signup.email},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "message": "A new verification code has been sent.",
                "email": pending_signup.email,
                "expires_in_minutes": 10,
                "status": True,
            },
        )
        send_signup_otp_email.assert_called_once()

        pending_signup.refresh_from_db()
        self.assertNotEqual(pending_signup.otp_hash, previous_otp_hash)

    def test_verify_signup_otp_creates_user_and_removes_pending_signup(self):
        pending_signup, otp_code = self.create_pending_signup()

        response = self.client.post(
            "/signup/verify_otp/",
            {"email": pending_signup.email, "otp": otp_code},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["status"])
        self.assertEqual(payload["user"]["email"], pending_signup.email)
        self.assertIn("access", payload["tokens"])
        self.assertIn("refresh", payload["tokens"])

        user = CustomUser.objects.get(email=pending_signup.email)
        self.assertEqual(user.registration_method, "email")
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password("StrongPass!123"))
        self.assertFalse(PendingSignup.objects.filter(email=pending_signup.email).exists())

    def test_verify_signup_otp_rejects_invalid_code_and_tracks_attempts(self):
        pending_signup, _ = self.create_pending_signup()

        response = self.client.post(
            "/signup/verify_otp/",
            {"email": pending_signup.email, "otp": "000000"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(),
            {
                "error": "Invalid verification code.",
                "attempts_remaining": 4,
                "status": False,
            },
        )

        pending_signup.refresh_from_db()
        self.assertEqual(pending_signup.otp_attempts, 1)

    @patch("Core.views.send_signup_otp_email", side_effect=EmailDeliveryError("provider down"))
    def test_request_signup_otp_returns_502_when_email_delivery_fails(self, _send_signup_otp_email):
        response = self.client.post(
            "/signup/request_otp/",
            {
                "first_name": "Grace",
                "last_name": "Hopper",
                "email": "grace@example.com",
                "password": "StrongPass!123",
            },
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {
                "error": "Could not send verification code email",
                "provider_error": "provider down",
                "status": False,
            },
        )
        self.assertFalse(PendingSignup.objects.filter(email="grace@example.com").exists())


class EmailServiceTests(TestCase):
    @override_settings(
        DEBUG=True,
        EMAIL_DELIVERY_MODE="auto",
        RESEND_API_KEY="",
        RESEND_FROM_EMAIL="",
    )
    def test_send_signup_otp_email_uses_console_fallback_in_debug(self):
        payload = send_signup_otp_email(
            recipient_email="grace@example.com",
            first_name="Grace",
            otp_code="123456",
        )

        self.assertEqual(payload["provider"], "console")

    @override_settings(
        EMAIL_DELIVERY_MODE="smtp",
        EMAIL_HOST="smtp.gmail.com",
        EMAIL_PORT=587,
        EMAIL_HOST_USER="sender@example.com",
        EMAIL_HOST_PASSWORD="app-password",
        DEFAULT_FROM_EMAIL="sender@example.com",
        EMAIL_REPLY_TO="support@example.com",
    )
    @patch("Core.email_service.EmailMultiAlternatives")
    def test_send_signup_otp_email_uses_smtp_delivery(self, email_multi_alternatives):
        email_message = email_multi_alternatives.return_value

        payload = send_signup_otp_email(
            recipient_email="grace@example.com",
            first_name="Grace",
            otp_code="123456",
        )

        self.assertEqual(payload["provider"], "smtp")
        email_multi_alternatives.assert_called_once_with(
            subject="Your FakeKilo verification code",
            body=(
                "Hi Grace,\n\n"
                "Your FakeKilo verification code is 123456.\n"
                "It expires in 10 minutes.\n\n"
                "If you did not request this code, you can ignore this email."
            ),
            from_email="sender@example.com",
            to=["grace@example.com"],
            reply_to=["support@example.com"],
        )
        email_message.attach_alternative.assert_called_once()
        email_message.send.assert_called_once_with(fail_silently=False)

    @override_settings(
        EMAIL_DELIVERY_MODE="resend",
        RESEND_API_KEY="resend-key",
        RESEND_FROM_EMAIL="noreply@example.com",
        RESEND_API_URL="https://api.resend.com",
        RESEND_REQUEST_TIMEOUT_SECONDS=5,
    )
    @patch("Core.email_service.requests.post", side_effect=requests.RequestException("timeout"))
    def test_send_signup_otp_email_wraps_request_failures(self, _requests_post):
        with self.assertRaises(EmailDeliveryError) as exc:
            send_signup_otp_email(
                recipient_email="grace@example.com",
                first_name="Grace",
                otp_code="123456",
            )

        self.assertEqual(
            exc.exception.args[0],
            {
                "message": "Could not reach the email provider.",
                "detail": "timeout",
            },
        )
