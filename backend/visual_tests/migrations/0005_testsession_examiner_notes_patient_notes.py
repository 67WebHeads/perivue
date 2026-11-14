from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("visual_tests", "0004_testrun_gaze_calibration_testrun_raw_h_testrun_raw_v"),
    ]

    operations = [
        # Rename keeps any notes already written as the examiner's notes
        migrations.RenameField(
            model_name="testsession",
            old_name="notes",
            new_name="examiner_notes",
        ),
        migrations.AddField(
            model_name="testsession",
            name="patient_notes",
            field=models.TextField(blank=True, null=True),
        ),
    ]
