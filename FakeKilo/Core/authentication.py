from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings

from .models import CustomUser


def get_password_change_marker(user):
    password_changed_at = getattr(user, "password_changed_at", None)
    if not password_changed_at:
        return 0

    return int(password_changed_at.timestamp() * 1_000_000)


def token_was_issued_before_password_change(user, validated_token):
    token_password_marker = validated_token.get("pwd")
    current_password_marker = get_password_change_marker(user)

    if token_password_marker is not None:
        return int(token_password_marker) != current_password_marker

    token_issued_at = validated_token.get("iat")
    if current_password_marker == 0 or token_issued_at is None:
        return False

    return int(current_password_marker / 1_000_000) > int(token_issued_at)


class PasswordBoundTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["pwd"] = get_password_change_marker(user)
        return token


class PasswordBoundJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        if token_was_issued_before_password_change(user, validated_token):
            raise AuthenticationFailed(
                "This session is no longer valid. Please sign in again.",
                code="token_not_current",
            )

        return user


class PasswordBoundTokenRefreshSerializer(TokenRefreshSerializer):
    default_error_messages = {
        "password_changed": "This session is no longer valid. Please sign in again.",
    }

    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])
        user_id = refresh.get(api_settings.USER_ID_CLAIM)

        user = CustomUser.objects.filter(
            **{api_settings.USER_ID_FIELD: user_id}
        ).first()
        if user and token_was_issued_before_password_change(user, refresh):
            raise InvalidToken(self.error_messages["password_changed"])

        return super().validate(attrs)
