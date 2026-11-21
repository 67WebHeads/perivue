from django.test import SimpleTestCase, override_settings

from .views import validate_full_name, validate_user_email


class UserValidationTests(SimpleTestCase):
    def test_full_name_rejects_numbers(self):
        self.assertIsNotNone(validate_full_name("Doctor 2"))

    def test_full_name_accepts_common_name_punctuation(self):
        self.assertIsNone(validate_full_name("Dr. Anne-Marie O'Neil"))

    @override_settings(EXTRA_ALLOWED_EMAILS=set())
    def test_user_email_keeps_ceu_domain_policy(self):
        self.assertIsNone(validate_user_email("doctor@ceu.edu.ph"))
        self.assertIsNotNone(validate_user_email("doctor@gmail.com"))

    def test_malformed_user_email_is_rejected(self):
        self.assertIsNotNone(validate_user_email("@ceu.edu.ph"))
