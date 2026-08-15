from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from visual_tests.models import TestRun, TestSession


class Command(BaseCommand):
    """
    Delete runs that never finished, plus any session left with no runs.

    Cancelling a test now discards its run as it happens, and the session list
    hides unfinished ones, so this is only for rows that piled up before that
    — tests that were cancelled, crashed, or had the tab closed partway.

    Reports only by default. Nothing is deleted without --confirm, because a
    run that looks abandoned may just be one somebody left paused.
    """

    help = "Delete unfinished test runs and the empty sessions they leave behind."

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Actually delete. Without this the command only reports.",
        )

    def handle(self, *args, **options):
        unfinished = TestRun.objects.exclude(status="completed").select_related(
            "session__patient"
        )
        # Sessions whose every run is unfinished — these vanish from the
        # patient's history entirely. Sessions that also hold a completed run
        # keep that run and stay.
        empty_sessions = TestSession.objects.annotate(
            total=Count("runs"),
            done=Count("runs", filter=Q(runs__status="completed")),
        ).filter(done=0)

        run_count = unfinished.count()
        session_count = empty_sessions.count()

        if not run_count and not session_count:
            self.stdout.write(self.style.SUCCESS("Nothing to purge."))
            return

        by_status = {}
        for run in unfinished:
            by_status[run.status] = by_status.get(run.status, 0) + 1

        self.stdout.write(f"Unfinished runs: {run_count}")
        for status_name, n in sorted(by_status.items()):
            self.stdout.write(f"  {status_name}: {n}")
        self.stdout.write(f"Sessions with no completed run: {session_count}")

        for run in unfinished[:20]:
            patient = getattr(run.session.patient, "full_name", "?")
            self.stdout.write(
                f"  {run.session.session_datetime:%Y-%m-%d}  {patient}  "
                f"{run.eye}  {run.status}  (point {run.current_point_index})"
            )
        if run_count > 20:
            self.stdout.write(f"  … and {run_count - 20} more")

        if not options["confirm"]:
            self.stdout.write(
                self.style.WARNING(
                    "\nDry run — nothing deleted. Re-run with --confirm to delete."
                )
            )
            return

        # Runs first: deleting a session would cascade into its completed runs
        deleted_runs, _ = unfinished.delete()
        deleted_sessions, _ = TestSession.objects.filter(runs__isnull=True).delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted_runs} run row(s) and {deleted_sessions} "
                f"session row(s)."
            )
        )
