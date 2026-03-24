from django.contrib import admin
from .models import Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ["full_name", "patient_code", "sex", "birth_date", "created_at"]
    search_fields = ["first_name", "last_name", "patient_code", "email", "phone"]
