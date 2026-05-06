from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('Core', '0004_pendingpasswordreset'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='username',
            field=models.CharField(blank=True, default=None, help_text="The User's Unique Username.", max_length=30, null=True, unique=True),
        ),
    ]
