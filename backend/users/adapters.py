from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from rest_framework.exceptions import ValidationError


class CEUAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        email = sociallogin.account.extra_data.get("email", "")

        if not email.endswith("@ceu.edu.ph"):
            raise ValidationError(
                "Only CEU email accounts (@ceu.edu.ph) are allowed to log in."
            )
