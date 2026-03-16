from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from rest_framework.exceptions import ValidationError


class CEUAccountAdapter(DefaultSocialAccountAdapter):

    def pre_social_login(self, request, sociallogin):
        """Block non-CEU emails before anything is created."""
        email = sociallogin.account.extra_data.get("email", "")
        if not email.endswith("@ceu.edu.ph"):
            raise ValidationError(
                "Only CEU email accounts (@ceu.edu.ph) are allowed to log in."
            )

    def save_user(self, request, sociallogin, form=None):
        """
        Called when a brand-new user is created via social login.
        We pull name + avatar from Google's extra_data and save them
        directly onto the User row.
        """
        user = super().save_user(request, sociallogin, form)

        extra = sociallogin.account.extra_data

        # Google returns 'name' and 'picture'
        if not user.full_name:
            user.full_name = extra.get("name", "")

        if not user.avatar_url:
            user.avatar_url = extra.get("picture", "")

        # profile_complete stays False — the frontend will redirect to /complete-profile
        user.profile_complete = False
        user.save(update_fields=["full_name", "avatar_url", "profile_complete"])

        # Populate user_identities
        self._sync_identity(user, sociallogin)

        return user

    def _sync_identity(self, user, sociallogin):
        """Create or update the UserIdentity row for this social account."""
        from users.models import UserIdentity

        account = sociallogin.account
        extra = account.extra_data
        sub = str(account.uid)  # Google's unique user ID
        provider = account.provider  # "google"

        UserIdentity.objects.update_or_create(
            provider=provider,
            provider_sub=sub,
            defaults={
                "user": user,
                "provider_email": extra.get("email", ""),
                "raw_profile": extra,
            },
        )
