import cv2
import numpy as np
from ultralytics import YOLO, solutions
from PIL import Image
import pytesseract
import os
import pandas as pd
import tkinter as tk
from tkinter import filedialog, messagebox

# Path to tesseract executable
#in our case i have already downloaded the tesseract-ocr in my local device
pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'

# Global variables for drawing the polygon
points = []
drawing = False

def draw_polygon(event, x, y, flags, param):
    global points, drawing
    if event == cv2.EVENT_LBUTTONDOWN:
        drawing = True
        points.append((x, y))
    elif event == cv2.EVENT_MOUSEMOVE and drawing:
        points[-1] = (x, y)
    elif event == cv2.EVENT_LBUTTONUP:
        drawing = False

def get_region_points(frame):
    global points, drawing
    points = []
    drawing = False
    cv2.namedWindow("Frame")
    cv2.setMouseCallback("Frame", draw_polygon)

    while True:
        temp_frame = frame.copy()
        if points:
            cv2.polylines(temp_frame, [np.array(points)], False, (100, 255, 250), 2)
        cv2.imshow("Frame", temp_frame)
        key = cv2.waitKey(1)
        if key == ord('q') and len(points) >= 3:
            break

    cv2.destroyWindow("Frame")
    return points

def trim_video(video_path, start_time, end_time, output_path):
    cap = cv2.VideoCapture(video_path)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    start_frame = int(start_time * fps)
    end_frame = int(end_time * fps)

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    w, h = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    video_writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret or cap.get(cv2.CAP_PROP_POS_FRAMES) > end_frame:
            break
        video_writer.write(frame)

    cap.release()
    video_writer.release()

def count_objects_in_region(video_path, output_video_path, model_path, region_points, frame_skip):
    """Count objects in a specific region within a video."""
    model = YOLO("F:\\Vehicle_count_system\\OCR\\models\\hyperparameter_AdamW_1.pt")
    cap = cv2.VideoCapture(video_path)
    assert cap.isOpened(), "Error reading video file"
    w, h, fps = (int(cap.get(x)) for x in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT, cv2.CAP_PROP_FPS))
    video_writer = cv2.VideoWriter(output_video_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    counter = solutions.ObjectCounter(
        view_img=True, reg_pts=region_points, names=model.names, draw_tracks=True, line_thickness=1,
        cls_txtdisplay_gap= 1500
    )

    while cap.isOpened():
        success, im0 = cap.read()
        if not success:
            print("Video frame is empty or video processing has been successfully completed.")
            break

        if int(cap.get(cv2.CAP_PROP_POS_FRAMES)) % frame_skip == 0:
            tracks = model.track(im0, persist=True, show=False)
            im0 = counter.start_counting(im0, tracks)
            video_writer.write(im0)

        if cv2.waitKey(1) & 0xFF == 27:  # Press 'Escape' to exit
            break

    cap.release()
    video_writer.release()
    cv2.destroyAllWindows()

def extract_text_from_image(image_path):
    """Extract text from a given image using Tesseract OCR."""
    try:
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)
        return text
    except FileNotFoundError:
        return f"File not found: {image_path}"
    except pytesseract.TesseractNotFoundError:
        return "Tesseract not installed or not in PATH."

def extract_text_from_last_frame(video_path):
    """Extract text from the last frame of a video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return "Error opening video file"

    # Move to the last frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, cap.get(cv2.CAP_PROP_FRAME_COUNT) - 1)
    ret, frame = cap.read()
    if not ret:
        return "Error reading the last frame of the video"

    # Save the last frame as an image in a temporary file
    temp_image_path = 'temp_last_frame.png'
    cv2.imwrite(temp_image_path, frame)

    # Release the video capture object
    cap.release()

    # Extract text from the saved image
    text = extract_text_from_image(temp_image_path)

    # Optionally remove the temporary image file
    os.remove(temp_image_path)

    return text

def save_text_data(texts, text_path, video_filename):
    """Save the extracted text data to a text file."""
    with open(text_path, 'w') as f:
        f.write(f"Results for video file: {video_filename}\n\n")
        for i, text in enumerate(texts):
            f.write(f"Text from bounding box {i + 1}:\n{text}\n\n")

def select_video_file():
    """Open a file dialog to select a video file."""
    file_path = filedialog.askopenfilename(title="Select a Video File", filetypes=(("MP4 files", "*.mp4"), ("All files", "*.*")))
    return file_path

def select_directory():
    """Open a file dialog to select a directory."""
    directory = filedialog.askdirectory(title="Select Directory to Save Processed Videos")
    return directory

def main():
    root = tk.Tk()
    root.withdraw()

    video_path = select_video_file()
    if not video_path:
        messagebox.showerror("Error", "No video file selected!")
        return

    trim_option = messagebox.askyesno("Trim Video", "Do you want to trim the video?")
    if trim_option:
        start_time = int(input("Enter the start time in seconds: "))
        end_time = int(input("Enter the end time in seconds: "))
        trimmed_video_path = os.path.join(os.path.dirname(video_path), "trimmed_video.mp4")
        trim_video(video_path, start_time, end_time, trimmed_video_path)
        video_path = trimmed_video_path

    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    assert ret, "Error reading the first frame of the video"
    cap.release()

    regions = []
    num_regions = int(input("Enter the number of regions (1-4): "))
    for i in range(num_regions):
        print(f"Draw region {i+1} and press 'q' to confirm")
        region_points = get_region_points(frame)
        regions.append(region_points)

    frame_skip = int(input("Enter the number of frames to skip for faster detection: "))

    output_directory = select_directory()
    if not output_directory:
        messagebox.showerror("Error", "No directory selected!")
        return

    all_data = []
    for i, region_points in enumerate(regions):
        output_video_path = os.path.join(output_directory, f"output_region_{i+1}_counter_video.mp4")
        count_objects_in_region(video_path, output_video_path, "yolov8n.pt", region_points, frame_skip)
        print(f"Completed processing for region {i+1}. Output saved to {output_video_path}")

        # Extract text from the last frame of the region video
        extracted_text = extract_text_from_last_frame(output_video_path)
        
        # Save the extracted text to a text file
        text_file_path = os.path.join(output_directory, f"output_region_{i+1}_counting_results.txt")
        save_text_data([extracted_text], text_file_path, output_video_path)
        print(f"Extracted text data saved to {text_file_path}")

if __name__ == "__main__":
    main()
