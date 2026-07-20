from app.extensions import db, utcnow


class MotorAsset(db.Model):
    __tablename__ = "motor_assets"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(1000))
    location = db.Column(db.String(200))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    owner = db.relationship("User", back_populates="owned_assets")

    sensor_readings = db.relationship(
        "SensorReading", back_populates="asset", cascade="all, delete-orphan"
    )

    def is_owned_by(self, current_username):
        return (
            current_username is not None
            and self.owner is not None
            and self.owner.username == current_username
        )

    def to_summary_dict(self, current_username=None):
        return {
            "id": self.id,
            "name": self.name,
            "location": self.location,
            "is_owner": self.is_owned_by(current_username),
        }

    def to_detail_dict(self, current_username=None):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "location": self.location,
            "owner": self.owner.username if self.owner else None,
            "created_at": self.created_at.isoformat(),
            "is_owner": self.is_owned_by(current_username),
            "sensor_metrics": self.sensor_metrics_series(),
        }

    def sensor_metrics_series(self):
        series = {}
        for reading in sorted(self.sensor_readings, key=lambda r: r.timestamp):
            series.setdefault(
                reading.metric, {"metric": reading.metric, "unit": reading.unit, "readings": []}
            )["readings"].append(
                {"timestamp": reading.timestamp.isoformat(), "value": reading.value}
            )
        return list(series.values())


class SensorReading(db.Model):
    """Hypertable (see db_setup.ensure_hypertable): partitioned by `timestamp` on Postgres."""

    __tablename__ = "sensor_readings"

    # TimescaleDB requires the partitioning column in every unique/PK index,
    # so the primary key is composite instead of a surrogate id.
    asset_id = db.Column(
        db.Integer, db.ForeignKey("motor_assets.id"), primary_key=True, nullable=False
    )
    metric = db.Column(db.String(100), primary_key=True, nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), primary_key=True, nullable=False)
    unit = db.Column(db.String(20))
    value = db.Column(db.Float, nullable=False)

    asset = db.relationship("MotorAsset", back_populates="sensor_readings")
