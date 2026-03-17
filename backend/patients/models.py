import uuid
from django.db import models
from django.utils import timezone


class Patient(models.Model):
    SEX_CHOICES = [
        ("M", "Male"),
        ("F", "Female"),
        ("X", "Non-binary / Other"),
        ("U", "Unknown"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic_id = models.UUIDField(db_index=True)
    patient_code = models.CharField(max_length=64, blank=True, null=True)
    first_name = models.CharField(max_length=128)
    last_name = models.CharField(max_length=128)
    sex = models.CharField(max_length=1, choices=SEX_CHOICES, default="U")
    birth_date = models.DateField(blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    assigned_doctor = models.CharField(max_length=128, blank=True, null=True)
    visual_condition = models.TextField(
        blank=True, null=True
    )  # permanent condition e.g. glaucoma, myopia
    case_history = models.TextField(
        blank=True, null=True
    )  # past cases, surgeries, notes
    notes = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "patients"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["clinic_id", "patient_code"],
                condition=models.Q(patient_code__isnull=False),
                name="unique_patient_code_per_clinic",
            )
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def age(self):
        """Computed age in years from birth_date. Returns None if birth_date not set."""
        if not self.birth_date:
            return None
        today = timezone.now().date()
        return (
            today.year
            - self.birth_date.year
            - ((today.month, today.day) < (self.birth_date.month, self.birth_date.day))
        )
