#!/bin/bash
if [ ! -d "dist" ]; then
  echo "[INFO] dist directory not found, running build..."
  npx vite build
fi
exec npx vite "$@"
