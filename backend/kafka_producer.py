import json
import logging
from confluent_kafka import Producer

logger = logging.getLogger(__name__)

KAFKA_BROKER = "localhost:9092"

class KafkaEventProducer:
    def __init__(self, broker=KAFKA_BROKER):
        self.broker = broker
        self.producer = None
        try:
            self.producer = Producer({'bootstrap.servers': self.broker})
            logger.info(f"Connected to Kafka broker at {self.broker}")
        except Exception as e:
            logger.error(f"Failed to connect to Kafka broker {self.broker}: {e}")

    def delivery_report(self, err, msg):
        if err is not None:
            logger.error(f"Message delivery failed: {err}")
        else:
            logger.debug(f"Message delivered to {msg.topic()} [{msg.partition()}]")

    def send_event(self, topic: str, event_data: dict):
        if not self.producer:
            return
            
        try:
            msg = json.dumps(event_data)
            self.producer.produce(topic, msg.encode('utf-8'), callback=self.delivery_report)
            self.producer.poll(0)
        except Exception as e:
            logger.error(f"Failed to send event to Kafka: {e}")

    def flush(self):
        if self.producer:
            self.producer.flush()

producer_instance = KafkaEventProducer()

def produce_traffic_event(event_data: dict):
    producer_instance.send_event("traffic-events", event_data)
