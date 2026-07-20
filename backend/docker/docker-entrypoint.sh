#!/bin/sh
set -e

flask --app run db upgrade
exec gunicorn --bind 0.0.0.0:5000 --workers 2 run:app
