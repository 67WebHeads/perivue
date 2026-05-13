from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

ALLOWED_ROLES = {"admin", "clinician", "viewer"}

def is_admin(user):
    return user.role == 'admin'


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


class UserManagementListCreateView(APIView):
    """Admin only — list all users or create a new one."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({"error": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        users = User.objects.all().order_by("created_at").values(
            "id", "email", "full_name", "role", "is_active",
            "profile_complete", "avatar_url", "created_at"
        )
        return Response(list(users))

    def post(self, request):
        if not is_admin(request.user):
            return Response({"error": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        email     = request.data.get("email", "").strip().lower()
        full_name = request.data.get("full_name", "").strip()
        role      = request.data.get("role", "clinician").strip().lower()

        if not email:
            return Response({"error": "email is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not email.endswith("@ceu.edu.ph"):
            return Response({"error": "Must be a @ceu.edu.ph email."}, status=status.HTTP_400_BAD_REQUEST)
        if role not in {"admin", "clinician", "viewer"}:
            return Response({"error": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email=email).exists():
            return Response({"error": "A user with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create(
            email=email,
            full_name=full_name or email.split("@")[0],
            role=role,
            is_active=True,
            profile_complete=True,
        )
        return Response({
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
        }, status=status.HTTP_201_CREATED)


class UserManagementDetailView(APIView):
    """Admin only — update or deactivate a user."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not is_admin(request.user):
            return Response({"error": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        from django.shortcuts import get_object_or_404
        user = get_object_or_404(User, pk=pk)

        # Prevent admin from demoting themselves
        if str(user.pk) == str(request.user.pk) and request.data.get("role") != "admin":
            return Response({"error": "You cannot change your own role."}, status=status.HTTP_400_BAD_REQUEST)

        if "full_name" in request.data:
            user.full_name = request.data["full_name"].strip()
        if "role" in request.data:
            role = request.data["role"].strip().lower()
            if role not in {"admin", "clinician", "viewer"}:
                return Response({"error": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
            user.role = role
        if "is_active" in request.data:
            user.is_active = bool(request.data["is_active"])

        user.save()
        return Response({
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
        })

    def delete(self, request, pk):
        if not is_admin(request.user):
            return Response({"error": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        from django.shortcuts import get_object_or_404
        user = get_object_or_404(User, pk=pk)

        if str(user.pk) == str(request.user.pk):
            return Response({"error": "You cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)