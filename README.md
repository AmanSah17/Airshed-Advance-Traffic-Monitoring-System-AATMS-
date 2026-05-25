<div align="center">
  <h1>AATMS: Advanced Automated Traffic Management System</h1>
  <h3>Ground-Breaking Edge AI Solution for Smart City & Traffic Analytics</h3>
  <p>
    <b>Privacy-first, hyper-local, and real-time.</b> 
    AATMS transforms raw IP camera feeds into actionable, quantitative insights using custom-trained AI object detection, high-performance spatial tracking, and big-data event streaming.
  </p>
</div>

---

## 🌟 Overview

The **Automated Advance Traffic Monitoring Service (AATMS)** is an enterprise-grade AI software designed to revolutionize urban mobility, infrastructure management, and security. By processing video feeds directly at the edge, AATMS bypasses latency, cloud dependency, and data privacy concerns. 

Our proprietary **AATMS Edge AI Pipeline** brings advanced analytics directly to the intersection, toll booth, or parking facility—capable of running on heavy industrial Nvidia GPUs down to energy-efficient ARM edge nodes like the Raspberry Pi 5.

### Key Capabilities
- **Real-Time Analytics Dashboard:** Interactive, dynamic charts displaying traffic volumes, vehicle classification, and region-specific occupancy limits.
- **Custom Event Rules & Alerts:** Define complex triggers such as Line Crossings, Polygon Occupancy bounds, and Dwell-Time limits directly on a live video feed.
- **Zero Latency Event Streaming:** Utilizing Apache Kafka and robust PostgreSQL schemas to ingest thousands of events per second with zero data loss.
- **ALPR Integration (Planned):** Native support for high-speed Indian License Plate detection via advanced OCR and spatial-temporal tracking.
- **Cross-Functional Smart City Applications:** Integrates seamlessly with existing ITMS (Intelligent Traffic Management Systems).

---

## 🚀 See AATMS In Action

We believe seeing is believing. Watch our core components operating live:

### 1. Data Augmentation & ITMS Training
Watch how we prepare highly robust datasets for our custom object detection pipelines to ensure resilience against weather, lighting, and occlusion.
👉 [**Watch Data Augmentation on YouTube**](https://www.youtube.com/watch?v=Qb9qaC9kZ4I)

### 2. Edge Deployment: Raspberry Pi 5 + Coral Edge TPU
AATMS isn't just for massive server racks. See our quantized models running flawlessly on low-power, edge-native hardware.
👉 [**Watch AATMS on Edge Hardware**](https://www.youtube.com/watch?v=jOJEmD86m6A)
*(Placeholder: `![Raspberry Pi Deployment](assets/demo_rpi.gif)`)*

### 3. Object Region & Polygon Analytics
Watch the system dynamically track vehicles, classify them, and enforce complex user-defined spatial rules in real-time.
👉 [**Watch Region Analytics**](https://www.youtube.com/watch?v=qcgwA4rHbTg)
*(Placeholder: `![Polygon Analytics](assets/demo_polygon.gif)`)*

---

## ⚙️ Technical Architecture & Deployments

AATMS is designed to be highly modular and cross-functional. It can integrate directly into an existing smart city grid or operate completely standalone.

### 🔌 Supported Integrations
- **RTSP / IP Camera Feeds:** Native ingestion of standard H.264/H.265 RTSP streams via OpenCV and FFmpeg integrations.
- **Kafka Event Streaming:** Pluggable messaging system for enterprise IT architectures.
- **SMTP Notification Relays:** Instantaneous email alerts for critical rule violations (e.g., restricted vehicle in a pedestrian zone).

### 🖥️ Hardware Implementations

#### 1. NVIDIA AI Workstations (CUDA)
For massive multi-stream processing (e.g., analyzing an entire highway interchange).
- **Backend:** PyTorch + CUDA acceleration.
- **Model:** AATMS Edge AI - Base / Large.
- **Tracker:** CUDA-Optimized Advanced Tracker (v1/v2).
- **Performance:** 60+ FPS on multiple high-definition RTSP streams.

#### 2. Local / CPU Devices
For testing, prototyping, or light deployments.
- **Backend:** ONNX Runtime / OpenVINO.
- **Model:** AATMS Edge AI - Nano / Small.
- **Performance:** Capable of 15-25 FPS utilizing multi-threading on modern x86/ARM CPUs.

#### 3. Edge IoT (Raspberry Pi 5 + Google Coral TPU)
The ultimate low-power, on-site Smart City node. 
- **Backend:** TensorFlow Lite with Edge TPU delegation.
- **Model:** AATMS Edge AI - Quantized / TFLite (INT8 Precision).
- **Performance:** Highly efficient processing at the camera source, avoiding massive bandwidth transmission costs.

---

## 🏗️ Tech Stack

- **AI Engine:** Proprietary AATMS Edge Detection + AATMS Spatial Trackers.
- **Backend:** FastAPI (Python), Uvicorn, WebSockets.
- **Event Messaging:** Apache Kafka & Zookeeper.
- **Database:** PostgreSQL for persistent event logs and analytic aggregation.
- **Frontend UI:** React, Vite, Recharts, Lucide, standardizing a premium dashboard experience.

---

## 🛡️ Smart City Use Cases

1. **Intelligent Intersection Control:** Dynamically adjust traffic light timings based on real-time lane occupancy.
2. **Zone Enforcement:** Automatically detect heavy-duty trucks entering restricted zones or school crossings.
3. **Parking Management:** Track dwell times in drop-off zones or calculate total parking lot occupancy.
4. **Highway Analytics:** Calculate average speeds, vehicle class distribution (Cars vs. Trucks vs. Bikes), and lane discipline.

---

## 📝 License
© 2026 **Aman Sah**. Exclusive Copyright to AATMS Software. All Rights Reserved. 
For enterprise deployment inquiries and licensing, please contact the repository owner.
