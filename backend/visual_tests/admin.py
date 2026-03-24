from django.contrib import admin
from .models import (
    TestProtocol,
    ProtocolPoint,
    TestSession,
    TestRun,
    TrialResult,
    FixationEvent,
)


@admin.register(TestProtocol)
class TestProtocolAdmin(admin.ModelAdmin):
    list_display = ["name", "is_active", "created_at"]


@admin.register(ProtocolPoint)
class ProtocolPointAdmin(admin.ModelAdmin):
    list_display = [
        "protocol",
        "point_index",
        "point_type",
        "x_deg",
        "y_deg",
        "angle_deg",
    ]


@admin.register(TestSession)
class TestSessionAdmin(admin.ModelAdmin):
    list_display = ["patient", "eye", "protocol", "performed_by", "session_datetime"]


@admin.register(TestRun)
class TestRunAdmin(admin.ModelAdmin):
    list_display = ["session", "eye", "status", "current_point_index", "created_at"]


@admin.register(TrialResult)
class TrialResultAdmin(admin.ModelAdmin):
    list_display = [
        "run",
        "protocol_point",
        "result",
        "response_time_ms",
        "presented_at",
    ]


@admin.register(FixationEvent)
class FixationEventAdmin(admin.ModelAdmin):
    list_display = ["run", "is_fixating", "recorded_at"]
