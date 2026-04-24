from django.urls import path
from . import views

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)


urlpatterns = [
    path('', views.Home, name='home'),
    path('verify/', views.verify_page, name='verify_page'),
    path('dashboard/', views.dashboard_page, name='dashboard_page'),
    path('api/me/', views.current_user, name='current_user'),
    path('google_login/', views.google_auth, name='google_login'),
    path('signup/request_otp/', views.request_signup_otp, name='request_signup_otp'),
    path('signup/resend_otp/', views.resend_signup_otp, name='resend_signup_otp'),
    path('signup/verify_otp/', views.verify_signup_otp, name='verify_signup_otp'),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
