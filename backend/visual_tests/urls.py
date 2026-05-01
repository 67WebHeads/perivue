from django.urls import path
from . import views

urlpatterns = [
    # Protocols
    path("protocols/", views.ProtocolListCreateView.as_view(), name="protocol-list"),
    path(
        "protocols/<uuid:pk>/",
        views.ProtocolDetailView.as_view(),
        name="protocol-detail",
    ),
    # Sessions
    path("sessions/", views.SessionListCreateView.as_view(), name="session-list"),
    path(
        "sessions/<uuid:pk>/", views.SessionDetailView.as_view(), name="session-detail"
    ),
    path(
        "sessions/<uuid:session_pk>/runs/",
        views.RunCreateView.as_view(),
        name="run-create",
    ),
    # Runs
    path("runs/<uuid:pk>/state/", views.RunStateView.as_view(), name="run-state"),
    path("runs/<uuid:pk>/command/", views.RunCommandView.as_view(), name="run-command"),
    path(
        "runs/<uuid:run_pk>/results/",
        views.TrialResultListView.as_view(),
        name="run-results",
    ),
    path(
        "runs/<uuid:run_pk>/submit/",
        views.TrialResultCreateView.as_view(),
        name="run-submit",
    ),
    # Fixation — called by MediaPipe script
    path(
        "runs/<uuid:run_pk>/fixation/",
        views.FixationStatusView.as_view(),
        name="run-fixation",
    ),
    path(
        "runs/<uuid:run_pk>/mediapipe/start/",
        views.MediaPipeStartView.as_view(),
        name="mediapipe-start",
    ),
    path(
        "runs/<uuid:run_pk>/mediapipe/stop/",
        views.MediaPipeStopView.as_view(),
        name="mediapipe-stop",
    ),
    path(
        "sessions/<uuid:pk>/results/",
        views.SessionResultsView.as_view(),
        name="session-results",
    ),
]
