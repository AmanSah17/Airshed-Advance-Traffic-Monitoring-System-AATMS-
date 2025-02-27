import tkinter as tk
from tkinter import messagebox
from datetime import datetime
from threading import Thread
import os
from video_processor import track_objects_in_lines
from dashboard import run_dashboard, update_dashboard
from utils import select_video_file, select_model_file, select_directory, get_lines, save_to_csv

def main():
    root = tk.Tk()
    root.withdraw()

    video_path = select_video_file()
    if not video_path:
        messagebox.showerror("Error", "No video file selected!")
        return

    model_path = select_model_file()
    if not model_path:
        messagebox.showerror("Error", "No model file selected!")
        return

    save_directory = select_directory()
    if not save_directory:
        messagebox.showerror("Error", "No directory selected to save data!")
        return

    import cv2
    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    if not ret:
        messagebox.showerror("Error", "Error reading the first frame of the video")
        return
    cap.release()

    max_lines = int(input("Enter the maximum number of lines to draw: "))
    print("Draw the lines of interest (ROIs). Press 'q' when done.")
    lines, img_with_lines = get_lines(frame, max_lines=max_lines)

    frame_skip_input = messagebox.askyesno("Frame Skip", "Do you want to skip frames for faster processing?")
    frame_skip = 2 if frame_skip_input else 1

    recording_start_time = datetime.now()

    # Start dashboard in a separate thread
    dashboard_thread = Thread(target=run_dashboard)
    dashboard_thread.start()

    # Process video and update dashboard
    df = track_objects_in_lines(video_path, model_path, lines, frame_skip, recording_start_time, update_callback=update_dashboard)

    file_prefix = os.path.splitext(os.path.basename(video_path))[0]
    save_path = os.path.join(save_directory, f"{file_prefix}_counting.csv")
    save_to_csv(df, save_path)
    messagebox.showinfo("Success", f"Counting data saved to {save_path}")

    img_save_path = os.path.join(save_directory, f"{file_prefix}_lines.png")
    cv2.imwrite(img_save_path, img_with_lines)
    messagebox.showinfo("Success", f"First frame with lines saved to {img_save_path}")

if __name__ == "__main__":
    main()