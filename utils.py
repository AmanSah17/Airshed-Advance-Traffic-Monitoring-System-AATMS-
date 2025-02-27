import cv2
import tkinter as tk
from tkinter import filedialog, messagebox
import pandas as pd

lines = []
drawing = False
current_line = []

def draw_line(event, x, y, flags, param):
    global drawing, current_line
    if event == cv2.EVENT_LBUTTONDOWN:
        drawing = True
        current_line = [(x, y)]
    elif event == cv2.EVENT_MOUSEMOVE and drawing:
        img_copy = param.copy()
        cv2.line(img_copy, current_line[0], (x, y), (100, 205, 60), 2)
        cv2.imshow("Line Drawing", img_copy)
    elif event == cv2.EVENT_LBUTTONUP:
        drawing = False
        current_line.append((x, y))
        lines.append(current_line)

def get_lines(frame, max_lines=4):
    global lines, drawing, current_line
    lines = []
    drawing = False
    current_line = []
    cv2.namedWindow("Line Drawing")
    cv2.setMouseCallback("Line Drawing", draw_line, frame)

    while len(lines) < max_lines:
        img_copy = frame.copy()
        for idx, line in enumerate(lines):
            cv2.line(img_copy, line[0], line[1], (10, 255, 100), 2)
            cv2.putText(img_copy, f'L{idx+1}', (line[0][0], line[0][1]-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
        cv2.imshow("Line Drawing", img_copy)
        key = cv2.waitKey(1)
        if key == ord('q'):
            break

    cv2.destroyWindow("Line Drawing")
    return lines, img_copy

def select_file(title, filetypes):
    file_path = filedialog.askopenfilename(title=title, filetypes=filetypes)
    return file_path

def select_video_file():
    return select_file("Select a Video File", [("MP4 files", "*.mp4"), ("All files", "*.*")])

def select_model_file():
    return select_file("Select a YOLO Model File", [("PT files", "*.pt"), ("All files", "*.*")])

def select_directory():
    return filedialog.askdirectory(title="Select Directory to Save Processed Data")

def save_to_csv(data, save_path):
    data.to_csv(save_path, index=False)