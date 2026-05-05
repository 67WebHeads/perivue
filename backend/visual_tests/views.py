from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.mail import EmailMessage
from django.conf import settings
import ssl
import smtplib
import certifi
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
import subprocess
import sys
import os

from .models import (
    TestProtocol,
    ProtocolPoint,
    TestSession,
    TestRun,
    FixationEvent,
)
from .serializers import (
    TestProtocolListSerializer,
    TestProtocolDetailSerializer,
    TestProtocolCreateSerializer,
    TestSessionListSerializer,
    TestSessionCreateSerializer,
    TestRunSerializer,
    TestRunStateSerializer,
    FixationEventSerializer,
)

_mediapipe_process = None


class MediaPipeStartView(APIView):
    """
    Launches the mediapipe_runner.py script for a given run.
    Called by the frontend when a test starts.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, run_pk):
        global _mediapipe_process

        run = get_object_or_404(TestRun, pk=run_pk)

        # Kill any existing MediaPipe process
        if _mediapipe_process and _mediapipe_process.poll() is None:
            _mediapipe_process.terminate()
            _mediapipe_process = None

        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "mediapipe_runner.py",
        )

        if not os.path.exists(script_path):
            return Response(
                {"error": "mediapipe_runner.py not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            _mediapipe_process = subprocess.Popen(
                [sys.executable, script_path, "--run_id", str(run.id)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            return Response({"ok": True, "pid": _mediapipe_process.pid})
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class MediaPipeStopView(APIView):
    """
    Stops the running MediaPipe process.
    Called when the test ends or is aborted.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, run_pk):
        global _mediapipe_process

        if _mediapipe_process and _mediapipe_process.poll() is None:
            _mediapipe_process.terminate()
            _mediapipe_process = None
            return Response({"ok": True, "stopped": True})

        return Response({"ok": True, "stopped": False})


# ─── Protocols ────────────────────────────────────────────────────────────────


class ProtocolListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        protocols = TestProtocol.objects.filter(is_active=True)
        return Response(TestProtocolListSerializer(protocols, many=True).data)

    def post(self, request):
        serializer = TestProtocolCreateSerializer(data=request.data)
        if serializer.is_valid():
            protocol = serializer.save()
            return Response(
                TestProtocolDetailSerializer(protocol).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProtocolDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        protocol = get_object_or_404(TestProtocol, pk=pk)
        return Response(TestProtocolDetailSerializer(protocol).data)

    def delete(self, request, pk):
        protocol = get_object_or_404(TestProtocol, pk=pk)
        protocol.is_active = False
        protocol.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Sessions ─────────────────────────────────────────────────────────────────


class SessionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = TestSession.objects.select_related(
            "patient", "protocol", "performed_by"
        ).all()

        patient_id = request.query_params.get("patient_id")
        if patient_id:
            sessions = sessions.filter(patient_id=patient_id)

        return Response(TestSessionListSerializer(sessions, many=True).data)

    def post(self, request):
        serializer = TestSessionCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        if serializer.is_valid():
            session = serializer.save()
            return Response(
                TestSessionListSerializer(session).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        session = get_object_or_404(
            TestSession.objects.select_related("patient", "protocol", "performed_by"),
            pk=pk,
        )
        return Response(TestSessionListSerializer(session).data)


# ─── Runs ─────────────────────────────────────────────────────────────────────


class RunCreateView(APIView):
    """
    Create a test run for a session.
    Called by the clinician panel when starting the test.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, session_pk):
        session = get_object_or_404(TestSession, pk=session_pk)
        eye = request.data.get("eye")
        if eye not in ("OD", "OS"):
            return Response(
                {"error": "eye must be OD or OS."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        run = TestRun.objects.create(
            session=session,
            eye=eye,
            status="in_progress",
            start_time=timezone.now(),
        )
        return Response(TestRunSerializer(run).data, status=status.HTTP_201_CREATED)


class RunStateView(APIView):
    """
    The canvas polls this every second to know:
    - Is the test paused?
    - What is the current point to display?
    - Is the patient fixating?
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        run = get_object_or_404(
            TestRun.objects.select_related("session__protocol"),
            pk=pk,
        )
        return Response(TestRunStateSerializer(run).data)


class RunCommandView(APIView):
    """
    The clinician panel sends commands here — pause, resume, repeat, next, end.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        run = get_object_or_404(TestRun, pk=pk)
        command = request.data.get("command")

        if command == "pause":
            run.status = "paused"

        elif command == "resume":
            run.status = "in_progress"

        elif command == "next":
            total_points = run.session.protocol.points.count()
            if run.current_point_index + 1 >= total_points:
                return Response(
                    {"error": "Already at last point."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            run.current_point_index += 1
            run.status = "in_progress"

        elif command == "repeat":
            # Stay on current point, just make sure we're running
            run.status = "in_progress"

        elif command == "end":
            run.status = "completed"
            run.end_time = timezone.now()

        elif command == "abort":
            run.status = "aborted"
            run.end_time = timezone.now()

        else:
            return Response(
                {"error": f"Unknown command: {command}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        run.save()
        return Response(TestRunStateSerializer(run).data)


# ─── Trial Results ─────────────────────────────────────────────────────────────


VALID_RESULTS = {"seen", "not_seen", "not_tested"}


class TrialResultCreateView(APIView):
    """
    The canvas POSTs here after each stimulus — seen or not seen.
    Appends one entry to run.trials (denormalized with the protocol point metadata)
    and auto-advances current_point_index.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, run_pk):
        run = get_object_or_404(
            TestRun.objects.select_related("session__protocol"), pk=run_pk
        )

        if run.status != "in_progress":
            return Response(
                {"error": "Run is not in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        point_id = request.data.get("protocol_point")
        result_value = request.data.get("result")

        if result_value not in VALID_RESULTS:
            return Response(
                {"error": f"result must be one of {sorted(VALID_RESULTS)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        point = get_object_or_404(
            ProtocolPoint, pk=point_id, protocol=run.session.protocol
        )

        trial = {
            "protocol_point_id": str(point.id),
            "point_index": point.point_index,
            "point_type": point.point_type,
            "x_deg": str(point.x_deg) if point.x_deg is not None else None,
            "y_deg": str(point.y_deg) if point.y_deg is not None else None,
            "angle_deg": str(point.angle_deg) if point.angle_deg is not None else None,
            "start_radius_deg": (
                str(point.start_radius_deg)
                if point.start_radius_deg is not None
                else None
            ),
            "is_blindspot_check": point.is_blindspot_check,
            "result": result_value,
            "response_time_ms": request.data.get("response_time_ms"),
            "boundary_x_deg": request.data.get("boundary_x_deg"),
            "boundary_y_deg": request.data.get("boundary_y_deg"),
            "presented_at": timezone.now().isoformat(),
        }

        trials = list(run.trials or [])
        trials.append(trial)
        run.trials = trials

        # Advance to the next point automatically
        total_points = run.session.protocol.points.count()
        if run.current_point_index + 1 >= total_points:
            run.status = "completed"
            run.end_time = timezone.now()
        else:
            run.current_point_index += 1
        run.save()

        return Response(trial, status=status.HTTP_201_CREATED)


class TrialResultListView(APIView):
    """
    Returns all results for a run — used by the results view to draw the field map.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, run_pk):
        run = get_object_or_404(TestRun, pk=run_pk)
        return Response(run.trials or [])


# ─── Fixation ─────────────────────────────────────────────────────────────────


class FixationStatusView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, run_pk):
        run = get_object_or_404(TestRun, pk=run_pk)
        is_fixating = request.data.get("is_fixating")
        gaze_x = request.data.get("gaze_x")
        gaze_y = request.data.get("gaze_y")

        if is_fixating is None:
            return Response(
                {"error": "is_fixating is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        run.is_fixating = is_fixating
        if not is_fixating:
            run.fixation_loss_count += 1

        # Store latest gaze position
        if gaze_x is not None:
            run.gaze_x = gaze_x
        if gaze_y is not None:
            run.gaze_y = gaze_y

        run.save(
            update_fields=["is_fixating", "fixation_loss_count", "gaze_x", "gaze_y"]
        )

        FixationEvent.objects.create(run=run, is_fixating=is_fixating)
        return Response({"ok": True})


class SessionResultsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        session = get_object_or_404(
            TestSession.objects.select_related("patient", "protocol", "performed_by"),
            pk=pk,
        )
        runs = session.runs.all()

        runs_data = []
        for run in runs:
            trials = run.trials or []

            static_trials = [t for t in trials if t.get("point_type") == "static"]
            kinetic_trials = [t for t in trials if t.get("point_type") == "kinetic"]

            seen_static = [t for t in static_trials if t.get("result") == "seen"]
            seen_kinetic = [t for t in kinetic_trials if t.get("result") == "seen"]

            reaction_times = [
                t["response_time_ms"]
                for t in seen_static
                if t.get("response_time_ms") is not None
            ]
            avg_reaction_time = (
                round(sum(reaction_times) / len(reaction_times))
                if reaction_times
                else None
            )

            detection_accuracy = (
                round((len(seen_static) / len(static_trials)) * 100, 1)
                if static_trials
                else 0
            )

            kinetic_completion = (
                round((len(seen_kinetic) / len(kinetic_trials)) * 100, 1)
                if kinetic_trials
                else 0
            )

            total_points = len(trials)
            reliability = (
                round(
                    max(
                        0, (total_points - run.fixation_loss_count) / total_points * 100
                    ),
                    1,
                )
                if total_points > 0
                else 100
            )

            runs_data.append(
                {
                    "id": str(run.id),
                    "eye": run.eye,
                    "status": run.status,
                    "start_time": run.start_time,
                    "end_time": run.end_time,
                    "fixation_loss_count": run.fixation_loss_count,
                    "metrics": {
                        "detection_accuracy": detection_accuracy,
                        "avg_reaction_time": avg_reaction_time,
                        "stimuli_seen": len(seen_static),
                        "stimuli_total": len(static_trials),
                        "kinetic_boundary_points": len(seen_kinetic),
                        "kinetic_total": len(kinetic_trials),
                        "reliability": reliability,
                    },
                    "static_results": [
                        {
                            "x_deg": (
                                float(t["x_deg"])
                                if t.get("x_deg") is not None
                                else None
                            ),
                            "y_deg": (
                                float(t["y_deg"])
                                if t.get("y_deg") is not None
                                else None
                            ),
                            "result": t.get("result"),
                        }
                        for t in static_trials
                    ],
                    "kinetic_results": [
                        {
                            "angle_deg": (
                                float(t["angle_deg"])
                                if t.get("angle_deg") is not None
                                else None
                            ),
                            "boundary_x": (
                                float(t["boundary_x_deg"])
                                if t.get("boundary_x_deg") is not None
                                else None
                            ),
                            "boundary_y": (
                                float(t["boundary_y_deg"])
                                if t.get("boundary_y_deg") is not None
                                else None
                            ),
                            "result": t.get("result"),
                        }
                        for t in kinetic_trials
                    ],
                }
            )

        return Response(
            {
                "session": {
                    "id": str(session.id),
                    "session_datetime": session.session_datetime,
                    "eye": session.eye,
                    "notes": session.notes,
                    "protocol_name": session.protocol.name,
                    "performed_by": (
                        session.performed_by.full_name if session.performed_by else None
                    ),
                },
                "patient": {
                    "id": str(session.patient.id),
                    "full_name": session.patient.full_name,
                    "patient_code": session.patient.patient_code,
                    "age": session.patient.age,
                    "sex": session.patient.sex,
                    "assigned_doctor": session.patient.assigned_doctor,
                    "email": session.patient.email,
                },
                "runs": runs_data,
            }
        )


class SessionEmailView(APIView):
    """
    Accepts a multipart upload (pdf file + to/subject/body) and emails the
    patient's results PDF via the configured SMTP backend.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        session = get_object_or_404(
            TestSession.objects.select_related("patient"), pk=pk
        )

        pdf_file = request.FILES.get("pdf")
        if not pdf_file:
            return Response(
                {"error": "pdf file is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        to_email = (request.data.get("to") or session.patient.email or "").strip()
        if not to_email:
            return Response(
                {"error": "Recipient email not provided and patient has no email on file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subject = request.data.get("subject") or (
            f"Visual Field Test Results — {session.patient.full_name}"
        )
        body = request.data.get("body") or (
            f"Dear {session.patient.full_name},\n\n"
            "Please find attached the report for your peripheral vision test.\n\n"
            "Regards,\nPeriVue / CEU Eye Clinic"
        )

        try:
            msg = MIMEMultipart()
            msg["From"] = settings.DEFAULT_FROM_EMAIL
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            attachment = MIMEApplication(pdf_file.read(), _subtype="pdf")
            attachment.add_header(
                "Content-Disposition",
                "attachment",
                filename=pdf_file.name or "perivue_results.pdf",
            )
            msg.attach(attachment)

            context = ssl.create_default_context(cafile=certifi.where())
            with smtplib.SMTP(
                settings.EMAIL_HOST, settings.EMAIL_PORT, timeout=60
            ) as smtp:
                smtp.ehlo()
                smtp.starttls(context=context)
                smtp.ehlo()
                smtp.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
                smtp.send_message(msg)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                {"error": f"{type(e).__name__}: {e}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"ok": True, "sent_to": to_email})


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from patients.models import Patient
        from django.utils import timezone
        from dateutil.relativedelta import relativedelta

        now = timezone.now()
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_start = this_month_start - relativedelta(months=1)

        def pct_change(current, previous):
            if previous == 0:
                return None
            change = round(((current - previous) / previous) * 100)
            return change

        # Patients
        total_patients = Patient.objects.count()
        patients_this_month = Patient.objects.filter(created_at__gte=this_month_start).count()
        patients_last_month = Patient.objects.filter(
            created_at__gte=last_month_start, created_at__lt=this_month_start
        ).count()
        patients_trend = pct_change(patients_this_month, patients_last_month)

        # Sessions
        total_sessions = TestSession.objects.count()
        sessions_this_month = TestSession.objects.filter(session_datetime__gte=this_month_start).count()
        sessions_last_month = TestSession.objects.filter(
            session_datetime__gte=last_month_start, session_datetime__lt=this_month_start
        ).count()
        sessions_trend = pct_change(sessions_this_month, sessions_last_month)

        # Passing rate (all-time vs last month)
        def compute_passing_rate(runs_qs):
            seen = 0
            total = 0
            for run in runs_qs.only("trials"):
                for trial in run.trials or []:
                    result = trial.get("result")
                    if result in ("seen", "not_seen"):
                        total += 1
                        if result == "seen":
                            seen += 1
            return round((seen / total) * 100) if total > 0 else None

        passing_rate = compute_passing_rate(TestRun.objects.all())
        passing_rate_last_month = compute_passing_rate(
            TestRun.objects.filter(start_time__gte=last_month_start, start_time__lt=this_month_start)
        )
        passing_rate_this_month = compute_passing_rate(
            TestRun.objects.filter(start_time__gte=this_month_start)
        )
        passing_rate_trend = pct_change(
            passing_rate_this_month or 0, passing_rate_last_month or 0
        ) if passing_rate_last_month is not None else None

        # Patients tested today
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        patients_today = (
            TestSession.objects.filter(session_datetime__gte=today_start)
            .values("patient")
            .distinct()
            .count()
        )

        return Response(
            {
                "total_patients": total_patients,
                "patients_trend": patients_trend,
                "total_sessions": total_sessions,
                "sessions_trend": sessions_trend,
                "passing_rate": passing_rate,
                "passing_rate_trend": passing_rate_trend,
                "patients_today": patients_today,
            }
        )
