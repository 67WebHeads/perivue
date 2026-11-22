from rest_framework import serializers
from django.utils import timezone
from .models import Patient

PATIENT_WRITE_FIELDS = [
    "first_name",
    "last_name",
    "sex",
    "birth_date",
    "phone",
    "email",
    "assigned_doctor",
    "visual_condition",
    "case_history",
    "notes",
]


class PatientListSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "patient_code",
            "first_name",
            "last_name",
            "full_name",
            "age",
            "sex",
            "birth_date",
            "phone",
            "email",
            "assigned_doctor",
            "visual_condition",
            "case_history",
            "notes",
            "created_at",
        ]

    def get_full_name(self, obj):
        return obj.full_name

    def get_age(self, obj):
        return obj.age


class PatientDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "patient_code",
            "first_name",
            "last_name",
            "full_name",
            "age",
            "sex",
            "birth_date",
            "phone",
            "email",
            "assigned_doctor",
            "visual_condition",
            "case_history",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "patient_code",
            "full_name",
            "age",
            "created_at",
            "updated_at",
        ]

    def get_full_name(self, obj):
        return obj.full_name

    def get_age(self, obj):
        return obj.age


class PatientWriteValidationMixin:
    TEXT_LIMIT = 2000

    def validate_birth_date(self, value):
        if value and value > timezone.now().date():
            raise serializers.ValidationError("Birth date cannot be in the future.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        for field in ("first_name", "last_name"):
            if field in attrs:
                attrs[field] = " ".join(attrs[field].strip().split())

        for field in ("phone", "email", "assigned_doctor"):
            if field in attrs and isinstance(attrs[field], str):
                cleaned = attrs[field].strip()
                attrs[field] = cleaned or None

        if attrs.get("email"):
            attrs["email"] = attrs["email"].lower()

        for field in ("visual_condition", "case_history", "notes"):
            if field not in attrs or attrs[field] is None:
                continue
            cleaned = attrs[field].strip()
            if len(cleaned) > self.TEXT_LIMIT:
                raise serializers.ValidationError({
                    field: f"Must be {self.TEXT_LIMIT} characters or fewer."
                })
            attrs[field] = cleaned or None
        return attrs


class PatientCreateSerializer(PatientWriteValidationMixin, serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = PATIENT_WRITE_FIELDS

    def create(self, validated_data):
        return Patient.objects.create(**validated_data)


class PatientUpdateSerializer(PatientWriteValidationMixin, serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = PATIENT_WRITE_FIELDS
