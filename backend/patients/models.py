import uuid
from django.db import models
from django.utils import timezone


def generate_patient_code():
    today = timezone.now().strftime("%Y%m%d")
    prefix = f"PV-{today}-"
    last = (
        Patient.objects.filter(patient_code__startswith=prefix)
        .order_by("patient_code")
        .last()
    )
    if last and last.patient_code:
        try:
            last_number = int(last.patient_code.split("-")[-1])
        except ValueError:
            last_number = 0
    else:
        last_number = 0
    return f"{prefix}{str(last_number + 1).zfill(4)}"


class Patient(models.Model):
    SEX_CHOICES = [
        ("M", "Male"),
        ("F", "Female"),
        ("X", "Non-binary / Other"),
        ("U", "Unknown"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient_code = models.CharField(max_length=64, blank=True, null=True, unique=True)
    first_name = models.CharField(max_length=128)
    last_name = models.CharField(max_length=128)
    sex = models.CharField(max_length=1, choices=SEX_CHOICES, default="U")
    birth_date = models.DateField(blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    assigned_doctor = models.CharField(max_length=128, blank=True, null=True)
    visual_condition = models.TextField(blank=True, null=True)
    case_history = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "patients"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    def save(self, *args, **kwargs):
        if not self.patient_code:
            self.patient_code = generate_patient_code()
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def age(self):
        if not self.birth_date:
            return None
        today = timezone.now().date()
        return (
            today.year
            - self.birth_date.year
            - ((today.month, today.day) < (self.birth_date.month, self.birth_date.day))
        )
