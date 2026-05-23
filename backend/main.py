import os
import shutil
from typing import List, Optional
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Query, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import traceback
import logging
import math
import hashlib

from pydantic import BaseModel
from database import init_db, get_db, Region, CrossingEvent, VideoJob, User, UserActivityLog, ErrorLog, SentEmail, SessionLocal, CameraSource
from schemas import RegionCreate, RegionResponse, CrossingEventResponse, VideoJobResponse, UserRegister, UserLogin, UserResponse, TokenResponse, CameraSourceResponse
from pipeline import VideoProcessor
from auth import hash_password, verify_password, create_access_token, get_current_user
from cache import cache

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn")

app = FastAPI(title="AATMS Traffic Monitoring and Security API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Helper to log user activities
def log_user_activity(db: Session, user: Optional[User], activity_type: str, details: str):
    user_id = user.id if user else None
    username = user.username if user else "anonymous"
    log = UserActivityLog(
        user_id=user_id,
        username=username,
        activity_type=activity_type,
        details=details,
        timestamp=datetime.utcnow()
    )
    db.add(log)
    db.commit()

# Global Exception Handler to capture all unhandled errors and write them to ErrorLog table
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    db = SessionLocal()
    error_msg = str(exc)
    stack_trace = traceback.format_exc()
    endpoint = f"{request.method} {request.url.path}"
    
    logger.error(f"Global Exception caught: {error_msg}\n{stack_trace}")
    
    try:
        err_log = ErrorLog(
            error_message=error_msg,
            stack_trace=stack_trace,
            endpoint=endpoint,
            timestamp=datetime.utcnow()
        )
        db.add(err_log)
        db.commit()
    except Exception as db_err:
        logger.error(f"Failed to save error log to DB: {db_err}")
    finally:
        db.close()
        
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {error_msg}"}
    )

@app.on_event("startup")
def startup_event():
    logger.info("Initializing database schemas...")
    init_db()

# --- AUTHENTICATION ENDPOINTS ---

@app.post("/api/v1/auth/register", response_model=UserResponse)
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    # Check if email/username exists
    existing_email = db.query(User).filter(func.lower(User.email) == func.lower(payload.email)).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="A user with this email is already registered.")

    existing_username = db.query(User).filter(func.lower(User.username) == func.lower(payload.username)).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="A user with this username is already registered.")

    # Create user
    hashed = hash_password(payload.password)
    new_user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hashed,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Dispatch simulated verification email
    v_code = "AATMS-" + os.urandom(3).hex().upper()
    body = f"Hello {new_user.username},\n\nThank you for registering at AATMS. Your registration verification code is: {v_code}\n\nHappy Monitoring!\nIT Team, Airshed Professional Pvt. Ltd."
    
    simulated_email = SentEmail(
        to_email=new_user.email,
        subject="Welcome to AATMS - Registration Verification",
        body=body,
        verification_code=v_code,
        sent_at=datetime.utcnow(),
        status="sent"
    )
    db.add(simulated_email)
    db.commit()

    log_user_activity(db, new_user, "register", f"User registered successfully. Simulated email logged to DB.")
    return new_user

@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login_user(payload: UserLogin, db: Session = Depends(get_db)):
    # Try username or email matching
    user = db.query(User).filter(
        (func.lower(User.username) == func.lower(payload.username)) | 
        (func.lower(User.email) == func.lower(payload.username))
    ).first()
    
    if not user or not verify_password(payload.password, user.hashed_password):
        # Write unsuccessful login log
        log_user_activity(db, None, "login_failed", f"Failed login attempt for username/email: {payload.username}")
        raise HTTPException(status_code=401, detail="Invalid username, email, or password.")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="This account has been deactivated.")

    # Create Access Token
    access_token = create_access_token(data={"sub": user.email})
    log_user_activity(db, user, "login", "Logged in successfully.")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@app.get("/api/v1/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# --- SYSTEM LOGS & AUDITS ---

@app.get("/api/v1/system/logs")
def get_activity_logs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserActivityLog).order_by(UserActivityLog.timestamp.desc()).limit(100).all()

