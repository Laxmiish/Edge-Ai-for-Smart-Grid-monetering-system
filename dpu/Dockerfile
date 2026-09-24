FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install
COPY dpu/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create volume for local_db to persist data
VOLUME /app/dpu/data

# Copy source code
COPY dpu /app/dpu
# We also need to copy the local_db.py if it's referenced directly
# But wait, local_db.py is inside dpu/ so it's already copied.

# Models are kept in the root in the host machine.
# We will mount them into /app via docker-compose.
CMD ["python", "dpu/main.py"]
