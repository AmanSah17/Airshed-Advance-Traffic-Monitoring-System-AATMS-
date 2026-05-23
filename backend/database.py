import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Amansah%401717@localhost:5432/aatms_db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Region(Base):
    __tablename__ = "regions"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String, default="default", index=True)
    label = Column(String, nullable=False)
    type = Column(String, nullable=False)  # "line" or "polygon"
    coordinates = Column(JSON, nullable=False)  # List of coordinates: [[x1, y1], [x2, y2], ...]
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class CrossingEvent(Base):
    __tablename__ = "crossing_events"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String, default="default", index=True)
    track_id = Column(Integer, nullable=False)
    vehicle_id = Column(String, nullable=False)  # class_name + track_id
    class_name = Column(String, nullable=False)
    direction = Column(String, nullable=False)  # "IN", "OUT", "CROSSED"
    region_label = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    confidence = Column(Float, nullable=True)

class VideoJob(Base):
    __tablename__ = "video_jobs"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    status = Column(String, default="idle")  # "idle", "processing", "completed", "error"
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserActivityLog(Base):
    __tablename__ = "user_activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String, nullable=True)
    activity_type = Column(String, nullable=False)  # "register", "login", "upload", "start_track", etc.
    details = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class ErrorLog(Base):
    __tablename__ = "error_logs"

    id = Column(Integer, primary_key=True, index=True)
    error_message = Column(String, nullable=False)
    stack_trace = Column(String, nullable=True)
    endpoint = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class SentEmail(Base):
    __tablename__ = "sent_emails"

    id = Column(Integer, primary_key=True, index=True)
    to_email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body = Column(String, nullable=False)
    verification_code = Column(String, nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="sent")

class CameraSource(Base):
    __tablename__ = "camera_sources"

    id = Column(String, primary_key=True, index=True) # e.g. "default"
    name = Column(String, nullable=False)
    latitude = Column(Float, default=28.6139)
    longitude = Column(Float, default=77.2090)
    video_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
    # Perform column migration
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE crossing_events ADD COLUMN IF NOT EXISTS region_label VARCHAR;"))
            conn.execute(text("ALTER TABLE regions ADD COLUMN IF NOT EXISTS latitude FLOAT;"))
            conn.execute(text("ALTER TABLE regions ADD COLUMN IF NOT EXISTS longitude FLOAT;"))
            conn.commit()
        except Exception as e:
            print(f"Migration error: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
