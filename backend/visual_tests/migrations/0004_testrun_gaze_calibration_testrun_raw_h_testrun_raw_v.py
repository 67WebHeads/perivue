from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("visual_tests", "0003_testrun_trials_delete_trialresult"),
    ]

    operations = [
        migrations.AddField(
            model_name="testrun",
            name="gaze_calibration",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="testrun",
            name="raw_h",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="testrun",
            name="raw_v",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
