from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import (
    TestProtocol,
    ProtocolPoint,
    TestSession,
    TestRun,
    TrialResult,
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
    TrialResultCreateSerializer,
    TrialResultSerializer,
    FixationEventSerializer,
)

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


class TrialResultCreateView(APIView):
    """
    The canvas POSTs here after each stimulus — seen or not seen.
    Also advances current_point_index automatically.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, run_pk):
        run = get_object_or_404(TestRun, pk=run_pk)

        if run.status not in ("in_progress",):
            return Response(
                {"error": "Run is not in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TrialResultCreateSerializer(
            data=request.data,
            context={"run": run},
        )
        if serializer.is_valid():
            result = serializer.save()

            # Advance to the next point automatically
            total_points = run.session.protocol.points.count()
            if run.current_point_index + 1 >= total_points:
                run.status = "completed"
                run.end_time = timezone.now()
            else:
                run.current_point_index += 1
            run.save()

            return Response(
                TrialResultSerializer(result).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TrialResultListView(APIView):
    """
    Returns all results for a run — used by the results view to draw the field map.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, run_pk):
        run = get_object_or_404(TestRun, pk=run_pk)
        results = run.results.select_related("protocol_point").all()
        return Response(TrialResultSerializer(results, many=True).data)


# ─── Fixation ─────────────────────────────────────────────────────────────────


class FixationStatusView(APIView):
    """
    MediaPipe script POSTs here every ~200ms with current fixation status.
    No auth required — this comes from a local Python process, not the browser.
    """

    permission_classes = [AllowAny]

    def post(self, request, run_pk):
        run = get_object_or_404(TestRun, pk=run_pk)
        is_fixating = request.data.get("is_fixating")

        if is_fixating is None:
            return Response(
                {"error": "is_fixating is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update live fixation status on the run
        run.is_fixating = is_fixating
        if not is_fixating:
            run.fixation_loss_count += 1
        run.save(update_fields=["is_fixating", "fixation_loss_count"])

        # Log the event
        FixationEvent.objects.create(run=run, is_fixating=is_fixating)

        return Response({"ok": True})
