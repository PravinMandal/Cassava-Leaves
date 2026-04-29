# CassavaGuard — Dockerfile (CPU-only PyTorch for Railway/Render)
FROM python:3.11-slim

# System deps + git-lfs (needed to fetch the real model binary from GitHub LFS)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 git git-lfs \
    && git lfs install \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install CPU-only PyTorch FIRST (separate layer for caching) ──
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    torchvision==0.17.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# ── Install remaining deps ──
RUN pip install --no-cache-dir \
    "numpy<2" \
    fastapi \
    "uvicorn[standard]" \
    Pillow \
    python-multipart

# ── Copy app files ──
COPY app.py .
COPY static/ ./static/

# ── Handle model: copy it, then resolve LFS pointer if needed ──
COPY model/ ./model/
COPY .git/ ./.git/
RUN cd /app && git lfs pull --include="model/*" || true
RUN rm -rf .git

EXPOSE 8080

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
