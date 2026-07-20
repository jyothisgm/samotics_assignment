"""Create the target Postgres database if it doesn't exist yet.

Connects to the same server's default `postgres` maintenance database to check for
and create the configured database — used by ci.sh before running migrations, so the
pipeline can recover from a dropped/missing database on its own instead of just
failing with "connection refused".
"""

import re
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import Config


def ensure_db():
    db_uri = Config.SQLALCHEMY_DATABASE_URI
    match = re.match(r"^(?P<prefix>.+)/(?P<dbname>[^/]+)$", db_uri)
    if not match:
        print(f"Could not parse DATABASE_URL: {db_uri}", file=sys.stderr)
        sys.exit(1)

    dbname = match.group("dbname")
    maintenance_uri = f"{match.group('prefix')}/postgres"

    try:
        engine = create_engine(maintenance_uri, isolation_level="AUTOCOMMIT")
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": dbname}
            ).scalar()
            if exists:
                print(f"Database {dbname!r} already exists.")
            else:
                conn.execute(text(f'CREATE DATABASE "{dbname}"'))
                print(f"Database {dbname!r} did not exist — created it.")
    except OperationalError as exc:
        print(f"Cannot reach the Postgres server: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    ensure_db()
