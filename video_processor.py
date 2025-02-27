import cv2
import numpy as np
from ultralytics import YOLO
from datetime import datetime, timedelta
import pandas as pd

unique_id_counter = 0

def is_crossed(bottom_center, line, threshold=5):
    line_y1 = line[0][1]
    line_y2 = line[1][1]
    line_y_min = min(line_y1, line_y2) - threshold
    line_y_max = max(line_y1, line_y2) + threshold
    return line_y_min <= bottom_center[1] <= line_y_max

def determine_in_out(row):
    if row['Line 1'] == 1 and row['Line 2'] == 1:
        return 'IN/OUT'
    elif row['Line 1'] == 1:
        return 'IN'
    elif row['Line 2'] == 1:
        return 'OUT'
    return 'UNKNOWN'

def track_objects_in_lines(video_path, model_path, lines, frame_skip, recording_start_time, update_callback=None):
    global unique_id_counter
    model = YOLO(model_path)
    cap = cv2.VideoCapture(video_path)
    assert cap.isOpened(), "Error reading video file"

    tracking_info = {}
    frame_count = 0
    fps = cap.get(cv2.CAP_PROP_FPS)
    df = pd.DataFrame(columns=['Vehicle ID', 'Class', 'Latitude', 'Longitude'] + 
                      [f'Line {i+1}' for i in range(len(lines))] + 
                      [f'Timestamp Line {i+1}' for i in range(len(lines))] + 
                      ['IN/OUT'])

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        start_time = datetime.now()
        if frame_count % frame_skip == 0:
            results = model.track(frame, persist=True, conf=0.2)
            elapsed_time = timedelta(seconds=frame_count / fps)
            current_time = recording_start_time + elapsed_time

            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        class_id = int(box.cls) if box.cls is not None else None
                        if class_id is None or class_id >= len(model.names):
                            continue
                        track_id = int(box.id) if box.id is not None else None
                        if track_id is None:
                            continue
                        class_name = model.names[class_id]
                        
                        if track_id not in tracking_info:
                            tracking_info[track_id] = {
                                'class': class_name,
                                'lines': {i: {'crossed': False, 'timestamp': 'NIL'} for i in range(len(lines))},
                                'latitude': 28.6139,  # Default New Delhi latitude
                                'longitude': 77.2090  # Default New Delhi longitude
                            }

                        bbox = box.xyxy.cpu().numpy().flatten()
                        bottom_center = ((bbox[0] + bbox[2]) // 2, bbox[3])

                        for i, line in enumerate(lines):
                            if is_crossed(bottom_center, line):
                                if not tracking_info[track_id]['lines'][i]['crossed']:
                                    tracking_info[track_id]['lines'][i]['crossed'] = True
                                    tracking_info[track_id]['lines'][i]['timestamp'] = current_time.strftime("%Y-%m-%d %H:%M:%S")
                                    row = {
                                        'Vehicle ID': f"{class_name}_{track_id}",
                                        'Class': class_name,
                                        'Latitude': tracking_info[track_id]['latitude'],
                                        'Longitude': tracking_info[track_id]['longitude'],
                                        'IN/OUT': 'UNKNOWN'
                                    }
                                    for j in range(len(lines)):
                                        row[f'Line {j+1}'] = 1 if tracking_info[track_id]['lines'][j]['crossed'] else 0
                                        row[f'Timestamp Line {j+1}'] = tracking_info[track_id]['lines'][j]['timestamp']
                                    df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
                                    df['IN/OUT'] = df.apply(determine_in_out, axis=1)
                                    if update_callback:
                                        update_callback(df.copy())

            annotated_frame = results[0].plot()
            end_time = datetime.now()
            fps_processing = 1 / (end_time - start_time).total_seconds()
            for idx, line in enumerate(lines):
                cv2.line(annotated_frame, line[0], line[1], (100, 255, 10), 2)
                cv2.putText(annotated_frame, f'L{idx+1}', (line[0][0], line[0][1]-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (20, 25, 250), 2)
            cv2.putText(annotated_frame, f"FPS: {fps_processing:.2f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.imshow("AATM(s) Detection & Tracking Window ", annotated_frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

        frame_count += 1

    cap.release()
    cv2.destroyAllWindows()
    return df