@app.get("/api/v1/system/errors")
def get_error_logs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(ErrorLog).order_by(ErrorLog.timestamp.desc()).limit(50).all()

@app.get("/api/v1/system/emails")
def get_sent_emails(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(SentEmail).order_by(SentEmail.sent_at.desc()).limit(20).all()


# --- VIDEO & MONITORING ENDPOINTS ---

@app.post("/api/v1/upload", response_model=VideoJobResponse)
async def upload_video(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not file.filename.endswith(('.mp4', '.avi', '.mov', '.mkv')):
        raise HTTPException(status_code=400, detail="Invalid video format. Only MP4, AVI, MOV, and MKV are supported.")

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save video: {str(e)}")

    job = VideoJob(filename=file.filename, filepath=file_path, status="idle")
    db.add(job)
    db.commit()
    db.refresh(job)
    
    log_user_activity(db, current_user, "upload", f"Uploaded video: {file.filename}")
    return job

@app.get("/api/v1/jobs", response_model=List[VideoJobResponse])
def get_jobs(db: Session = Depends(get_db)):
    return db.query(VideoJob).order_by(VideoJob.created_at.desc()).all()

@app.get("/api/v1/frame")
def get_first_frame(video_source: str):
    import cv2
    import base64
    
    if not video_source:
        raise HTTPException(status_code=400, detail="Video source path is empty")
        
    if not video_source.startswith("rtsp://") and not os.path.exists(video_source):
        possible_path = os.path.join(UPLOAD_DIR, video_source)
        if os.path.exists(possible_path):
            video_source = possible_path
        else:
            raise HTTPException(status_code=404, detail=f"Video source not found: {video_source}")
            
    cap = cv2.VideoCapture(video_source)
    if not cap.isOpened():
        raise HTTPException(status_code=500, detail=f"Failed to open video source: {video_source}")
        
    ret, frame = cap.read()
    cap.release()
    if not ret:
        raise HTTPException(status_code=500, detail="Could not read the first frame of the video")
        
    _, buffer = cv2.imencode('.jpg', frame)
    frame_base64 = base64.b64encode(buffer).decode('utf-8')
    return {
        "frame": f"data:image/jpeg;base64,{frame_base64}",
        "width": frame.shape[1],
        "height": frame.shape[0]
    }

@app.post("/api/v1/regions", response_model=List[RegionResponse])
def save_regions(
    regions: List[RegionCreate], 
    camera_id: str = "default", 
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if type:
        db.query(Region).filter(Region.camera_id == camera_id, Region.type == type).delete()
    else:
        db.query(Region).filter(Region.camera_id == camera_id).delete()
    db.commit()

    db_regions = []
    for r in regions:
        db_reg = Region(
            camera_id=camera_id,
            label=r.label,
            type=r.type,
            coordinates=r.coordinates
        )
        db.add(db_reg)
        db_regions.append(db_reg)
    
    db.commit()
    for db_reg in db_regions:
        db.refresh(db_reg)
        
    # Invalidate Redis cache
    cache.delete(f"analytics_summary_{camera_id}")
    log_user_activity(db, current_user, "configure_roi", f"Configured {len(regions)} ROI regions for camera: {camera_id}")
    return db_regions

@app.get("/api/v1/regions", response_model=List[RegionResponse])
def get_regions(
    camera_id: str = "default", 
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Region).filter(Region.camera_id == camera_id)
    if type:
        query = query.filter(Region.type == type)
    return query.all()

# GET ANALYTICS: Uses Redis caching wrapper (falls back to thread-safe local cache)
@app.get("/api/v1/analytics/summary")
def get_analytics_summary(camera_id: str = "default", db: Session = Depends(get_db)):
    cache_key = f"analytics_summary_{camera_id}"
    
    # Try fetching from Redis Cache
    cached_data = cache.get(cache_key)
    if cached_data:
        logger.info(f"Cache HIT for key: {cache_key}")
        return cached_data
        
    logger.info(f"Cache MISS for key: {cache_key}. Executing SQL query reports...")

    total_count = db.query(func.count(CrossingEvent.id)).filter(CrossingEvent.camera_id == camera_id).scalar()
    
    class_counts = db.query(
        CrossingEvent.class_name, func.count(CrossingEvent.id)
    ).filter(CrossingEvent.camera_id == camera_id).group_by(CrossingEvent.class_name).all()
    
    direction_counts = db.query(
        CrossingEvent.direction, func.count(CrossingEvent.id)
    ).filter(CrossingEvent.camera_id == camera_id).group_by(CrossingEvent.direction).all()

    recent_events = db.query(CrossingEvent).filter(
        CrossingEvent.camera_id == camera_id
    ).order_by(CrossingEvent.timestamp.desc()).limit(50).all()

    time_cutoff = datetime.utcnow() - timedelta(hours=24)
    events_last_24h = db.query(
        CrossingEvent.timestamp, CrossingEvent.class_name
    ).filter(
        CrossingEvent.camera_id == camera_id,
        CrossingEvent.timestamp >= time_cutoff
    ).all()
    
    time_series = {}
    for event in events_last_24h:
        dt = event.timestamp
        rounded_dt = dt - timedelta(minutes=dt.minute % 5, seconds=dt.second, microseconds=dt.microsecond)
        time_str = rounded_dt.strftime("%H:%M")
        
        if time_str not in time_series:
            time_series[time_str] = {}
        time_series[time_str][event.class_name] = time_series[time_str].get(event.class_name, 0) + 1

    formatted_time_series = []
    for t_str, counts in sorted(time_series.items()):
        row = {"time": t_str}
        row.update(counts)
        formatted_time_series.append(row)

    summary_result = {
        "total_vehicles": total_count,
        "class_distribution": {item[0]: item[1] for item in class_counts},
        "direction_distribution": {item[0]: item[1] for item in direction_counts},
        "recent_logs": [
            {
                "id": ev.id,
                "vehicle_id": ev.vehicle_id,
                "class_name": ev.class_name,
                "direction": ev.direction,
                "timestamp": ev.timestamp.isoformat(),
                "confidence": ev.confidence
            }
            for ev in recent_events
        ],
        "time_series": formatted_time_series
    }

    # Store in Redis cache for 15 seconds
    cache.set(cache_key, summary_result, expire=15)
    return summary_result

@app.delete("/api/v1/analytics/clear")
def clear_analytics(
    camera_id: str = "default", 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(CrossingEvent).filter(CrossingEvent.camera_id == camera_id).delete()
    db.commit()
    
    # Invalidate Cache
    cache.delete(f"analytics_summary_{camera_id}")
    log_user_activity(db, current_user, "clear_logs", f"Cleared crossing events for camera: {camera_id}")
    return {"status": "success", "message": "Analytics database cleared."}

@app.get("/api/v1/test/lines")
def test_lines_endpoint(db: Session = Depends(get_db)):
    # 1. Look for a video file
    job = db.query(VideoJob).first()
    video_path = job.filepath if job else None
    if not video_path:
        if os.path.exists(UPLOAD_DIR):
            files = [os.path.join(UPLOAD_DIR, f) for f in os.listdir(UPLOAD_DIR) if f.endswith(('.mp4', '.avi', '.mov', '.mkv'))]
            if files:
                video_path = files[0]
    
    if not video_path:
        raise HTTPException(status_code=400, detail="No video file found for testing. Please upload a video first.")
        
    # 2. Check if a line region exists, if not create one
    line_region = db.query(Region).filter(Region.camera_id == "default", Region.type == "line").first()
    if not line_region:
        line_region = Region(
            camera_id="default",
            label="Default Smoke Test Line",
            type="line",
            coordinates=[[0.1, 0.5], [0.9, 0.5]]
        )
        db.add(line_region)
        db.commit()
        db.refresh(line_region)
        
    # 3. Instantiate VideoProcessor with only lines service
    try:
        model_path = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
        processor = VideoProcessor(
            video_path=video_path,
            model_path=model_path,
            db=db,
            camera_id="default",
            frame_skip=1,
            tracker_type="deepsort",
            active_services=["lines"]
        )
        
        frames_processed = 0
        events_captured = []
        generator = processor.process()
        for i in range(50):
            try:
                data = next(generator)
                if data.get("events"):
                    events_captured.extend(data["events"])
                frames_processed += 1
            except StopIteration:
                break
                
        return {
            "status": "success",
            "message": "Line intersection smoke test completed successfully.",
            "video_tested": video_path,
            "region_tested": line_region.label,
            "frames_processed": frames_processed,
            "events_captured_count": len(events_captured),
            "events": events_captured
        }
    except Exception as e:
        logger.error(f"Line smoke test error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Line smoke test failed: {str(e)}")

@app.get("/api/v1/test/polygons")
def test_polygons_endpoint(db: Session = Depends(get_db)):
    # 1. Look for a video file
    job = db.query(VideoJob).first()
    video_path = job.filepath if job else None
    if not video_path:
        if os.path.exists(UPLOAD_DIR):
            files = [os.path.join(UPLOAD_DIR, f) for f in os.listdir(UPLOAD_DIR) if f.endswith(('.mp4', '.avi', '.mov', '.mkv'))]
            if files:
                video_path = files[0]
    
    if not video_path:
        raise HTTPException(status_code=400, detail="No video file found for testing. Please upload a video first.")
        
    # 2. Check if a polygon region exists, if not create one
    poly_region = db.query(Region).filter(Region.camera_id == "default", Region.type == "polygon").first()
    if not poly_region:
        poly_region = Region(
            camera_id="default",
            label="Default Smoke Test Polygon",
            type="polygon",
            coordinates=[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]
        )
        db.add(poly_region)
        db.commit()
        db.refresh(poly_region)
        
    # 3. Instantiate VideoProcessor with only polygons service
    try:
        model_path = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
        processor = VideoProcessor(
            video_path=video_path,
            model_path=model_path,
            db=db,
            camera_id="default",
            frame_skip=1,
            tracker_type="deepsort",
            active_services=["polygons"]
        )
        
        frames_processed = 0
        events_captured = []
        generator = processor.process()
        for i in range(50):
            try:
                data = next(generator)
                if data.get("events"):
                    events_captured.extend(data["events"])
                frames_processed += 1
            except StopIteration:
                break
                
        return {
            "status": "success",
            "message": "Polygon presence smoke test completed successfully.",
            "video_tested": video_path,
            "region_tested": poly_region.label,
            "frames_processed": frames_processed,
            "events_captured_count": len(events_captured),
            "events": events_captured
        }
    except Exception as e:
        logger.error(f"Polygon smoke test error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Polygon smoke test failed: {str(e)}")

@app.websocket("/api/v1/ws/stream")
async def websocket_endpoint(
    websocket: WebSocket,
    video_source: str = Query(...),
    camera_id: str = Query("default"),
    model_path: str = Query(None),
    frame_skip: int = Query(1),
    tracker_type: str = Query("deepsort"),
    services: str = Query("lines,polygons"),
    token: str = Query(None)  # Pass auth token for tracking auditing
):
    await websocket.accept()
    
    db = SessionLocal()
    
    # Parse active services
    active_services = [s.strip() for s in services.split(",") if s.strip()]

    # Authenticate socket user
    current_user = None
    if token:
        try:
            from auth import SECRET_KEY, ALGORITHM
            import jwt
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email = payload.get("sub")
            current_user = db.query(User).filter(User.email == email).first()
        except Exception:
            pass

    if not model_path:
        model_path = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")

    if not video_source.startswith("rtsp://") and not os.path.exists(video_source):
        possible_path = os.path.join(UPLOAD_DIR, video_source)
        if os.path.exists(possible_path):
            video_source = possible_path
        else:
            await websocket.send_json({"type": "error", "message": f"Video source not found: {video_source}"})
            await websocket.close()
            db.close()
            return

    job = db.query(VideoJob).filter(VideoJob.filepath == video_source).first()
    if job:
        job.status = "processing"
        db.commit()

    log_user_activity(db, current_user, "start_track", f"Started tracking on video: {video_source}")

    try:
        processor = VideoProcessor(
            video_path=video_source,
            model_path=model_path,
            db=db,
            camera_id=camera_id,
            frame_skip=frame_skip,
            tracker_type=tracker_type,
            active_services=active_services
        )
        
        for data in processor.process():
            try:
                await websocket.send_json(data)
            except WebSocketDisconnect:
                break
            except Exception:
                break
                
        if job:
            db.refresh(job)
            job.status = "completed"
            db.commit()
            
        log_user_activity(db, current_user, "stop_track", f"Finished tracking video source: {video_source}")
            
    except Exception as e:
        import traceback
        error_msg = f"Error processing stream: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        
        # Log to ErrorLog table
        try:
            err_log = ErrorLog(
                error_message=f"WS pipeline error: {str(e)}",
                stack_trace=traceback.format_exc(),
                endpoint="WS /api/v1/ws/stream",
                timestamp=datetime.utcnow()
            )
            db.add(err_log)
            db.commit()
        except Exception as db_err:
            logger.error(f"Failed logging WS error to database: {db_err}")

        if job:
            db.refresh(job)
            job.status = "error"
            db.commit()
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass
    finally:
        db.close()
        try:
            await websocket.close()
        except:
            pass

class CameraSourceCreate(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    video_url: Optional[str] = None

@app.get("/api/v1/analytics/heatmap")
def get_analytics_heatmap(db: Session = Depends(get_db)):
    events = db.query(CrossingEvent).all()
    cameras = db.query(CameraSource).all()
    camera_map = {c.id: c for c in cameras}
    
    features = []
    for ev in events:
        cam = camera_map.get(ev.camera_id)
        lat = cam.latitude if cam else 28.6139
        lng = cam.longitude if cam else 77.2090
        
        # Generate slight offset based on region_label hash
        if ev.region_label:
            h_val = int(hashlib.md5(ev.region_label.encode('utf-8')).hexdigest(), 16)
            angle = (h_val % 360) * (math.pi / 180.0)
            dist = 0.00008 + ((ev.track_id % 7) * 0.00003)
            lat += dist * math.sin(angle)
            lng += dist * math.cos(angle)
            
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat]
            },
            "properties": {
                "id": ev.id,
                "camera_id": ev.camera_id,
                "track_id": ev.track_id,
                "class_name": ev.class_name,
                "direction": ev.direction,
                "region_label": ev.region_label or "Unknown",
                "timestamp": ev.timestamp.isoformat(),
                "confidence": ev.confidence
            }
        })
        
    return {
        "type": "FeatureCollection",
        "features": features
    }

@app.get("/api/v1/models")
def get_available_models():
    models_dir = r"D:\gemma4\AATMS\backend\models"
    available = ["yolov8n.pt", "yolov8s.pt", "yolov8m.pt"]
    
    if os.path.exists(models_dir):
        files = os.listdir(models_dir)
        for f in files:
            if f.endswith(('.pt', '.tflite')) and f not in available:
                available.append(f)
    return available

@app.get("/api/v1/cameras", response_model=List[CameraSourceResponse])
def get_cameras(db: Session = Depends(get_db)):
    return db.query(CameraSource).all()

@app.post("/api/v1/cameras", response_model=CameraSourceResponse)
def save_camera(camera: CameraSourceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_cam = db.query(CameraSource).filter(CameraSource.id == camera.id).first()
    if db_cam:
        db_cam.name = camera.name
        db_cam.latitude = camera.latitude
        db_cam.longitude = camera.longitude
        db_cam.video_url = camera.video_url
    else:
        db_cam = CameraSource(
            id=camera.id,
            name=camera.name,
            latitude=camera.latitude,
            longitude=camera.longitude,
            video_url=camera.video_url
        )
        db.add(db_cam)
    db.commit()
    db.refresh(db_cam)
    
    log_user_activity(db, current_user, "configure_camera", f"Configured camera source: {camera.id} (Lat: {camera.latitude}, Lng: {camera.longitude})")
    return db_cam

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
