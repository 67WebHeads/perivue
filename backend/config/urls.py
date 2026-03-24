from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse  # 1. Import JsonResponse
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenBlacklistView,
)
from django.core.mail import send_mail
from django.conf import settings


# 2. Create a simple function to handle the empty root URL
def api_root(request):
    return JsonResponse(
        {"message": "Perivue API is running successfully!", "status": "ok"}
    )


def test_email(request):
    try:
        send_mail(
            subject="PeriVue SMTP Test",
            message="If you are reading this, your email configuration is working correctly!",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[
                "gian.karlo.reyess@gmail.com"
            ],  # 👈 Change this to your actual receiving email
            fail_silently=False,
        )
        return JsonResponse(
            {"message": "Test email sent successfully!", "status": "ok"}
        )
    except Exception as e:
        return JsonResponse(
            {"message": "Failed to send email", "error": str(e)}, status=500
        )


urlpatterns = [
    # 3. Add the empty path to the very top of your list
    path("", api_root, name="api_root"),
    path("test-email/", test_email, name="test_email"),
    path("admin/", admin.site.urls),
    # Regular JWT login + refresh + blacklist (logout)
    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/token/blacklist/", TokenBlacklistView.as_view(), name="token_blacklist"),
    # Google OAuth
    path("accounts/", include("allauth.urls")),
    # dj-rest-auth
    path("api/auth/", include("dj_rest_auth.urls")),
    path("api/auth/registration/", include("dj_rest_auth.registration.urls")),
    # Users
    path("api/users/", include("users.urls")),
    # Patients
    path("api/patients/", include("patients.urls")),
    # Visual Tests
    path("api/visual-tests/", include("visual_tests.urls")),
]
