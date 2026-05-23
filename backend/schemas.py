from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class RegionBase(BaseModel):
    camera_id: str = "default"
    label: str
    type: str  # "line" or "polygon"
    coordinates: List[List[float]]  # List of coordinates [[x, y], ...]
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class RegionCreate(RegionBase):
    pass

class RegionResponse(RegionBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

class CrossingEventBase(BaseModel):
    camera_id: str
    track_id: int
    vehicle_id: str
    class_name: str
    direction: str
    region_label: Optional[str] = None
    timestamp: datetime
    confidence: Optional[float] = None

class CrossingEventResponse(CrossingEventBase):
    id: int

    class Config:
        orm_mode = True
        from_attributes = True

class VideoJobBase(BaseModel):
    filename: str
    filepath: str
    status: str

class VideoJobResponse(VideoJobBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

class UserRegister(BaseModel):
    email: str
    username: str
    password: str

class UserLogin(BaseModel):
    username: str  # Can be username or email
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class CameraSourceResponse(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    video_url: Optional[str] = None
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

