import re
import unicodedata

from django.core.exceptions import ValidationError


PHONE_RE = re.compile(r"^09\d{9}$")
GMAIL_RE = re.compile(r"^[A-Z0-9._%+-]+@gmail\.com$", re.IGNORECASE)
NAME_PUNCTUATION = {" ", "'", "-", "."}


def validate_person_name(value):
    """Allow Unicode letters plus common name punctuation, but no numbers."""
    value = (value or "").strip()
    if not value:
        raise ValidationError("This field is required.")
    if not all(
        char in NAME_PUNCTUATION
        or unicodedata.category(char).startswith(("L", "M"))
        for char in value
    ):
        raise ValidationError(
            "Use letters, spaces, apostrophes, hyphens, or periods only."
        )


def validate_ph_mobile(value):
    if value in (None, ""):
        return
    if not PHONE_RE.fullmatch(value):
        raise ValidationError("Enter an 11-digit mobile number starting with 09.")


def validate_gmail(value):
    if value in (None, ""):
        return
    if not GMAIL_RE.fullmatch(value):
        raise ValidationError("Email must be a valid @gmail.com address.")
