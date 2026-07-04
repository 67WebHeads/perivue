from rest_framework import serializers
from .models import (
    TestProtocol,
    ProtocolPoint,
    TestSession,
    TestRun,
    FixationEvent,
)
from patients.models import Patient
from users.models import User


class ProtocolPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProtocolPoint
        fields = [
            "id",
            "point_index",
            "point_type",
            "x_deg",
            "y_deg",
            "angle_deg",
            "start_radius_deg",
            "is_blindspot_check",
        ]


class TestProtocolListSerializer(serializers.ModelSerializer):
    point_count = serializers.SerializerMethodField()

    class Meta:
        model = TestProtocol
        fields = [
            "id",
            "name",
            "description",
            "stimulus_color",
            "stimulus_size_deg",
            "background_color",
            "kinetic_speed_deg_per_sec",
            "is_active",
            "created_at",
            "point_count",
        ]

    def get_point_count(self, obj):
        return obj.points.count()


class TestProtocolDetailSerializer(serializers.ModelSerializer):
    points = ProtocolPointSerializer(many=True, read_only=True)

    class Meta:
        model = TestProtocol
        fields = [
            "id",
            "name",
            "description",
            "stimulus_color",
            "stimulus_size_deg",
            "background_color",
            "kinetic_speed_deg_per_sec",
            "is_active",
            "created_at",
            "points",
        ]


class TestProtocolCreateSerializer(serializers.ModelSerializer):
    points = ProtocolPointSerializer(many=True, required=False)

    class Meta:
        model = TestProtocol
        fields = [
            "name",
            "description",
            "stimulus_color",
            "stimulus_size_deg",
            "background_color",
            "kinetic_speed_deg_per_sec",
            "points",
        ]

    def create(self, validated_data):
        points_data = validated_data.pop("points", [])
        protocol = TestProtocol.objects.create(**validated_data)
        for point_data in points_data:
            ProtocolPoint.objects.create(protocol=protocol, **point_data)
        return protocol


class TestSessionListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_code = serializers.CharField(source="patient.patient_code", read_only=True)
    protocol_name = serializers.CharField(source="protocol.name", read_only=True)
    performed_by_name = serializers.CharField(
        source="performed_by.full_name", read_only=True
    )

    class Meta:
        model = TestSession
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_code",
            "protocol",
            "protocol_name",
            "performed_by",
            "performed_by_name",
            "eye",
            "notes",
            "session_datetime",
        ]


class TestSessionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestSession
        fields = [
            "patient",
            "protocol",
            "eye",
            "notes",
        ]

    def create(self, validated_data):
        user = self.context["request"].user
        session = TestSession.objects.create(performed_by=user, **validated_data)
        return session


class TestRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestRun
        fields = [
            "id",
            "session",
            "eye",
            "status",
            "current_point_index",
            "fixation_loss_count",
            "is_fixating",
            "start_time",
            "end_time",
            "created_at",
            "trials",
        ]


class TestRunStateSerializer(serializers.ModelSerializer):
    current_point = serializers.SerializerMethodField()
    protocol = serializers.SerializerMethodField()

    class Meta:
        model = TestRun
        fields = [
            "id",
            "session_id",
            "status",
            "current_point_index",
            "is_fixating",
            "fixation_loss_count",
            "gaze_x",
            "gaze_y",
            "raw_h",
            "raw_v",
            "current_point",
            "protocol",
        ]

    def get_current_point(self, obj):
        try:
            point = obj.session.protocol.points.get(point_index=obj.current_point_index)
            return ProtocolPointSerializer(point).data
        except ProtocolPoint.DoesNotExist:
            return None

    def get_protocol(self, obj):
        protocol = obj.session.protocol
        return {
            "stimulus_color": protocol.stimulus_color,
            "stimulus_size_deg": str(protocol.stimulus_size_deg),
            "background_color": protocol.background_color,
            "kinetic_speed_deg_per_sec": str(protocol.kinetic_speed_deg_per_sec),
        }


class FixationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = FixationEvent
        fields = ["is_fixating", "recorded_at"]
