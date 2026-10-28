#!/bin/sh
set -e
python manage.py migrate --noinput
if [ "$SEED_ON_START" = "1" ]; then
  python manage.py seed_catalog
fi
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 60
