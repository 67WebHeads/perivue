from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

ALLOWED_ROLES = {"admin", "clinician", "viewer"}


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
    """
    GET   — return current user profile
    PATCH — update full_name and/or role, mark profile_complete = True
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(self._serialize(request.user))

    def patch(self, request):
        user = request.user
        data = request.data

        full_name = data.get("full_name", "").strip()
        if not full_name:
            return Response(
                {"error": "full_name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = data.get("role", "").strip().lower()
        if role not in ALLOWED_ROLES:
            return Response(
                {"error": f"role must be one of: {', '.join(sorted(ALLOWED_ROLES))}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.full_name = full_name
        user.role = role
        user.profile_complete = True
        user.save(update_fields=["full_name", "role", "profile_complete", "updated_at"])

        return Response(self._serialize(user))

    @staticmethod
    def _serialize(user):
        return {
            "id": str(user.pk),
            "email": user.email,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "role": user.role,
            "profile_complete": user.profile_complete,
            "is_staff": user.is_staff,
            "created_at": user.created_at,
        }


class StaffListView(APIView):
    """
    GET /api/users/staff/
    Returns all active users with role 'admin' or 'clinician'.
    Used by the patient form to populate the assigned doctor dropdown.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        staff = (
            User.objects.filter(role__in=["admin", "clinician"], is_active=True)
            .order_by("full_name")
            .values("id", "full_name", "email", "role")
        )
        return Response(list(staff))
