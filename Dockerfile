# TAMI: Node (frontend) + Python (backend)
# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Run backend with built frontend
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./
# Install in small batches to avoid OOM (Railway free tier has limited build memory)
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir fastapi "uvicorn>=0.32.0" python-dotenv pydantic pydantic-settings
RUN pip install --no-cache-dir sqlalchemy aiosqlite python-multipart jinja2 httpx
RUN pip install --no-cache-dir anthropic python-docx
RUN pip install --no-cache-dir asyncpg
COPY backend/ ./
COPY --from=frontend /app/frontend/dist ./../frontend/dist
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
