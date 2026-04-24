from http import HTTPStatus
from urllib.parse import urlsplit

from django.conf import settings
from django.http import HttpResponse
from django.utils.cache import patch_vary_headers


def normalize_origin(origin):
    if not origin:
        return None

    parsed = urlsplit(origin)
    if not parsed.scheme or not parsed.netloc:
        return None

    return f"{parsed.scheme}://{parsed.netloc}"


class DevCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_origin = normalize_origin(request.headers.get("Origin"))
        allowed_origins = set(getattr(settings, "CORS_ALLOWED_ORIGINS", []))

        if request.method == "OPTIONS" and request_origin in allowed_origins:
            response = HttpResponse(status=HTTPStatus.NO_CONTENT)
        else:
            response = self.get_response(request)

        if request_origin in allowed_origins:
            response["Access-Control-Allow-Origin"] = request_origin
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Allow-Headers"] = (
                "Authorization, Content-Type, X-Requested-With"
            )
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Access-Control-Max-Age"] = "86400"
            patch_vary_headers(response, ("Origin",))

        return response
