"""Exit 0 if the database already has seed data, exit 1 if it looks empty.

Used by ci.sh to decide whether to run seed.py at all — seed.py itself always wipes
and reloads unconditionally when invoked directly (see its own docstring), so this
check lives separately rather than changing that contract.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app
from app.asset.models import MotorAsset

app = create_app()
with app.app_context():
    sys.exit(0 if MotorAsset.query.first() is not None else 1)
