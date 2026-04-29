# CassavaGuard — Dockerfile (CPU-only PyTorch for Railway/Render)
FROM python:3.11-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install CPU-only PyTorch FIRST (separate layer for caching) ──
# CPU wheel is ~200MB vs 2.5GB for the default CUDA build
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    torchvision==0.17.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# ── Install remaining deps ──
RUN pip install --no-cache-dir \
    numpy<2 \
    fastapi \
    "uvicorn[standard]" \
    Pillow \
    python-multipart

# ── Copy app files ──
COPY app.py .
COPY static/ ./static/
COPY model/ ./model/

EXPOSE 8080

# Railway sets $PORT automatically (usually 8080). Default matches Railway.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
