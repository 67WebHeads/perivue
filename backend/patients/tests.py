from django.test import SimpleTestCase

from .serializers import PatientCreateSerializer


class PatientValidationTests(SimpleTestCase):
    def valid_payload(self, **overrides):
        payload = {
            "first_name": "Maria",
            "last_name": "Dela Cruz",
            "phone": "09123456789",
            "email": "maria@gmail.com",
            "sex": "F",
        }
        payload.update(overrides)
        return payload

    def test_names_reject_numbers(self):
        serializer = PatientCreateSerializer(
            data=self.valid_payload(first_name="Maria2")
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("first_name", serializer.errors)

    def test_name_allows_common_punctuation(self):
        serializer = PatientCreateSerializer(
            data=self.valid_payload(first_name="Anne-Marie", last_name="O'Neil Jr.")
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_phone_requires_09_and_exactly_11_digits(self):
        for phone in ("08123456789", "0912345678", "091234567890"):
            with self.subTest(phone=phone):
                serializer = PatientCreateSerializer(
                    data=self.valid_payload(phone=phone)
                )
                self.assertFalse(serializer.is_valid())
                self.assertIn("phone", serializer.errors)

    def test_email_requires_gmail_domain(self):
        serializer = PatientCreateSerializer(
            data=self.valid_payload(email="maria@yahoo.com")
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_optional_phone_and_email_may_be_blank(self):
        serializer = PatientCreateSerializer(
            data=self.valid_payload(phone="", email="")
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_future_birth_date_is_rejected(self):
        serializer = PatientCreateSerializer(
            data=self.valid_payload(birth_date="2999-01-01")
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("birth_date", serializer.errors)
