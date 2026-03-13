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
# Install in stages to avoid OOM (exit 137) on Railway
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir fastapi uvicorn sqlalchemy aiosqlite python-dotenv pydantic pydantic-settings python-multipart jinja2 httpx
RUN pip install --no-cache-dir anthropic python-docx
RUN pip install --no-cache-dir --prefer-binary "asyncpg>=0.29.0" "passlib[bcrypt]>=1.7.4" "python-jose[cryptography]>=3.3.0"
COPY backend/ ./
COPY --from=frontend /app/frontend/dist ./../frontend/dist
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
