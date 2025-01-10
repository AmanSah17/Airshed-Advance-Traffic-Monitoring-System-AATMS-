'''The code below written is for Parallel processing of 2 videos for counting and Tracking the number  of various classes of vehicles.
we are using PyTorch based library "Ultralytics" for object detection and Tracking Inference .
'''
'''STRICTLY : THIS IS A PROPERTY OF AIRSHED INDIA  PROFESSIONAL PRIVATE LIMITED'''

"""The below  Detection - Tracking -and Counting  Software is Devloped by the Inhouse,  Information Technology Team at Airshed India Proffesional Ltd . """

"""
        Author(s) : Aman Sah (Research Engineer and Software Devlopement Lead @ Airshed),
                    Shubhangi Pandey (Data-Science Intern @ Airshed)

                    contact  Information : amansah17airshed@gmail.com , shubhangi99airshed@gmail.com

                    Airshed India Professionals Private Ltd.
                    Address: Plot No. 16, Mukherjee Vihar, Kalyanpur, Kanpur, Uttar Pradesh 208026
                    Phone: 0512 298 5555
        
"""



#Import all the required libaries

import os
import pandas as pd
import cv2
import threading
from ultralytics import YOLO
from datetime import datetime, timedelta
from tkinter import filedialog, simpledialog
import tkinter as tk

# Check if the bottom center crosses the line:
"""
    is_crossed function takes arguements : bottom centre of the bounding_box , Line co-ordinates defined by the user ,
    as well as it gives access to thresholding region .

    During processing the video files , which processes each frame one - by -one , by drawing the inferences bounding boxes on each frame.
    Since, the software is capable of keeping track of different objects across the many frames , occlusions , Intersection over Union .
    The software dynamically calculates the updated bounding_boxes as well as the bottom_centre of each bounding boxes.


    As, any bottom_centre comes near the line(s) drawn and enters the threshold region , it registers the instant when it first touches the line(region).

"""
def is_crossed(bottom_center, line, threshold=5):
    line_y1, line_y2 = line[0][1], line[1][1]
    line_y_min, line_y_max = min(line_y1, line_y2) - threshold, max(line_y1, line_y2) + threshold
    return line_y_min <= bottom_center[1] <= line_y_max






"""
    Function to draw custom lines on the first frame of the video.
"""
# Line drawing function

def draw_lines(frame, num_lines):
    global lines, drawing, current_line
    lines = []
    drawing = False

    def draw(event, x, y, flags, param):
        global drawing, current_line
        if event == cv2.EVENT_LBUTTONDOWN:
            drawing = True
            current_line = [(x, y)]
        elif event == cv2.EVENT_MOUSEMOVE and drawing:
            img_copy = frame.copy()
            cv2.line(img_copy, current_line[0], (x, y), (0, 255, 0), 2)
            cv2.imshow("Draw Lines", img_copy)
        elif event == cv2.EVENT_LBUTTONUP:
            drawing = False
            current_line.append((x, y))
            lines.append(current_line)
            cv2.line(frame, current_line[0], current_line[1], (0, 20, 255), 2)
            cv2.imshow("Draw Lines", frame)

    cv2.namedWindow("Draw Lines")
    cv2.setMouseCallback("Draw Lines", draw)

    while len(lines) < num_lines:
        cv2.imshow("Draw Lines", frame)
        if cv2.waitKey(1) & 0xFF == 27:  # Escape key to exit
            break

    cv2.destroyAllWindows()
    return lines






"""

    The below function serves the back-bone for multi-object detection and assigning unique track id to register when the Vehicle(s),
    enter the Line(region).

    Function Architecture :
    #First, it instatntiate the Cutom Trained YOLO (You only look once- ultralytics) model which is .pytorch model for the Vehicle(s) detection and tracking
    # Then it initializes OpenCV -VideoCapture Object to load the selected Video Files to be processed.
    # A pipeline to predict- track - and dynamically extract bounding_box (x_min,y_min,norm_width,norm_height) co-ordinates  to update the bottom_centre of each bounding_boxes to be tracked across the video frames.
    # As the video file(s) are processed and individual objects are tracked across frames , it maintains a unique class_ID & Track_ID to the detected objects , and registers it in a dataframe,when vehicle(s) enters any region(s) defined by the User.



"""

