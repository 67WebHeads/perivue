from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse  # 1. Import JsonResponse
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenBlacklistView,
)


# 2. Create a simple function to handle the empty root URL
def api_root(request):
    return JsonResponse(
        {"message": "Perivue API is running successfully!", "status": "ok"}
    )


urlpatterns = [
    # 3. Add the empty path to the very top of your list
    path("", api_root, name="api_root"),
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
]
