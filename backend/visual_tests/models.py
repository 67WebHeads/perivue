import uuid
from django.db import models
from django.utils import timezone
from users.models import User
from patients.models import Patient


class TestProtocol(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True, null=True)
    stimulus_color = models.CharField(max_length=32, default="white")
    stimulus_size_deg = models.DecimalField(max_digits=5, decimal_places=2, default=0.5)
    background_color = models.CharField(max_length=32, default="black")
    kinetic_speed_deg_per_sec = models.DecimalField(
        max_digits=5, decimal_places=2, default=2.0
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "test_protocols"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class ProtocolPoint(models.Model):
    POINT_TYPE_CHOICES = [
        ("static", "Static"),
        ("kinetic", "Kinetic"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    protocol = models.ForeignKey(
        TestProtocol, on_delete=models.CASCADE, related_name="points"
    )
    point_index = models.PositiveIntegerField()
    point_type = models.CharField(
        max_length=10, choices=POINT_TYPE_CHOICES, default="static"
    )

    # Static — fixed dot position
    x_deg = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    y_deg = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)

    # Kinetic — dot sweeps inward along this angle
    angle_deg = models.DecimalField(
        max_digits=6, decimal_places=2, blank=True, null=True
    )
    start_radius_deg = models.DecimalField(
        max_digits=5, decimal_places=2, blank=True, null=True
    )

    is_blindspot_check = models.BooleanField(default=False)

    class Meta:
        db_table = "protocol_points"
        ordering = ["point_index"]

    def __str__(self):
        return f"{self.protocol.name} — point {self.point_index} ({self.point_type})"


class TestSession(models.Model):
    EYE_CHOICES = [
        ("OD", "Right eye"),
        ("OS", "Left eye"),
        ("OU", "Both eyes"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name="test_sessions"
    )
    protocol = models.ForeignKey(
        TestProtocol, on_delete=models.PROTECT, related_name="sessions"
    )
    performed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="performed_sessions"
    )
    eye = models.CharField(max_length=2, choices=EYE_CHOICES)
    notes = models.TextField(blank=True, null=True)
    session_datetime = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "test_sessions"
        ordering = ["-session_datetime"]

    def __str__(self):
        return f"{self.patient} — {self.eye} — {self.session_datetime.date()}"


class TestRun(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("in_progress", "In Progress"),
        ("paused", "Paused"),
        ("completed", "Completed"),
        ("aborted", "Aborted"),
    ]
    EYE_CHOICES = [
        ("OD", "Right eye"),
        ("OS", "Left eye"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        TestSession, on_delete=models.CASCADE, related_name="runs"
    )
    eye = models.CharField(max_length=2, choices=EYE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    current_point_index = models.PositiveIntegerField(default=0)
    fixation_loss_count = models.PositiveIntegerField(default=0)
    is_fixating = models.BooleanField(default=True)
    start_time = models.DateTimeField(blank=True, null=True)
    end_time = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "test_runs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Run {self.id} — {self.eye} — {self.status}"


class TrialResult(models.Model):
    RESULT_CHOICES = [
        ("seen", "Seen"),
        ("not_seen", "Not Seen"),
        ("not_tested", "Not Tested"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(TestRun, on_delete=models.CASCADE, related_name="results")
    protocol_point = models.ForeignKey(
        ProtocolPoint, on_delete=models.PROTECT, related_name="results"
    )
    result = models.CharField(max_length=12, choices=RESULT_CHOICES)
    response_time_ms = models.PositiveIntegerField(blank=True, null=True)

    # Kinetic only
    boundary_x_deg = models.DecimalField(
        max_digits=6, decimal_places=2, blank=True, null=True
    )
    boundary_y_deg = models.DecimalField(
        max_digits=6, decimal_places=2, blank=True, null=True
    )

    presented_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "trial_results"
        ordering = ["presented_at"]

    def __str__(self):
        return f"{self.run} — point {self.protocol_point.point_index} — {self.result}"


class FixationEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(
        TestRun, on_delete=models.CASCADE, related_name="fixation_events"
    )
    is_fixating = models.BooleanField()
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fixation_events"
        ordering = ["recorded_at"]
