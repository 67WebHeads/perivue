from rest_framework import serializers
from .models import Patient

PATIENT_WRITE_FIELDS = [
    "patient_code",
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
    """Lightweight — used for the table list view."""

    full_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "clinic_id",
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
    """Full detail — used for retrieve / expanded view."""

    full_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "clinic_id",
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
            "clinic_id",
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

    def validate_patient_code(self, value):
        if not value:
            return value
        clinic_id = self.context.get("clinic_id")
        qs = Patient.objects.filter(clinic_id=clinic_id, patient_code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "A patient with this code already exists in this clinic."
            )
        return value

    def create(self, validated_data):
        return Patient.objects.create(
            clinic_id=self.context["clinic_id"], **validated_data
        )


class PatientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = PATIENT_WRITE_FIELDS

    def validate_patient_code(self, value):
        if not value:
            return value
        qs = Patient.objects.filter(
            clinic_id=self.instance.clinic_id, patient_code=value
        ).exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "A patient with this code already exists in this clinic."
            )
        return value
