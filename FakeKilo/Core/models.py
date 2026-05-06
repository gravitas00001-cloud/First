from django.contrib.auth.models import BaseUserManager, AbstractBaseUser, PermissionsMixin
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone
import secrets
from datetime import timedelta


REGISTRATION_CHOICES = [
    ('email', 'Email'),
    ('google', 'Google')
]


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email Field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        
        return self.create_user(email, password,  **extra_fields)
    
class CustomUser(AbstractBaseUser, PermissionsMixin):
    first_name = models.CharField(max_length=30, default='', null=True, blank=True, help_text="The User's First Name.")
    last_name = models.CharField(max_length=30, default='', null=True, blank=True, help_text="The User's Last Name.")
    username = models.CharField(
        max_length=30,
        unique=True,
        null=True,
        blank=True,
        default=None,
        help_text="The User's Unique Username.",
    )

    registration_method = models.CharField(max_length=20, choices=REGISTRATION_CHOICES, default='email')

    email = models.EmailField(unique=True, help_text="The User's Unique Email Address.")
    is_active = models.BooleanField(default=False, help_text="Indicates whether the User Account is Active") 
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False, help_text="Indicates whether the User has all Admin Permission")
    date_joined = models.DateTimeField(auto_now_add=True, help_text="The Date and Time when user Joined.")
    password_changed_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.email
    
    objects = CustomUserManager()

    USERNAME_FIELD = 'email'


    def get_full_name(self):
        return f"{self.first_name} {self.last_name}"

    def set_password(self, raw_password):
        super().set_password(raw_password)
        self.password_changed_at = timezone.now()


class PendingSignup(models.Model):
    first_name = models.CharField(max_length=30)
    last_name = models.CharField(max_length=30)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=128)
    otp_hash = models.CharField(max_length=128)
    otp_expires_at = models.DateTimeField()
    otp_last_sent_at = models.DateTimeField(null=True, blank=True)
    otp_attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.email

    @property
    def otp_is_expired(self):
        return timezone.now() >= self.otp_expires_at

    @property
    def otp_attempts_remaining(self):
        return max(settings.SIGNUP_OTP_MAX_ATTEMPTS - self.otp_attempts, 0)

    @property
    def resend_available_at(self):
        if not self.otp_last_sent_at:
            return timezone.now()

        return self.otp_last_sent_at + timedelta(
            seconds=settings.SIGNUP_OTP_RESEND_COOLDOWN_SECONDS
        )

    def can_resend_otp(self):
        return timezone.now() >= self.resend_available_at

    def refresh_otp(self):
        otp_length = max(settings.SIGNUP_OTP_LENGTH, 4)
        otp = "".join(secrets.choice("0123456789") for _ in range(otp_length))
        now = timezone.now()

        self.otp_hash = make_password(otp)
        self.otp_expires_at = now + timedelta(minutes=settings.SIGNUP_OTP_EXPIRY_MINUTES)
        self.otp_last_sent_at = now
        self.otp_attempts = 0
        return otp

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)

    def check_otp(self, raw_otp):
        return check_password(raw_otp, self.otp_hash)


class PasswordResetThrottle(models.Model):
    email_fingerprint = models.CharField(max_length=64, unique=True)
    last_sent_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    @property
    def resend_available_at(self):
        return self.last_sent_at + timedelta(
            seconds=settings.PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS
        )

    def can_send(self):
        return timezone.now() >= self.resend_available_at


class PendingPasswordReset(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pending_password_resets",
    )
    email = models.EmailField(unique=True)
    otp_hash = models.CharField(max_length=128)
    otp_expires_at = models.DateTimeField()
    otp_last_sent_at = models.DateTimeField(null=True, blank=True)
    otp_attempts = models.PositiveSmallIntegerField(default=0)
    reset_token_hash = models.CharField(max_length=128, blank=True)
    reset_token_expires_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.email

    @property
    def otp_is_expired(self):
        return timezone.now() >= self.otp_expires_at

    @property
    def otp_attempts_remaining(self):
        return max(settings.PASSWORD_RESET_OTP_MAX_ATTEMPTS - self.otp_attempts, 0)

    @property
    def resend_available_at(self):
        if not self.otp_last_sent_at:
            return timezone.now()

        return self.otp_last_sent_at + timedelta(
            seconds=settings.PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS
        )

    @property
    def reset_token_is_expired(self):
        if not self.reset_token_expires_at:
            return True

        return timezone.now() >= self.reset_token_expires_at

    def can_resend_otp(self):
        return timezone.now() >= self.resend_available_at

    def refresh_otp(self):
        otp_length = max(settings.PASSWORD_RESET_OTP_LENGTH, 4)
        otp = "".join(secrets.choice("0123456789") for _ in range(otp_length))
        now = timezone.now()

        self.otp_hash = make_password(otp)
        self.otp_expires_at = now + timedelta(minutes=settings.PASSWORD_RESET_OTP_EXPIRY_MINUTES)
        self.otp_last_sent_at = now
        self.otp_attempts = 0
        self.reset_token_hash = ""
        self.reset_token_expires_at = None
        self.verified_at = None
        return otp

    def check_otp(self, raw_otp):
        return check_password(raw_otp, self.otp_hash)

    def issue_reset_token(self):
        reset_token = secrets.token_urlsafe(32)
        now = timezone.now()

        self.reset_token_hash = make_password(reset_token)
        self.reset_token_expires_at = now + timedelta(seconds=settings.PASSWORD_RESET_TIMEOUT)
        self.verified_at = now
        return reset_token

    def check_reset_token(self, raw_token):
        if not raw_token or not self.reset_token_hash or self.reset_token_is_expired:
            return False

        return check_password(raw_token, self.reset_token_hash)
