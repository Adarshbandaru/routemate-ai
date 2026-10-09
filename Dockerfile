FROM python:3.11-slim

WORKDIR /app

# Copy package setup and source code
COPY pyproject.toml ./
COPY src/ ./src/
COPY experiments/ ./experiments/

# Install RouteMate in editable mode
RUN pip install --no-cache-dir -e .

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["routemate-api", "--host", "0.0.0.0", "--port", "8000"]
