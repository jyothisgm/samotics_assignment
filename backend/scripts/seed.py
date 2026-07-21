import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from faker import Faker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app
from app.asset.models import MotorAsset, SensorReading
from app.extensions import db
from app.user.models import User

ASSET_COUNT = 200
OWNER_USERNAMES = ["samotics", "jyothis"]  # fixed owner accounts, shared across assets
METRICS = [
    ("vibration_velocity", "mm/s", 0.5, 8.0),
    ("winding_temperature", "C", 40.0, 95.0),
    ("current_draw", "A", 5.0, 60.0),
]
READINGS_PER_METRIC = 48  # hourly for 2 days

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@123")
OWNER_PASSWORD = os.environ.get("OWNER_PASSWORD", "Password@123")

fake = Faker()


def seed():
    """Populate demo data. Schema is owned by Alembic migrations (`flask db upgrade`) —
    this only clears and reloads rows, it never touches table structure."""
    app = create_app()
    with app.app_context():
        # Delete in FK-safe order.
        SensorReading.query.delete()
        MotorAsset.query.delete()
        User.query.delete()
        db.session.commit()

        admin = User(username=ADMIN_USERNAME, is_admin=True)
        admin.set_password(ADMIN_PASSWORD)
        db.session.add(admin)

        owners = []
        for name in OWNER_USERNAMES:
            owner = User(username=name)
            owner.set_password(OWNER_PASSWORD)
            db.session.add(owner)
            owners.append(owner)

        db.session.flush()

        now = datetime.now(timezone.utc)

        for _ in range(ASSET_COUNT):
            created_at = now - timedelta(days=random.randint(30, 900))
            asset = MotorAsset(
                name=f"{fake.city()} {random.choice(['Pump', 'Compressor', 'Fan', 'Conveyor', 'Blower'])} Motor",
                description=fake.sentence(nb_words=12),
                location=f"{fake.city()}, {fake.country()}",
                owner_id=random.choice(owners).id,
                created_at=created_at,
            )
            db.session.add(asset)
            db.session.flush()

            for metric, unit, low, high in METRICS:
                base = random.uniform(low, high)
                for i in range(READINGS_PER_METRIC):
                    timestamp = now - timedelta(hours=READINGS_PER_METRIC - i)
                    value = round(base + random.uniform(-0.1, 0.1) * (high - low), 3)
                    db.session.add(
                        SensorReading(
                            asset_id=asset.id,
                            metric=metric,
                            unit=unit,
                            timestamp=timestamp,
                            value=value,
                        )
                    )

        db.session.commit()
        print(f"Seeded {ASSET_COUNT} motor assets and their sensor readings.")
        print(f"Seeded admin user: {ADMIN_USERNAME}")
        print(f"Seeded {len(OWNER_USERNAMES)} asset owners.")
        for name in OWNER_USERNAMES:
            print(f"  {name}")


if __name__ == "__main__":
    seed()
