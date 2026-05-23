import numpy as np
from numba import jit
import logging

logger = logging.getLogger(__name__)

@jit(nopython=True)
def compute_iou(box1, box2):
    """
    Compute Intersection over Union (IoU) of two bounding boxes.
    box: [x1, y1, x2, y2]
    """
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    
    union = area1 + area2 - intersection
    if union <= 0.0:
        return 0.0
    return intersection / union

@jit(nopython=True)
def compute_iou_cost_matrix(tracks_boxes, detections_boxes):
    """
    Compute cost matrix (1.0 - IoU) for tracks and detections.
    """
    n = len(tracks_boxes)
    m = len(detections_boxes)
    cost_matrix = np.zeros((n, m))
    for i in range(n):
        for j in range(m):
            cost_matrix[i, j] = 1.0 - compute_iou(tracks_boxes[i], detections_boxes[j])
    return cost_matrix

@jit(nopython=True)
def greedy_match(cost_matrix, threshold):
    """
    Greedy assignment matching between tracks and detections based on cost matrix.
    threshold: maximum allowable cost (e.g. 1.0 - min_iou)
    """
    n, m = cost_matrix.shape
    matches = []
    unmatched_tracks = list(range(n))
    unmatched_detections = list(range(m))
    
    # Simple sort index list by cost
    flat_indices = np.argsort(cost_matrix.ravel())
    
    used_rows = np.zeros(n, dtype=np.int32)
    used_cols = np.zeros(m, dtype=np.int32)
    
    for idx in flat_indices:
        r = idx // m
        c = idx % m
        
        if cost_matrix[r, c] > threshold:
            break
            
        if used_rows[r] == 0 and used_cols[c] == 0:
            used_rows[r] = 1
            used_cols[c] = 1
            matches.append((r, c))
            
    # Rebuild unmatched lists
    unmatched_t = []
    for i in range(n):
        if used_rows[i] == 0:
            unmatched_t.append(i)
            
    unmatched_d = []
    for j in range(m):
        if used_cols[j] == 0:
            unmatched_d.append(j)
            
    return matches, unmatched_t, unmatched_d

class Track:
    def __init__(self, box, class_id, track_id, confidence):
        self.box = np.array(box, dtype=np.float32)  # [x1, y1, x2, y2]
        self.velocity = np.zeros(4, dtype=np.float32)  # [vx1, vy1, vx2, vy2]
        self.class_id = class_id
        self.track_id = track_id
        self.confidence = confidence
        self.age = 0
        self.hits = 1
        self.time_since_update = 0

    def predict(self):
        # Update box based on velocity
        self.box += self.velocity
        self.time_since_update += 1
        self.age += 1

    def update(self, detection_box, confidence, alpha=0.6, beta=0.3):
        det_box = np.array(detection_box, dtype=np.float32)
        
        # Calculate velocity: difference between current detection and previous box
        new_velocity = det_box - self.box
        self.velocity = beta * new_velocity + (1.0 - beta) * self.velocity
        
        # Smooth box position using exponential moving average
        self.box = alpha * det_box + (1.0 - alpha) * self.box
        self.confidence = confidence
        self.time_since_update = 0
        self.hits += 1

class DeepSORTTracker:
    def __init__(self, max_age=15, min_hits=2, iou_threshold=0.6):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold  # cost = 1 - IoU, so 0.6 cost threshold means min IoU of 0.4
        self.tracks = []
        self.track_id_counter = 1

    def update(self, detections):
        """
        Update tracker with new frame detections.
        detections: List of dicts or list of [x1, y1, x2, y2, confidence, class_id]
        Returns list of active tracks.
        """
        # 1. Predict next box for all existing tracks
        for track in self.tracks:
            track.predict()
            
        # Parse detections format
        dets_boxes = []
        dets_metadata = []
        for det in detections:
            # Check format
            if isinstance(det, dict):
                dets_boxes.append(det["box"])
                dets_metadata.append((det["class_id"], det["confidence"]))
            else:
                # Assuming list/array: [x1, y1, x2, y2, confidence, class_id]
                dets_boxes.append(det[:4])
                dets_metadata.append((int(det[5]), det[4]))
                
        # 2. Match tracks and detections
        if len(self.tracks) > 0 and len(dets_boxes) > 0:
            tracks_boxes = np.array([t.box for t in self.tracks], dtype=np.float32)
            detections_boxes = np.array(dets_boxes, dtype=np.float32)
            
            # Compute cost matrix
            cost_matrix = compute_iou_cost_matrix(tracks_boxes, detections_boxes)
            
            # Match
            matches, unmatched_tracks, unmatched_detections = greedy_match(cost_matrix, self.iou_threshold)
        else:
            matches = []
            unmatched_tracks = list(range(len(self.tracks)))
            unmatched_detections = list(range(len(dets_boxes)))
            
        # 3. Update matched tracks
        for t_idx, d_idx in matches:
            det_box = dets_boxes[d_idx]
            cls_id, conf = dets_metadata[d_idx]
            self.tracks[t_idx].update(det_box, conf)
            
        # 4. Handle unmatched tracks
        # Tracks that weren't matched increment time_since_update in predict()
        # Delete tracks that have exceeded max_age
        self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]
        
        # 5. Create new tracks for unmatched detections
        for d_idx in unmatched_detections:
            det_box = dets_boxes[d_idx]
            cls_id, conf = dets_metadata[d_idx]
            new_track = Track(det_box, cls_id, self.track_id_counter, conf)
            self.tracks.append(new_track)
            self.track_id_counter += 1
            
        # 6. Filter tracks to return to pipeline
        active_tracks = []
        for t in self.tracks:
            # Must meet minimum hits or be very fresh
            if t.hits >= self.min_hits and t.time_since_update == 0:
                active_tracks.append(t)
                
        return active_tracks
