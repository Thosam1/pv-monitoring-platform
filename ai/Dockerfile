FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies for psycopg2 and uv
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Copy project files for dependency resolution
COPY pyproject.toml uv.lock ./

# Install dependencies (without dev dependencies)
RUN uv sync --frozen --no-dev

# Copy application code
COPY . .

# Expose the HTTP API port
EXPOSE 4000

# Health check - use HTTP API endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4000/api/health || exit 1

# Run the HTTP API server
CMD ["uv", "run", "python", "server.py"]
