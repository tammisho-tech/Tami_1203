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
# Install packages (passlib/python-jose removed - OOM on Railway, unused in current code)
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/dist ./../frontend/dist
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
