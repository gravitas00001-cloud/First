import logging
import smtplib
import uuid

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.exceptions import ImproperlyConfigured


logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    pass


def build_signup_otp_email(first_name, otp_code):
    app_name = settings.APP_NAME
    recipient_name = first_name or "there"
    expiry_minutes = settings.SIGNUP_OTP_EXPIRY_MINUTES

    subject = f"Your {app_name} verification code"
    text = (
        f"Hi {recipient_name},\n\n"
        f"Your {app_name} verification code is {otp_code}.\n"
        f"It expires in {expiry_minutes} minutes.\n\n"
        "If you did not request this code, you can ignore this email."
    )
    html = f"""
    <div style="font-family: Arial, sans-serif; background: #f5f7fb; padding: 24px;">
      <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; color: #111827;">
        <p style="margin: 0 0 12px; font-size: 16px;">Hi {recipient_name},</p>
        <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6;">
          Use the verification code below to finish creating your {app_name} account.
        </p>
        <div style="margin: 24px 0; padding: 18px 20px; border-radius: 12px; background: #111827; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">
          {otp_code}
        </div>
        <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #4b5563;">
          This code expires in {expiry_minutes} minutes.
        </p>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4b5563;">
          If you did not request this code, you can safely ignore this email.
        </p>
      </div>
    </div>
    """

    return subject, text, html


def smtp_email_is_configured():
    from_email = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER

    return bool(
        settings.EMAIL_HOST
        and settings.EMAIL_PORT
        and settings.EMAIL_HOST_USER
        and settings.EMAIL_HOST_PASSWORD
        and from_email
    )


def send_signup_otp_email_via_console(*, recipient_email, otp_code, subject, text):
    logger.warning(
        "Console OTP delivery fallback for %s: code=%s expires_in=%s_min",
        recipient_email,
        otp_code,
        settings.SIGNUP_OTP_EXPIRY_MINUTES,
    )
    logger.warning("Signup OTP email preview\nSubject: %s\n%s", subject, text)
    return {
        "id": f"console-{uuid.uuid4()}",
        "provider": "console",
    }


def send_signup_otp_email_via_smtp(*, recipient_email, subject, text, html):
    from_email = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER
    reply_to = getattr(settings, "EMAIL_REPLY_TO", "")
    email_message = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=from_email,
        to=[recipient_email],
        reply_to=[reply_to] if reply_to else None,
    )
    email_message.attach_alternative(html, "text/html")

    try:
        email_message.send(fail_silently=False)
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailDeliveryError(
            {
                "message": "Could not send email through SMTP.",
                "detail": str(exc),
            }
        ) from exc

    return {
        "provider": "smtp",
    }


def send_signup_otp_email(*, recipient_email, first_name, otp_code):
    subject, text, html = build_signup_otp_email(first_name, otp_code)
    delivery_mode = str(getattr(settings, "EMAIL_DELIVERY_MODE", "auto")).strip().lower()
    smtp_is_configured = smtp_email_is_configured()
    resend_is_configured = bool(settings.RESEND_API_KEY and settings.RESEND_FROM_EMAIL)

    if delivery_mode not in {"auto", "console", "resend", "smtp"}:
        delivery_mode = "auto"

    if delivery_mode == "auto":
        if smtp_is_configured:
            delivery_mode = "smtp"
        elif resend_is_configured:
            delivery_mode = "resend"
        elif settings.DEBUG:
            delivery_mode = "console"

    if delivery_mode == "console":
        return send_signup_otp_email_via_console(
            recipient_email=recipient_email,
            otp_code=otp_code,
            subject=subject,
            text=text,
        )

    if delivery_mode == "smtp":
        if not smtp_is_configured:
            raise ImproperlyConfigured(
                "SMTP email settings are not fully configured"
            )

        return send_signup_otp_email_via_smtp(
            recipient_email=recipient_email,
            subject=subject,
            text=text,
            html=html,
        )

    if not settings.RESEND_API_KEY:
        raise ImproperlyConfigured("RESEND_API_KEY is not configured")
    if not settings.RESEND_FROM_EMAIL:
        raise ImproperlyConfigured("RESEND_FROM_EMAIL is not configured")

    payload = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": subject,
        "text": text,
        "html": html,
    }
    if settings.RESEND_REPLY_TO:
        payload["reply_to"] = settings.RESEND_REPLY_TO

    try:
        response = requests.post(
            f"{settings.RESEND_API_URL.rstrip('/')}/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
                "Idempotency-Key": str(uuid.uuid4()),
            },
            json=payload,
            timeout=settings.RESEND_REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise EmailDeliveryError(
            {
                "message": "Could not reach the email provider.",
                "detail": str(exc),
            }
        ) from exc

    if response.ok:
        return response.json()

    try:
        payload = response.json()
    except ValueError:
        payload = response.text

    raise EmailDeliveryError(payload)
