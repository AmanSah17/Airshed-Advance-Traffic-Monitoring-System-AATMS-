import cv2
import numpy as np
import base64
import os
from datetime import datetime
from ultralytics import YOLO
import supervision as sv
from shapely.geometry import Polygon as ShapelyPolygon, Point as ShapelyPoint
from sqlalchemy.orm import Session
from database import CrossingEvent, Region
from cache import cache
from deepsort import DeepSORTTracker
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Distinct BGR color palette for up to 10 regions (used for visual annotation)
REGION_COLORS_BGR = [
    (16, 185, 129),   # emerald
    (245, 158, 11),   # amber
    (239, 68, 68),    # rose
    (139, 92, 246),   # violet
    (6, 182, 212),    # cyan
    (249, 115, 22),   # orange
    (236, 72, 153),   # pink
    (132, 204, 22),   # lime
    (59, 130, 246),   # blue
    (168, 85, 247),   # purple
]


def intersect(A, B, C, D):
    """
    Check if line segment AB intersects with line segment CD.
    A, B are endpoints of the region line: [x, y]
    C, D are previous and current bottom-centre positions of the vehicle: (x, y)
    """
    def ccw(p1, p2, p3):
        return (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0])
    return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)


def get_bottom_center(bbox):
    """
    Calculate lower bounding box centre: bbox = [x1, y1, x2, y2]
    """
    return ((bbox[0] + bbox[2]) / 2.0, bbox[3])


