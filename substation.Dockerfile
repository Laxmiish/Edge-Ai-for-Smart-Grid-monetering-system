FROM python:3.9-slim
WORKDIR /app
COPY ./substations /app/substations
# Install required packages
RUN pip install flask requests
CMD ["python", "substations/main.py"]
