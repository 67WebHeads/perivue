from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


class TestLoginView(APIView):
    """Dev-only: create/get a user and return JWT tokens."""

    def post(self, request):
        if not settings.DEBUG:
            return Response(
                {"error": "Not available in production"},
                status=status.HTTP_403_FORBIDDEN,
            )

        email = request.data.get("email")

        if not email or not email.endswith("@ceu.edu.ph"):
            return Response(
                {"error": "Must use a @ceu.edu.ph email"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user, created = User.objects.get_or_create(
            email=email,
            defaults={"full_name": "Test User", "is_active": True},
        )

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "email": user.email,
                "full_name": user.full_name,
                "created": created,
            }
        )


class MeView(APIView):
    """Returns the currently authenticated user's profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "id": str(user.pk),
                "email": user.email,
                "full_name": user.full_name,
                "avatar_url": user.avatar_url,
                "role": user.role,
                "is_staff": user.is_staff,
                "created_at": user.created_at,
            }
        )
