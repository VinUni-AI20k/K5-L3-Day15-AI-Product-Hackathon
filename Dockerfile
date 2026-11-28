# Môi trường chạy SkyBill cho cả nhóm: Python 3.12 + ONNX Runtime/OpenCV (OCR cục bộ, trọng số trong backend/weights/).
# Mã nguồn được mount từ máy (docker-compose.yml), nên eval/run-N.csv, traces/, cost/ ghi thẳng ra repo.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bản sao mã để image tự chạy được khi không mount (vd gửi image cho người khác).
COPY . .

ENV PYTHONUNBUFFERED=1 \
    SKYBILL_HOST=0.0.0.0 \
    SKYBILL_PORT=8080 \
    SKYBILL_NO_BROWSER=1

EXPOSE 8080
CMD ["python", "run.py"]
