# AATMS Kafka Event Architecture

This document describes how Apache Kafka is integrated into the Advanced Traffic Monitoring System (AATMS) to provide a modular, cloud-ready event and alerting system.

## Architecture Overview

The system uses a Publish-Subscribe (Pub/Sub) model to decouple heavy machine learning inference from business logic (like sending emails and saving alerts).

1. **Kafka Broker & ZooKeeper (`docker-compose.yml`)**:
   - The messaging backbone. Runs locally via Docker.
   - Listens on port `9092`.

2. **The Producer (`backend/pipeline.py` & `backend/kafka_producer.py`)**:
   - The YOLOv8 + DeepSORT inference engine processes video frames.
   - When a vehicle crosses a line or enters a polygon, `produce_traffic_event()` broadcasts a JSON payload to the `traffic-events` Kafka topic.
   - Example Payload: `{"camera_id": "default", "vehicle_id": "car_15", "class_name": "car", "region_label": "zone-1"}`

3. **The Consumer (`backend/alert_service.py`)**:
   - A standalone Python daemon running independently of the web server.
   - Subscribes to the `traffic-events` topic.
   - Pulls user-defined **EventRules** from the PostgreSQL database.
   - Compares the incoming event against the rules (e.g., `IF class_name == truck AND region_label == no_parking`).
   - If matched, it generates an **AlertLog**, saves it to the database, and optionally triggers an email.

4. **The Frontend (`src/components/LiveMonitor.jsx`)**:
   - Users can define custom EventRules via the UI.
   - The UI polls the `AlertLog` table to display a live ticker of Security Alerts.

## How to Run

1. **Start Kafka**:
   Make sure Docker Desktop is running.
   ```bash
   docker-compose up -d
   ```

2. **Start the Alert Service**:
   Run the consumer in a separate terminal:
   ```bash
   cd backend
   python alert_service.py
   ```

3. **Start the Web Stack**:
   Start the FastAPI backend and React frontend as usual.

## Custom Event Rules

Rules are highly customizable JSON objects stored in the `event_rules` table. The `alert_service.py` evaluates all conditions specified in a rule. If an incoming Kafka event matches all specified keys and values, the alert is triggered.
