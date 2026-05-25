import json
import logging
import time
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from confluent_kafka import Consumer, KafkaError, KafkaException
from database import SessionLocal, EventRule, AlertLog
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

KAFKA_BROKER = "localhost:9092"
TOPIC = "traffic-events"
GROUP_ID = "aatms-alert-group"

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")

# State for tracking time spent in regions: { "vehicle_id_region": entry_timestamp }
active_vehicles = {}

def send_email_alert(recipient: str, subject: str, message: str):
    if not EMAIL_USER or not EMAIL_PASS:
        logger.warning("SMTP credentials not found. Cannot send email.")
        return False
        
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_USER
        msg['To'] = recipient
        msg['Subject'] = subject
        msg.attach(MIMEText(message, 'plain'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()
        logger.info(f"==> [EMAIL SENT] To: {recipient} | Subject: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient}: {e}")
        return False

def evaluate_rules(event: dict):
    db = SessionLocal()
    try:
        camera_id = event.get("camera_id", "default")
        vehicle_id = event.get("vehicle_id")
        region_label = event.get("region_label")
        direction = event.get("direction")
        
        # Track Time Spent in Regions
        time_spent_seconds = 0
        if direction == "IN":
            active_vehicles[f"{vehicle_id}_{region_label}"] = time.time()
        elif direction == "OUT":
            entry_time = active_vehicles.pop(f"{vehicle_id}_{region_label}", None)
            if entry_time:
                time_spent_seconds = time.time() - entry_time
        
        rules = db.query(EventRule).filter(EventRule.camera_id == camera_id).all()
        
        for rule in rules:
            conditions = rule.conditions
            match = True
            
            # Simple rule engine: all conditions in JSON must match the event
            for key, val in conditions.items():
                if key == "event_type":
                    if val == "Time Spent" and direction != "OUT":
                        match = False
                    elif val == "Line Crossing" and direction not in ["CROSSED", "IN", "OUT"]:
                        pass
                    continue
                    
                if key == "min_time_seconds":
                    if time_spent_seconds < float(val):
                        match = False
                        break
                    continue
                    
                event_val = event.get(key)
                if key == "class_name" and val == "heavy-duty-truck" and event_val == "truck":
                    # Allow 'truck' from standard YOLO to match 'heavy-duty-truck' rule
                    pass
                elif event_val != val:
                    match = False
                    break
                    
            if match:
                logger.info(f"Anomaly detected! Rule matched: {rule.name}")
                msg = f"Alert: Rule '{rule.name}' triggered by {vehicle_id} in {region_label}."
                if time_spent_seconds > 0:
                    msg += f" Time spent: {time_spent_seconds:.1f} seconds."
                
                # Write to AlertLog
                alert = AlertLog(
                    rule_id=rule.id,
                    camera_id=camera_id,
                    message=msg,
                    event_data=event,
                    action_taken="Logged to Database",
                    timestamp=datetime.utcnow()
                )
                
                if rule.email_alert:
                    success = send_email_alert("amansah1717@gmail.com", f"AATMS Alert: {rule.name}", msg)
                    alert.action_taken = "Logged & Email Sent" if success else "Logged (Email Failed)"
                    
                db.add(alert)
                db.commit()
    except Exception as e:
        logger.error(f"Error evaluating rules: {e}")
    finally:
        db.close()

def main():
    consumer = Consumer({
        'bootstrap.servers': KAFKA_BROKER,
        'group.id': GROUP_ID,
        'auto.offset.reset': 'latest'
    })
    
    try:
        consumer.subscribe([TOPIC])
        logger.info(f"Alert Service started. Listening on Kafka topic: {TOPIC}")
        
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                else:
                    raise KafkaException(msg.error())
                    
            event_str = msg.value().decode('utf-8')
            try:
                event_data = json.loads(event_str)
                evaluate_rules(event_data)
            except json.JSONDecodeError:
                logger.error("Failed to decode JSON event")
                
    except KeyboardInterrupt:
        logger.info("Aborted by user")
    except Exception as e:
        logger.error(f"Kafka Consumer Error: {e}")
    finally:
        consumer.close()
        logger.info("Kafka consumer closed.")

if __name__ == "__main__":
    # Wait for Kafka to be ready
    time.sleep(5)
    main()