# Function to process each video
def process_video_thread_safe(video_path, model_path, lines, output_csv, frame_skip, recording_start_time, unique_prefix):
    try:
        model = YOLO(model_path)
        cap = cv2.VideoCapture(video_path)
        assert cap.isOpened(), f"Error opening your video file , please upload a *.mp4 file type : {video_path}"

        tracking_info = {}
        frame_count = 0
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        
        # Create a unique window for each video
        window_name = f"AATMS - Detection and Tracking : Annotated Frame - {unique_prefix}"
        cv2.namedWindow(window_name)

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            start_time = datetime.now() 
            if frame_count % frame_skip == 0:
                results = model.track(frame, persist=True, conf=0.2)
                elapsed_time = timedelta(seconds=frame_count / fps)
                current_time = recording_start_time + elapsed_time


                #ultralytics detections(results) are bounding_box(s) co-ordinates which contains the x_min,y_min, width_normalized, height_normalized of all the detected vehicle(s) in a numpy based multi-dimensional arrays.

                #we are extracting result(s) for each frame detected and assigning a unique class_id ,track_Id to them, with a unique prefix.

            
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
                            unique_track_id = f"{unique_prefix}{track_id}"

                            if unique_track_id not in tracking_info:
                                tracking_info[unique_track_id] = {
                                    'class': class_name,
                                    'lines': {i: {'crossed': False, 'timestamp': 'NIL'} for i in range(len(lines))}
                                }

                            # Assuming `frame` is the current frame being processed
                            #Extract the bounding_box co-ordinates and flatten them with numpy in multidimensional array , for ease in computations.
                            bbox = box.xyxy.cpu().numpy().flatten()
                            # Ensure bottom_center is a tuple of integers
                            bottom_center = (int((bbox[0] + bbox[2]) // 2), int(bbox[3]))




                            """Tracking algorithm for assigning unique tracking id to each detected vehicles .
                                    #The below code is written to register when a tracked vehicles first comes in contact with the predifned line regions.
                            """
                            for i, line in enumerate(lines):
                                if is_crossed(bottom_center, line):
                                    if not tracking_info[unique_track_id]['lines'][i]['crossed']:
                                        # Mark line as crossed
                                        tracking_info[unique_track_id]['lines'][i]['crossed'] = True
                                        tracking_info[unique_track_id]['lines'][i]['timestamp'] = current_time.strftime("%Y-%m-%d %H:%M:%S")
                                        
                                        # Draw a circle at the bottom-center of the object
                                        cv2.circle(frame, bottom_center, radius=8, color=(0, 0, 255), thickness=-1)  # Red circle, filled
                                        
                                        # Optional: Add a label near the circle
                                        label = f"Crossed"
                                        label_position = (bottom_center[0] - 20, bottom_center[1] - 10)
                                        cv2.putText(frame, label, label_position, cv2.FONT_HERSHEY_SIMPLEX, fontScale=0.8, color=(0, 255, 0), thickness=1)

            frame_count += 1
                        # Annotate the frame
            annotated_frame = frame.copy()  # Copy the original frame for annotation
            for result in results:
                for box in result.boxes:
                    xyxy = box.xyxy.cpu().numpy().flatten()
                    class_id = int(box.cls.item()) if box.cls is not None else None  # Ensure this is not a tensor
                    if class_id is not None and class_id < len(model.names):
                        class_name = model.names[class_id]
                        label = f"{class_name} {box.conf.item():.2f}"  # Use .item() to convert tensor to float
                        color = (10, 220, 50)  # Color for bounding box
                        cv2.rectangle(annotated_frame, (int(xyxy[0]), int(xyxy[1])), (int(xyxy[2]), int(xyxy[3])), color, 2)
                        cv2.putText(annotated_frame, label, (int(xyxy[0]), int(xyxy[1]) - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 3)

            # Calculate and display FPS on the frame
            end_time = datetime.now()
            fps_processing = 1 / (end_time - start_time).total_seconds()
            for idx, line in enumerate(lines):
                cv2.line(annotated_frame, line[0], line[1], (250, 20, 10), 4)
                cv2.putText(annotated_frame, f'L{idx+1}', (line[0][0], line[0][1]-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (20, 25, 250), 2)
            cv2.putText(annotated_frame, f"AATMS Parallel Processing  FPS: {fps_processing:.2f}", (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (10, 5, 255),cv2.LINE_4, 1)

            # Display annotated frame in its unique window
            cv2.imshow(window_name, annotated_frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        cap.release()

        """
        The below code is written to extract the entry -time registry to the predefined Line regions.
        """
        # Save data to CSV
        data = []
        for track_id, info in tracking_info.items():
            row = {'Track ID': track_id, 'Class': info['class']}
            for i in range(len(lines)):
                row[f'Line {i+1}'] = 1 if info['lines'][i]['crossed'] else 0
                row[f'Timestamp Line {i+1}'] = info['lines'][i]['timestamp']
            data.append(row)

        df = pd.DataFrame(data)
        df.to_csv(output_csv, index=False)

    except Exception as e:
        print(f"Error processing video {video_path}: {e}")
def main():
    root = tk.Tk()
    root.withdraw()

    # Select videos and model
    video_paths = [
        filedialog.askopenfilename(title=f"Select Video {i+1}", filetypes=[("Video Files", "*.mp4 *.avi *.mov")])
        for i in range(3)
    ]
    if not all(video_paths):
        print("Video selection canceled.")
        return

    model_path = filedialog.askopenfilename(title="Select YOLO Model", filetypes=[("Custom Model", "*.pt")])
    if not model_path:
        print("Model selection canceled.")
        return

    # Prompt user to select output directory
    output_dir = filedialog.askdirectory(title="Select Directory to Save Output Files")
    if not output_dir:
        print("Output directory selection canceled.")
        return

    # Get the number of lines
    num_lines = simpledialog.askinteger(
        title="Input Required",
        prompt="Enter the number of regions as line in between (1-4):\n"
               "Please draw the lines horizontal and along the road, such that the bottom - "
               "center of the bounding boxes of the objects touches the line.",
        minvalue=1,
        maxvalue=4
    )

    # Draw lines on each video
    lines_list = []
    for video_path in video_paths:
        cap = cv2.VideoCapture(video_path)
        ret, frame = cap.read()
        cap.release()
        assert ret, f"Error reading first frame of video: {video_path}"

        lines = draw_lines(frame, num_lines)
        if not lines:
            print(f"No lines drawn for video: {video_path}")
            return
        lines_list.append(lines)

    # Start time
    recording_start_time = datetime.now()

    # Output file paths
    output_csvs = [os.path.join(output_dir, os.path.splitext(os.path.basename(path))[0] + "_counting.csv") 
                   for path in video_paths]

    # Success messages storage
    success_messages = []

    # Processing function with success logging
    def process_with_success(video_path, model_path, lines, output_csv, thread_id):
        process_video_thread_safe(video_path, model_path, lines, output_csv, 1, recording_start_time, thread_id)
        message = (f"Success: Video '{os.path.basename(video_path)}' "
                   f"processed in Thread-{thread_id}. Output saved at: {output_csv}")
        success_messages.append(message)
        print(message)

    # Create threads
    threads = [
        threading.Thread(target=process_with_success, args=(
            video_paths[i], model_path, lines_list[i], output_csvs[i], f"V{i+1}"
        ))
        for i in range(len(video_paths))
    ]

    # Start and join threads
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    # Display success messages
    for message in success_messages:
        tk.messagebox.showinfo("AATMS - Multithreaded Parallel Processing Complete", message)

    # Combine outputs
    dfs = [pd.read_csv(output_csv) for output_csv in output_csvs]


if __name__ == "__main__":
    main()
