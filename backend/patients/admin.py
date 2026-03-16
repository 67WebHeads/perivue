from django.contrib import admin
from .models import Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display  = ("full_name", "patient_code", "clinic_id", "sex", "birth_date", "created_at")
    search_fields = ("first_name", "last_name", "patient_code")
    list_filter   = ("sex",)
    ordering      = ("-created_at",)
    readonly_fields = ("id", "created_at", "updated_at")