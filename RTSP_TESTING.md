# Mobile RTSP / HTTP Stream Testing Guide

This guide explains how to connect a mobile camera feed (RTSP or HTTP) to the AATMS video pipeline with zero buffering latency, optimized for real-time inference.

## Overview

Processing network streams (RTSP/HTTP) via standard OpenCV `VideoCapture` often results in massive buffer lag. If the inference speed (e.g., YOLO + DeepSORT) is slower than the camera's frame rate, unprocessed frames pile up in the buffer, causing the displayed video feed to become delayed by seconds or even minutes.

To solve this, the AATMS backend implements a **Threaded Stream Reader (`RTSPStreamReader`)**.
- It spawns a background daemon thread that continuously grabs frames (`cap.read()`) at the native camera speed.
- It only retains the freshest frame in memory.
- When the inference engine requests a frame, it receives the latest one instantly, dropping older unprocessed frames to maintain true real-time execution.

## Setup Instructions (IP Webcam)

The most common way to stream from an Android device is using the "IP Webcam" app.

1. **Install IP Webcam** from the Google Play Store on your Android device.
2. Ensure both your mobile phone and the server running AATMS are connected to the **same local network** (Wi-Fi/LAN).
3. Open the app, scroll to the bottom, and tap **Start server**.
4. The app will display an IPv4 address at the bottom of the screen (e.g., `http://192.168.1.100:8080`).

## Connection in AATMS

1. Open the AATMS Frontend dashboard.
2. In the Line Crossing or Polygon Zone setup, locate the **RTSP URL** input field.
3. **CRITICAL:** Do not use the base IP address. You must append `/video` to access the raw MJPEG stream.
   - **Correct:** `http://192.168.1.100:8080/video`
   - **Incorrect:** `http://192.168.1.100:8080` (This points to the HTML dashboard and will crash the backend pipeline).
4. Click Connect or Start Pipeline.

## Verification

To verify that the zero-latency threaded reader is working correctly:
1. Wave your hand in front of your mobile camera.
2. Watch the AATMS frontend dashboard.
3. The bounding boxes and lines should update instantly with minimal latency (< 100ms).
4. Monitor the feed for 5-10 minutes. The latency should remain completely stable and should not drift or increase over time.

## Under the Hood

When you input a URL starting with `rtsp://` or `http://`, the `VideoProcessor` in `pipeline.py` automatically routes the source through the `RTSPStreamReader`:

```python
if self.video_path.startswith("rtsp://") or self.video_path.startswith("http://"):
    cap = RTSPStreamReader(self.video_path)
```

The threaded reader also explicitly sets `os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp"` and sets `cv2.CAP_PROP_BUFFERSIZE` to 1 to force OpenCV to handle low-latency streams aggressively.
