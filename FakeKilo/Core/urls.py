from django.urls import path
from . import views

urlpatterns = [
    path('', views.Home, name='home'),
    path('verify/', views.verify_page, name='verify_page'),
    path('password-reset/', views.password_reset_request_page, name='password_reset_request_page'),
    path(
        'password-reset/<uidb64>/<token>/',
        views.password_reset_confirm_page,
        name='password_reset_confirm_page',
    ),
    path('dashboard/', views.dashboard_page, name='dashboard_page'),
    path('api/me/', views.current_user, name='current_user'),
    path('google_login/', views.google_auth, name='google_login'),
    path('signup/request_otp/', views.request_signup_otp, name='request_signup_otp'),
    path('signup/resend_otp/', views.resend_signup_otp, name='resend_signup_otp'),
    path('signup/verify_otp/', views.verify_signup_otp, name='verify_signup_otp'),
    path('password-reset/request/', views.request_password_reset, name='request_password_reset'),
    path('password-reset/confirm/', views.confirm_password_reset, name='confirm_password_reset'),
    path('api/token/', views.SafeTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', views.SafeTokenRefreshView.as_view(), name='token_refresh'),
]
