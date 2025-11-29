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

# Expose the SSE port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:4000/sse')" || exit 1

# Run the FastMCP server with SSE transport
CMD ["uv", "run", "python", "server.py"]
