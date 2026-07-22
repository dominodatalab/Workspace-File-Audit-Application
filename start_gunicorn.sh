#!/bin/bash
set -e
gunicorn app:app \
  --bind 0.0.0.0:8888 \
  --workers 1 \
  --threads 4 \
  --worker-class gthread \
  --timeout 120 \
  --log-level info