class VideoProcessor:
    def __init__(
        self,
        video_path: str,
        model_path: str,
        db: Session,
        camera_id: str = "default",
        frame_skip: int = 1,
        tracker_type: str = "deepsort",
        active_services: list = None
    ):
        self.video_path = video_path
        self.db = db
        self.camera_id = camera_id
        self.frame_skip = frame_skip
        self.tracker_type = tracker_type.lower()

        # ── Model resolution ────────────────────────────────────────────────
        resolved_model_path = model_path
        if not os.path.isabs(model_path):
            models_dir = r"D:\gemma4\AATMS\backend\models"
            possible_path = os.path.join(models_dir, model_path)
            if os.path.exists(possible_path):
                resolved_model_path = possible_path
            else:
                resolved_model_path = "yolov8n.pt"

        if resolved_model_path.endswith('.tflite'):
            logger.warning("TFLite not supported on Python 3.13. Falling back to edge-quantised model.")
            resolved_model_path = os.path.join(
                r"D:\gemma4\AATMS\backend\models",
                "AATMS_full_edge_quantization_192x192_mark002.pt"
            )
            if not os.path.exists(resolved_model_path):
                resolved_model_path = "yolov8n.pt"

        logger.info(f"Initialising YOLO model: {resolved_model_path} on CUDA.")
        try:
            self.model = YOLO(resolved_model_path)
        except Exception as e:
            logger.error(f"Error loading model {e}. Falling back to yolov8n.pt")
            self.model = YOLO("yolov8n.pt")
        self.model.to("cuda")

        # ── Region loading (FIX: removed .limit(6), raised to 50) ───────────
        if active_services is None:
            active_services = ["lines", "polygons"]

        query = db.query(Region).filter(Region.camera_id == camera_id)
        type_filters = []
        if "lines" in active_services:
            type_filters.append("line")
        if "polygons" in active_services:
            type_filters.append("polygon")

        if type_filters:
            query = query.filter(Region.type.in_(type_filters))
        else:
            query = query.filter(Region.id == -1)

        self.db_regions = query.limit(50).all()   # FIX: was .limit(6) — raised to 50
        self.regions = []
        logger.info(f"Loaded {len(self.db_regions)} regions ({active_services}) from PostgreSQL.")

        if len(self.db_regions) > 6:
            logger.warning(
                f"⚠️  {len(self.db_regions)} regions loaded — pipeline will evaluate ALL of them. "
                "Ensure this is intentional."
            )

        # ── Tracker init ────────────────────────────────────────────────────
        if self.tracker_type == "deepsort":
            self.ds_tracker = DeepSORTTracker(max_age=25, min_hits=2, iou_threshold=0.6)
            logger.info("Initialised Custom Numba-compiled DeepSORT Tracker.")
        else:
            logger.info(f"Using Ultralytics native tracker: {self.tracker_type}")

        # ── Supervision Annotators ───────────────────────────────────────────
        self.box_annotator = sv.BoxAnnotator()
        self.label_annotator = sv.LabelAnnotator(text_position=sv.Position.TOP_LEFT)
        self.trace_annotator = sv.TraceAnnotator(position=sv.Position.BOTTOM_CENTER, trace_length=30)

    # ─────────────────────────────────────────────────────────────────────────
    def _scale_regions(self, width: int, height: int):
        """Scale normalised coordinates (0–1) to video resolution."""
        self.regions = []
        for idx, r in enumerate(self.db_regions):
            scaled_coords = [[pt[0] * width, pt[1] * height] for pt in r.coordinates]
            region_dict = {
                "id": r.id,
                "label": r.label,
                "type": r.type,
                "raw_coords": scaled_coords,
                "color_idx": idx % len(REGION_COLORS_BGR),
            }
            if r.type == "polygon":
                poly_array = np.array(scaled_coords, dtype=np.int32)
                region_dict["sv_zone"] = sv.PolygonZone(
                    polygon=poly_array,
                    triggering_anchors=[sv.Position.BOTTOM_CENTER]
                )
            self.regions.append(region_dict)

    # ─────────────────────────────────────────────────────────────────────────
    def _save_event(self, track_id: int, class_name: str, direction: str,
                    r_label: str, conf: float) -> dict:
        """Log a crossing/zone event to the database."""
        event_time = datetime.now()
        event = CrossingEvent(
            camera_id=self.camera_id,
            track_id=track_id,
            vehicle_id=f"{class_name}_{track_id}",
            class_name=class_name,
            direction=direction,
            region_label=r_label,
            timestamp=event_time,
            confidence=conf
        )
        self.db.add(event)
        self.db.commit()
        cache.delete(f"analytics_summary_{self.camera_id}")
        logger.info(f"Event: {class_name}_{track_id} → {r_label} ({direction})")
        return {
            "vehicle_id": f"{class_name}_{track_id}",
            "class_name": class_name,
            "direction": direction,
            "region_label": r_label,
            "track_id": track_id,
            "timestamp": event_time.isoformat()
        }

    # ─────────────────────────────────────────────────────────────────────────
    def process(self):
        cap = cv2.VideoCapture(self.video_path)
        if not cap.isOpened():
            logger.error(f"Failed to open video stream: {self.video_path}")
            return

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        # FIX: guard against zero / invalid fps values
        if not fps or fps <= 0:
            fps = 30.0
        cooldown_frames = int(fps * 2)   # 2-second crossing cooldown

        self._scale_regions(width, height)
        logger.info(f"Stream resolution: {width}x{height} @ {fps:.1f}fps | Regions: {len(self.regions)}")

        track_history: dict[int, list] = {}
        track_states: dict[int, dict] = {}

        # ── Counters ─────────────────────────────────────────────────────────
        # Total per class (all regions combined)
        cumulative_counts: dict[str, int] = {}
        # Per-region breakdown: { region_label: { class_name: count } }
        region_counts: dict[str, dict[str, int]] = {r["label"]: {} for r in self.regions}

        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1

            boxes_data = []
            new_events = []

            # ── Inference + Tracking ──────────────────────────────────────────
            if self.tracker_type == "deepsort":
                results = self.model.predict(frame, conf=0.2, device="cuda", verbose=False)
                raw_detections = []
                if results and results[0].boxes is not None:
                    for box in results[0].boxes:
                        bbox = box.xyxy[0].cpu().numpy().tolist()
                        conf = float(box.conf[0].item())
                        cls_id = int(box.cls[0].item())
                        raw_detections.append(bbox + [conf, cls_id])

                active_tracks = self.ds_tracker.update(raw_detections)
                xyxy_list, tracker_ids, class_ids, confidences = [], [], [], []
                for t in active_tracks:
                    bbox = t.box.tolist()
                    xyxy_list.append(bbox)
                    tracker_ids.append(t.track_id)
                    class_ids.append(t.class_id)
                    confidences.append(t.confidence)
                    boxes_data.append({
                        "box": bbox,
                        "class_name": self.model.names[t.class_id],
                        "confidence": t.confidence,
                        "track_id": t.track_id
                    })
            else:
                yaml_file = "bytetrack.yaml" if self.tracker_type == "bytetrack" else "botsort.yaml"
                results = self.model.track(frame, persist=True, conf=0.2,
                                           tracker=yaml_file, device="cuda", verbose=False)
                xyxy_list, tracker_ids, class_ids, confidences = [], [], [], []
                if results and results[0].boxes is not None:
                    for box in results[0].boxes:
                        cls_id = int(box.cls[0].item()) if box.cls is not None else None
                        if cls_id is None or cls_id >= len(self.model.names):
                            continue
                        track_id = int(box.id[0].item()) if box.id is not None else None
                        conf = float(box.conf[0].item()) if box.conf is not None else 0.0
                        bbox = box.xyxy[0].cpu().numpy().tolist()
                        if track_id is not None:
                            xyxy_list.append(bbox)
                            tracker_ids.append(track_id)
                            class_ids.append(cls_id)
                            confidences.append(conf)
                            boxes_data.append({
                                "box": bbox,
                                "class_name": self.model.names[cls_id],
                                "confidence": conf,
                                "track_id": track_id
                            })

            # ── Crossing + Zone Analytics ─────────────────────────────────────
            annotated_frame = frame.copy()
            if len(xyxy_list) > 0 and len(tracker_ids) == len(xyxy_list):

                # FIX: build O(1) lookup dict for track_id → index in this frame
                tracker_id_to_idx: dict[int, int] = {
                    int(tracker_ids[i]): i for i in range(len(tracker_ids))
                }

                # ── 1. Line Crossing Logic (all lines in one pass) ────────────
                for i, t_id_raw in enumerate(tracker_ids):
                    t_id = int(t_id_raw)
                    bbox = xyxy_list[i]
                    class_name = self.model.names[int(class_ids[i])]
                    conf = float(confidences[i])
                    pos = get_bottom_center(bbox)

                    if t_id not in track_history:
                        track_history[t_id] = []
                        track_states[t_id] = {}
                    track_history[t_id].append(pos)
                    if len(track_history[t_id]) > 30:
                        track_history[t_id].pop(0)

                    prev_pos = track_history[t_id][-2] if len(track_history[t_id]) > 1 else None

                    for r in self.regions:
                        if r["type"] != "line":
                            continue
                        if prev_pos is None:
                            continue

                        A = r["raw_coords"][0]
                        B = r["raw_coords"][1]

                        if not intersect(A, B, prev_pos, pos):
                            continue

                        # ── Direction: cross product of (AB) × (motion vector) ──
                        ab_x = B[0] - A[0]
                        ab_y = B[1] - A[1]
                        m_x = pos[0] - prev_pos[0]
                        m_y = pos[1] - prev_pos[1]
                        cross_product = ab_x * m_y - ab_y * m_x
                        direction = "IN" if cross_product > 0 else "OUT"

                        # ── Cooldown: per-track per-line ──────────────────────
                        cooldown_key = f"line_{r['id']}"
                        last_frame = track_states[t_id].get(cooldown_key, -999)
                        if frame_idx - last_frame <= cooldown_frames:
                            continue   # still in cooldown

                        track_states[t_id][cooldown_key] = frame_idx
                        cumulative_counts[class_name] = cumulative_counts.get(class_name, 0) + 1

                        # Per-region counter
                        rl = r["label"]
                        if rl not in region_counts:
                            region_counts[rl] = {}
                        region_counts[rl][class_name] = region_counts[rl].get(class_name, 0) + 1

                        ev = self._save_event(t_id, class_name, direction, rl, conf)
                        new_events.append(ev)

                # ── 2. Polygon Zone Logic ─────────────────────────────────────
                sv_dets = sv.Detections(
                    xyxy=np.array(xyxy_list, dtype=np.float32),
                    class_id=np.array(class_ids, dtype=np.int32),
                    confidence=np.array(confidences, dtype=np.float32),
                    tracker_id=np.array(tracker_ids, dtype=np.int32)
                )

                for r in self.regions:
                    if r["type"] != "polygon":
                        continue

                    is_inside_mask = r["sv_zone"].trigger(detections=sv_dets)
                    current_inside_tracks: set[int] = {
                        int(tracker_ids[i]) for i, flag in enumerate(is_inside_mask) if flag
                    }

                    # Check for entries
                    for i, t_id_raw in enumerate(tracker_ids):
                        t_id = int(t_id_raw)
                        is_inside = t_id in current_inside_tracks
                        was_inside = track_states.get(t_id, {}).get(f"poly_{r['id']}", False)
                        if is_inside and not was_inside:
                            class_name = self.model.names[int(class_ids[i])]
                            conf = float(confidences[i])
                            if t_id not in track_states:
                                track_states[t_id] = {}
                            track_states[t_id][f"poly_{r['id']}"] = True
                            cumulative_counts[class_name] = cumulative_counts.get(class_name, 0) + 1
                            rl = r["label"]
                            if rl not in region_counts:
                                region_counts[rl] = {}
                            region_counts[rl][class_name] = region_counts[rl].get(class_name, 0) + 1
                            ev = self._save_event(t_id, class_name, "IN", rl, conf)
                            new_events.append(ev)

                    # Check for exits
                    for t_id, states in list(track_states.items()):
                        was_inside = states.get(f"poly_{r['id']}", False)
                        if not was_inside or t_id in current_inside_tracks:
                            continue

                        states[f"poly_{r['id']}"] = False

                        # FIX: O(1) lookup instead of .index() O(N)
                        if t_id in tracker_id_to_idx:
                            idx = tracker_id_to_idx[t_id]
                            class_name = self.model.names[int(class_ids[idx])]
                            conf = float(confidences[idx])
                        else:
                            # Track disappeared — look up most recent DB event
                            prev_event = self.db.query(CrossingEvent).filter(
                                CrossingEvent.camera_id == self.camera_id,
                                CrossingEvent.track_id == t_id
                            ).order_by(CrossingEvent.timestamp.desc()).first()
                            class_name = prev_event.class_name if prev_event else "vehicle"
                            conf = float(prev_event.confidence) if prev_event and prev_event.confidence else 0.8

                        rl = r["label"]
                        ev = self._save_event(t_id, class_name, "OUT", rl, conf)
                        new_events.append(ev)

                # ── 3. Supervision visual annotations ─────────────────────────
                annotated_frame = self.trace_annotator.annotate(scene=annotated_frame, detections=sv_dets)
                annotated_frame = self.box_annotator.annotate(scene=annotated_frame, detections=sv_dets)
                labels = [
                    f"#{int(tracker_ids[i])} {self.model.names[int(class_ids[i])]} {float(confidences[i]):.2f}"
                    for i in range(len(tracker_ids))
                ]
                annotated_frame = self.label_annotator.annotate(
                    scene=annotated_frame, detections=sv_dets, labels=labels
                )

            # ── 4. Draw regions on annotated frame ────────────────────────────
            for r in self.regions:
                coords = np.array(r["raw_coords"], dtype=np.int32)
                color = REGION_COLORS_BGR[r["color_idx"]]
                if r["type"] == "line":
                    cv2.line(annotated_frame, tuple(coords[0]), tuple(coords[1]), color, 3)
                    # Draw direction arrow at midpoint
                    mid = ((coords[0][0] + coords[1][0]) // 2, (coords[0][1] + coords[1][1]) // 2)
                    cv2.circle(annotated_frame, mid, 6, color, -1)
                else:
                    cv2.polylines(annotated_frame, [coords], True, color, 3)
                    # Semi-transparent fill
                    overlay = annotated_frame.copy()
                    cv2.fillPoly(overlay, [coords], color)
                    cv2.addWeighted(overlay, 0.12, annotated_frame, 0.88, 0, annotated_frame)

                # Label with background
                label_pt = (int(coords[0][0]) + 4, int(coords[0][1]) - 8)
                label_text = r["label"]
                (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
                cv2.rectangle(annotated_frame,
                              (label_pt[0] - 2, label_pt[1] - th - 4),
                              (label_pt[0] + tw + 4, label_pt[1] + 4),
                              color, -1)
                cv2.putText(annotated_frame, label_text, label_pt,
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 2)

            # ── 5. Encode + yield ─────────────────────────────────────────────
            _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            frame_base64 = base64.b64encode(buffer).decode('utf-8')

            yield {
                "type": "frame",
                "frame": f"data:image/jpeg;base64,{frame_base64}",
                "boxes": boxes_data,
                "counts": cumulative_counts,
                "region_counts": region_counts,        # NEW: per-region breakdown
                "events": new_events,
                "frame_idx": frame_idx,
                "stream_fps": round(fps, 1),
                "active_lines": len([r for r in self.regions if r["type"] == "line"]),
                "active_polygons": len([r for r in self.regions if r["type"] == "polygon"]),
            }

        cap.release()
        logger.info("Video pipeline finished cleanly.")
