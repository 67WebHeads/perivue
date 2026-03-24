import math
from django.core.management.base import BaseCommand
from visual_tests.models import TestProtocol, ProtocolPoint


class Command(BaseCommand):
    help = "Seeds the default tangent screen protocol with static and kinetic points"

    def handle(self, *args, **kwargs):
        # Delete existing default protocol if it exists
        TestProtocol.objects.filter(name="Default Tangent Screen").delete()

        protocol = TestProtocol.objects.create(
            name="Default Tangent Screen",
            description="Standard peripheral vision test — 16 kinetic sweeps + 24 static points",
            stimulus_color="white",
            stimulus_size_deg=0.5,
            background_color="black",
            kinetic_speed_deg_per_sec=2.0,
            is_active=True,
        )

        point_index = 0

        # ── Kinetic points ──────────────────────────────────────────
        # 16 angles every 22.5 degrees, sweeping inward from 35 degrees out
        kinetic_angles = [i * 22.5 for i in range(16)]

        for angle in kinetic_angles:
            ProtocolPoint.objects.create(
                protocol=protocol,
                point_index=point_index,
                point_type="kinetic",
                angle_deg=angle,
                start_radius_deg=35,
                x_deg=None,
                y_deg=None,
            )
            point_index += 1
            self.stdout.write(f"  Kinetic point — angle {angle}°")

        # ── Static points ────────────────────────────────────────────
        # 8 directions x 3 distances (10, 20, 30 degrees) = 24 points
        static_angles = [0, 45, 90, 135, 180, 225, 270, 315]
        static_radii = [10, 20, 30]

        for radius in static_radii:
            for angle in static_angles:
                angle_rad = math.radians(angle)
                x = round(radius * math.cos(angle_rad), 2)
                y = round(radius * math.sin(angle_rad), 2)
                ProtocolPoint.objects.create(
                    protocol=protocol,
                    point_index=point_index,
                    point_type="static",
                    x_deg=x,
                    y_deg=y,
                    angle_deg=None,
                    start_radius_deg=None,
                )
                point_index += 1
                self.stdout.write(
                    f"  Static point — angle {angle}° radius {radius}° → ({x}, {y})"
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Protocol created with {point_index} points "
                f"({len(kinetic_angles)} kinetic + {len(static_angles) * len(static_radii)} static)."
            )
        )
