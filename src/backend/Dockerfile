FROM python:3.11-slim

WORKDIR /app

# Install only minimal dependencies for Railway
RUN pip install --no-cache-dir fastapi uvicorn[standard] pydantic httpx pyjwt

# Copy only the minimal app
COPY api/app_railway.py ./api/app_railway.py

# Railway uses dynamic PORT
ENV PORT=8000
EXPOSE $PORT

# Start minimal app
CMD uvicorn api.app_railway:app --host 0.0.0.0 --port $PORT
