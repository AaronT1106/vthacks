#!/usr/bin/env bash

set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v python3.12 >/dev/null 2>&1; then
  echo "Python 3.12 is required. Install python3.12, then run this script again." >&2
  exit 1
fi

if [[ ! -d .venv ]]; then
  python3.12 -m venv .venv
fi

VENV_PYTHON=".venv/bin/python"
if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "backend/.venv exists but does not contain an executable Python interpreter." >&2
  exit 1
fi

"$VENV_PYTHON" -c 'import sys; assert sys.version_info[:2] == (3, 12), "backend/.venv must use Python 3.12"'

if ! "$VENV_PYTHON" -m pip --version >/dev/null 2>&1; then
  "$VENV_PYTHON" -m ensurepip --upgrade
fi

"$VENV_PYTHON" -m pip install --no-cache-dir -r requirements-dev.txt
"$VENV_PYTHON" -c 'import fastapi, networkx, numpy, osmnx, pydantic, python_multipart, shapely, starlette, torch, transformers, uvicorn; from PIL import Image; from dotenv import load_dotenv; import main; print("Backend imports OK")'

echo "Backend setup complete. Activate it with: source .venv/bin/activate"
