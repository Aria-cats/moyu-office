FROM python:3.12-slim
WORKDIR /app
COPY server.py index.html app.js style.css ./
RUN useradd --uid 10001 --create-home moyu && mkdir /data && chown moyu /data
USER moyu
ENV PORT=8765 MOYU_DB=/data/moyu.sqlite3 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8765
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/healthz', timeout=3)"
CMD ["python", "server.py"]
