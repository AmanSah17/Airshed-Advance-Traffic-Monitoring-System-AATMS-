import React from "react";
import { Info, Zap, Cpu, Server, MapPin, Database, Camera, Route, ShieldCheck, CheckCircle2 } from "lucide-react";

export default function AboutPage() {
  return (
    <div style={{ flex: 1, padding: "32px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "40px", paddingBottom: "100px", scrollbarWidth: "thin", scrollbarColor: "rgba(99,102,241,0.3) transparent" }}>
      
      {/* ─── HERO SECTION ────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(16,185,129,0.2))", border: "1px solid rgba(99,102,241,0.4)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
          <Zap style={{ width: "32px", height: "32px", color: "#818cf8" }} />
        </div>
        <h1 style={{ fontSize: "36px", fontWeight: 800, color: "#f8fafc", margin: 0, letterSpacing: "-0.02em" }}>
          AATMS <span style={{ color: "#818cf8" }}>Edge AI</span>
        </h1>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#cbd5e1", margin: 0 }}>
          Advanced Automated Traffic Management Service
        </h2>
        <p style={{ fontSize: "15px", color: "#94a3b8", lineHeight: 1.6, maxWidth: "650px", marginTop: "8px" }}>
          Privacy-first, hyper-local, and real-time. AATMS transforms raw IP camera feeds into actionable, quantitative insights using custom-trained AI object detection, high-performance spatial tracking, and big-data event streaming.
        </p>
      </div>

      {/* ─── VIDEO SHOWCASE ──────────────────────────────────────────── */}
      <div style={{ background: "rgba(15,23,42,0.6)", borderRadius: "24px", border: "1px solid rgba(51,65,85,0.6)", padding: "32px" }}>
        <h3 style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Camera style={{ width: "24px", height: "24px", color: "#f43f5e" }} /> 
          See AATMS in Action
        </h3>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ borderRadius: "16px", overflow: "hidden", border: "1px solid rgba(51,65,85,0.8)", aspectRatio: "16/9", background: "#000" }}>
              <iframe width="100%" height="100%" src="https://www.youtube.com/embed/Qb9qaC9kZ4I" title="ITMS: Data Augmentation" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
            </div>
            <div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 6px 0" }}>ITMS : Data Augmentation</h4>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>Preparing highly robust datasets for our custom object detection pipelines to ensure resilience against weather and lighting conditions.</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ borderRadius: "16px", overflow: "hidden", border: "1px solid rgba(51,65,85,0.8)", aspectRatio: "16/9", background: "#000" }}>
              <iframe width="100%" height="100%" src="https://www.youtube.com/embed/jOJEmD86m6A" title="AATMS on Raspberry Pi 5" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
            </div>
            <div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 6px 0" }}>Raspberry Pi 5 + Coral Edge TPU</h4>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>AATMS running flawlessly on low-power, edge-native hardware using quantized INT8 models and TFLite delegation.</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ borderRadius: "16px", overflow: "hidden", border: "1px solid rgba(51,65,85,0.8)", aspectRatio: "16/9", background: "#000" }}>
              <iframe width="100%" height="100%" src="https://www.youtube.com/embed/qcgwA4rHbTg" title="Object in Region Analytics" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
            </div>
            <div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 6px 0" }}>Object in Region Analytics</h4>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>Dynamically tracking vehicles, classifying them, and enforcing complex user-defined spatial rules in real-time.</p>
            </div>
          </div>

        </div>
      </div>

      {/* ─── TECHNICAL ARCHITECTURE ────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" }}>
        
        {/* Hardware Deployments */}
        <div style={{ background: "rgba(15,23,42,0.6)", borderRadius: "24px", border: "1px solid rgba(51,65,85,0.6)", padding: "32px" }}>
          <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Cpu style={{ width: "22px", height: "22px", color: "#10b981" }} />
            Hardware & Implementation
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "20px" }}>
            <li>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ padding: "4px 8px", borderRadius: "8px", background: "rgba(16,185,129,0.15)", color: "#10b981", fontSize: "11px", fontWeight: 700 }}>HIGH END</span>
                <strong style={{ color: "#e2e8f0", fontSize: "15px" }}>NVIDIA AI Workstations (CUDA)</strong>
              </div>
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>For massive multi-stream processing. Utilizes PyTorch + CUDA acceleration with AATMS Edge AI Large models to achieve 60+ FPS on HD RTSP IP camera streams.</p>
            </li>
            <li>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ padding: "4px 8px", borderRadius: "8px", background: "rgba(99,102,241,0.15)", color: "#818cf8", fontSize: "11px", fontWeight: 700 }}>IoT EDGE</span>
                <strong style={{ color: "#e2e8f0", fontSize: "15px" }}>Raspberry Pi 5 + Google Coral TPU</strong>
              </div>
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>The ultimate low-power, on-site Smart City node. Runs on TensorFlow Lite with Edge TPU delegation using highly quantized INT8 AATMS models at the camera source.</p>
            </li>
            <li>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ padding: "4px 8px", borderRadius: "8px", background: "rgba(245,158,11,0.15)", color: "#fbbf24", fontSize: "11px", fontWeight: 700 }}>STANDARD</span>
                <strong style={{ color: "#e2e8f0", fontSize: "15px" }}>Local CPU & Edge Devices</strong>
              </div>
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>For light deployments. Uses OpenVINO or ONNX runtimes paired with AATMS Edge AI Nano models to deliver 15-25 FPS via multi-threading on standard x86/ARM hardware.</p>
            </li>
          </ul>
        </div>

        {/* Integrations */}
        <div style={{ background: "rgba(15,23,42,0.6)", borderRadius: "24px", border: "1px solid rgba(51,65,85,0.6)", padding: "32px" }}>
          <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Server style={{ width: "22px", height: "22px", color: "#f59e0b" }} />
            Cross-Functional Integrations
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ padding: "16px", borderRadius: "16px", background: "rgba(30,41,59,0.5)", border: "1px solid rgba(51,65,85,0.5)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Route style={{ width: "16px", height: "16px", color: "#6366f1" }} />
                <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>RTSP & IP Camera Feeds</h4>
              </div>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>Native ingestion of H.264/H.265 RTSP streams via OpenCV and FFmpeg integrations, allowing seamless connection to existing city infrastructure and CCTVs.</p>
            </div>

            <div style={{ padding: "16px", borderRadius: "16px", background: "rgba(30,41,59,0.5)", border: "1px solid rgba(51,65,85,0.5)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Database style={{ width: "16px", height: "16px", color: "#06b6d4" }} />
                <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Kafka Event Streaming & DB</h4>
              </div>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>Pluggable Apache Kafka messaging system for zero-latency event streaming into robust PostgreSQL schemas. Built to ingest thousands of events without data loss.</p>
            </div>
            
            <div style={{ padding: "16px", borderRadius: "16px", background: "rgba(30,41,59,0.5)", border: "1px solid rgba(51,65,85,0.5)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <ShieldCheck style={{ width: "16px", height: "16px", color: "#ef4444" }} />
                <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Smart City Use Cases</h4>
              </div>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>Intelligent intersection control, restricted zone enforcement, parking management, highway analytics, and ALPR access control integrations.</p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
