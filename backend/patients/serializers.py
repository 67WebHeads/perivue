from rest_framework import serializers
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


class PatientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = PATIENT_WRITE_FIELDS

    def create(self, validated_data):
        return Patient.objects.create(**validated_data)


class PatientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = PATIENT_WRITE_FIELDS
