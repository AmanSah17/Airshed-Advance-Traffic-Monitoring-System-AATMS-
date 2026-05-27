import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import maplibregl from "maplibre-gl";
import {  MapboxOverlay } from "@deck.gl/mapbox";
import {  HexagonLayer } from "@deck.gl/aggregation-layers";
import {  ArcLayer } from "@deck.gl/layers";
import {  TripsLayer } from "@deck.gl/geo-layers";
import "maplibre-gl/dist/maplibre-gl.css";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { 
  BarChart3, RefreshCw, Trash2, TrendingUp, TrendingDown, Activity,
  Camera, MapPin, Layers, Globe, Flame, Car, Truck, Users, Bike,
  Navigation, Eye, EyeOff, Filter, ChevronDown, Zap, Clock, CloudRain, Hexagon, Component, Route,
  ArrowUpRight, ArrowDownRight, Signal, AlertTriangle, CheckCircle2
} from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

// ── Delhi node coordinates (parsed from GeoJSON centroids) ──
const NODE_CENTROIDS = {
  "node_0":    { lat: 28.60516, lng: 77.21443, label: "ITO Junction"           },
  "node_1":    { lat: 28.60767, lng: 77.20533, label: "Kashmere Gate"           },
  "node_2":    { lat: 28.60922, lng: 77.20873, label: "Chandni Chowk Entry"     },
  "node_3":    { lat: 28.61060, lng: 77.21200, label: "SP Mukherjee Marg"       },
  "node_4":    { lat: 28.61025, lng: 77.21831, label: "Shyama Prasad East"      },
  "node_7":    { lat: 28.60075, lng: 77.21766, label: "Delhi Gate South"        },
  "ref_zone_0":{ lat: 28.60119, lng: 77.20492, label: "Reference Zone A"       },
  "ref_zone_1":{ lat: 28.60423, lng: 77.21147, label: "Reference Zone B"       },
  "ref_zone_7":{ lat: 28.60700, lng: 77.21791, label: "Reference Zone C"       },
  "default":   { lat: 28.61390, lng: 77.20900, label: "AATMS Delhi HQ"          },
};

// Map default center over Delhi (all nodes span ~28.596 to 28.612 lat, 77.203 to 77.226 lng)
const DELHI_CENTER = [77.2105, 28.6054];  // centroid of all nodes
const DELHI_ZOOM   = 14;

// Vehicle class config — all classes from real AATMS data
const CLASS_CONFIG = {
  car:                { color: "#6366f1", Icon: Car,    label: "Cars"              },
  truck:              { color: "#f59e0b", Icon: Truck,  label: "Trucks"            },
  "heavy-duty-truck": { color: "#dc2626", Icon: Truck,  label: "HGV / Heavy Trucks"},
  "motor-bike":       { color: "#ec4899", Icon: Bike,   label: "Motor Bikes"       },
  auto:               { color: "#8b5cf6", Icon: Car,    label: "Auto Rickshaw"     },
  person:             { color: "#10b981", Icon: Users,  label: "Pedestrians"       },
  bus:                { color: "#06b6d4", Icon: Truck,  label: "Buses"             },
  "small-truck":      { color: "#f97316", Icon: Truck,  label: "Small Trucks"      },
  motorcycle:         { color: "#d946ef", Icon: Bike,   label: "Motorcycles"       },
  "e-rickshaw(toto)": { color: "#84cc16", Icon: Bike,   label: "E-Rickshaw"        },
  "vikram-auto":      { color: "#14b8a6", Icon: Car,    label: "Vikram Auto"       },
  scooty:             { color: "#fb923c", Icon: Bike,   label: "Scooty"            },
  bicycle:            { color: "#a855f7", Icon: Bike,   label: "Bicycles"          },
};

const DARK_STYLE  = "https://tiles.openfreemap.org/styles/dark";
const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/bright";
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Esri, Maxar"
    }
  },
  layers: [{ id: "satellite-layer", type: "raster", source: "satellite", minzoom: 0, maxzoom: 19 }]
};

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#a855f7","#06b6d4","#ec4899","#84cc16"];

// Custom tooltip
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:12, padding:"10px 14px", fontSize:12 }}>
      {label && <p style={{ color:"#94a3b8", marginBottom:6, fontWeight:600 }}>{label}</p>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
          <span style={{ width:8, height:8, borderRadius:2, background:p.color, display:"inline-block" }} />
          <span style={{ color:"#cbd5e1" }}>{p.name || p.dataKey}:</span>
          <span style={{ fontWeight:700, color:"#f1f5f9" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// Animated stat card
const StatCard = ({ icon: Icon, label, value, sub, color, trend }) => (
  <div style={{
    background:"rgba(15,23,42,0.7)", border:`1px solid ${color}22`,
    borderRadius:20, padding:"20px 22px", display:"flex", flexDirection:"column", gap:8,
    position:"relative", overflow:"hidden",
    boxShadow:`0 0 30px ${color}10`
  }}>
    <div style={{ position:"absolute", top:0, right:0, width:80, height:80,
      background:`radial-gradient(circle, ${color}18 0%, transparent 70%)`, borderRadius:"0 20px 0 80px" }} />
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ width:38, height:38, borderRadius:12, background:`${color}18`,
        border:`1px solid ${color}33`, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Icon style={{ width:18, height:18, color }} />
      </div>
      {trend !== undefined && (
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11,
          color: trend >= 0 ? "#10b981" : "#f43f5e", fontWeight:700 }}>
          {trend >= 0 ? <ArrowUpRight style={{width:14,height:14}}/> : <ArrowDownRight style={{width:14,height:14}}/>}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
    <div>
      <div style={{ fontSize:28, fontWeight:800, color:"#f8fafc", lineHeight:1.1 }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.08em", marginTop:4 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:"#475569", marginTop:3 }}>{sub}</div>}
    </div>
  </div>
);

// Layer toggle pill
const LayerPill = ({ active, color, Icon, label, onClick }) => (
  <button onClick={onClick} style={{
    display:"flex", alignItems:"center", gap:6, padding:"6px 12px",
    borderRadius:20, border:`1px solid ${active ? color : "#334155"}`,
    background: active ? `${color}18` : "transparent",
    color: active ? color : "#64748b",
    fontSize:12, fontWeight:600, cursor:"pointer",
    transition:"all 0.2s ease"
  }}>
    {Icon && <Icon style={{ width:13, height:13 }} />}
    {label}
  </button>
);

export default function AnalyticsDashboard({ cameraId: propCameraId }) {
  const mapContainer = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef({});

  const [cameras,       setCameras]       = useState([]);
  const [selectedCam,   setSelectedCam]   = useState(propCameraId || "default");
  const [summary,       setSummary]       = useState(null);
  const [allCamStats,   setAllCamStats]   = useState({});
  const [loading,       setLoading]       = useState(false);
  const [mapTheme,      setMapTheme]      = useState("dark");
  const [showHeatmap,   setShowHeatmap]   = useState(true);
  const [showHexbins,   setShowHexbins]   = useState(false);
  const [showArcs,      setShowArcs]      = useState(false);
  const [showTrips,     setShowTrips]     = useState(false);
  const [tripsCache,    setTripsCache]    = useState(null);
  const [sankeyData,    setSankeyData]    = useState(null);
  const [showBuildings, setShowBuildings] = useState(false);
  const [timeSlider,    setTimeSlider]    = useState(24);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [weatherData,   setWeatherData]   = useState(null);
  const [heatmapCache,  setHeatmapCache]  = useState(null);
  const [arcCache,      setArcCache]      = useState(null);
  const deckOverlayRef = useRef(null);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [showZones,     setShowZones]     = useState(true);   // toggle polygon zone overlays
  const [visLayers,     setVisLayers]     = useState({
    car:true, truck:true, person:true, motorcycle:true, bus:true, bicycle:true
  });
  const [mapReady,      setMapReady]      = useState(false);
  const [nodesSummary,  setNodesSummary]  = useState([]);     // full per-node summary
  const [activeSection, setActiveSection] = useState("overview");
  // ── Timeseries / density state ────────────────────────────
  const [dateFrom,      setDateFrom]      = useState("2026-05-26");
  const [dateTo,        setDateTo]        = useState("2026-05-27");
  const [tsInterval,    setTsInterval]    = useState("hour");  // hour | day
  const [timeseries,    setTimeseries]    = useState([]);      // [{camera_id, timeseries:[]}]
  const [synthLog,      setSynthLog]      = useState(null);    // synthesis transparency log
  const [tsLoading,     setTsLoading]     = useState(false);

  // ── Fetch helpers ────────────────────────────────────────
  const fetchCameras = useCallback(() => {
    axios.get(`${API_BASE}/cameras`).then(r => {
      // Enrich cameras with known labels from NODE_CENTROIDS
      const enriched = r.data.map(c => ({
        ...c,
        label: NODE_CENTROIDS[c.id]?.label || c.name
      }));
      setCameras(enriched);
    }).catch(console.error);
  }, []);

  const fetchSummary = useCallback((camId) => {
    setLoading(true);
    axios.get(`${API_BASE}/analytics/summary`, { params: { camera_id: camId } })
      .then(r => { setSummary(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fetchAllNodeStats = useCallback(async (cams) => {
    // Try the fast /nodes_summary endpoint first
    try {
      const r = await axios.get(`${API_BASE}/analytics/nodes_summary`);
      const map = {};
      r.data.forEach(n => { map[n.camera_id] = n; });
      setNodesSummary(r.data);
      setAllCamStats(map);
    } catch {
      // fallback: individual calls
      const results = {};
      await Promise.all(cams.map(async (cam) => {
        try {
          const r = await axios.get(`${API_BASE}/analytics/summary`, { params: { camera_id: cam.id } });
          results[cam.id] = r.data;
        } catch { results[cam.id] = null; }
      }));
      setAllCamStats(results);
    }
  }, []);

  const fetchTimeseries = useCallback(async (from, to, interval) => {
    setTsLoading(true);
    try {
      const r = await axios.get(`${API_BASE}/analytics/timeseries_multinode`, {
        params: { date_from: from, date_to: to, interval }
      });
      setTimeseries(r.data);
    } catch(e) { console.error("Timeseries fetch failed", e); }
    setTsLoading(false);
  }, []);

  const fetchSynthLog = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE}/analytics/synthesis_log`);
      setSynthLog(r.data);
    } catch(e) { console.error("Synth log fetch failed", e); }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, []);

  useEffect(() => {
    if (cameras.length) fetchAllNodeStats(cameras);
  }, [cameras]);

  useEffect(() => {
    fetchSummary(selectedCam);
  }, [selectedCam]);

  // Fetch timeseries when Density tab is activated or date range changes
  useEffect(() => {
    if (activeSection === "density") {
      fetchTimeseries(dateFrom, dateTo, tsInterval);
      fetchSynthLog();
    }
  }, [activeSection, dateFrom, dateTo, tsInterval]);


  // ── Advanced Data Fetching (Weather & DeckGL Caches) ─────
  useEffect(() => {
    axios.get("https://api.open-meteo.com/v1/forecast?latitude=28.6139&longitude=77.2090&current=temperature_2m,weather_code,precipitation&timezone=auto")
      .then(res => setWeatherData(res.data.current)).catch(console.error);
    
    axios.get(`${API_BASE}/analytics/heatmap`).then(res => setHeatmapCache(res.data)).catch(console.error);

    // Generate O-D Arcs, Sankey Data, and Trips between real camera nodes
    axios.get(`${API_BASE}/cameras`).then(async res => {
      const cams = res.data;
      const arcs = [];
      
      const nodesMap = {};
      cams.forEach((c, idx) => { nodesMap[c.name] = idx; });
      const linksMap = {};

      for (let i = 0; i < cams.length; i++) {
        for (let j = 0; j < cams.length; j++) {
          if (i === j) continue;
          let totalFlow = 0;
          for (let step = 0; step < 288; step += 3) {
             const flow = Math.random() * 150 + 20;
             totalFlow += flow;
             arcs.push({
               sourceName: cams[i].name,
               targetName: cams[j].name,
               from: [cams[i].longitude, cams[i].latitude],
               to: [cams[j].longitude, cams[j].latitude],
               count: flow,
               timeStep: step
             });
          }
          linksMap[`${i}->${j}`] = { source: i, target: j, value: Math.round(totalFlow) };
        }
      }
      setArcCache(arcs);
      setSankeyData({
         nodes: cams.map(c => ({ name: c.name })),
         links: Object.values(linksMap).filter(l => l.value > 0)
      });

      // Fetch OSRM Routes and synthesize exact street trips
      try {
        const generatedTrips = [];
        for (let i = 0; i < cams.length; i++) {
          for (let j = 0; j < cams.length; j++) {
            if (i === j) continue;
            // Fetch route
            const routeRes = await axios.get(`http://router.project-osrm.org/route/v1/driving/${cams[i].longitude},${cams[i].latitude};${cams[j].longitude},${cams[j].latitude}?geometries=geojson`);
            const pathCoords = routeRes.data.routes[0]?.geometry?.coordinates;
            if (pathCoords && pathCoords.length > 1) {
              // Generate 50 trips along this path distributed across the day
              for(let t=0; t<50; t++) {
                 const startTime = Math.floor(Math.random() * 287); // random 5-min interval
                 const timestamps = [];
                 // Assume each segment takes 2 units of time (10 minutes)
                 let currTime = startTime;
                 for(let k=0; k<pathCoords.length; k++) {
                   timestamps.push(currTime);
                   currTime += 0.5; // slow movement
                 }
                 generatedTrips.push({
                    vendor: t % 2 === 0 ? 0 : 1, // Color differentiation
                    path: pathCoords,
                    timestamps: timestamps
                 });
              }
            }
          }
        }
        setTripsCache(generatedTrips);
      } catch (err) { console.error("OSRM failed", err); }

    }).catch(console.error);
  }, []);

  // ── Time Slider Animation (5-min intervals) ──
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimeSlider(prev => (prev >= 287 ? 0 : prev + 1));
      }, 200); // Fast playback for 5-min intervals
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // ── Deck.GL Overlay & 3D Buildings ──
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;

    if (!deckOverlayRef.current) {
      deckOverlayRef.current = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(deckOverlayRef.current);
    }
    
    const layers = [];
    if (showHexbins && heatmapCache) {
      layers.push(new HexagonLayer({
        id: 'hexbin-layer',
        data: heatmapCache.features,
        getPosition: d => d.geometry.coordinates,
        elevationScale: 4,
        extruded: true,
        radius: 80,
        opacity: 0.7,
        coverage: 0.9,
        colorRange: [[16,185,129],[132,204,22],[250,204,21],[249,115,22],[239,68,68],[153,27,27]]
      }));
    }

    if (showArcs && arcCache) {
      // Show arcs within a 15-min window (3 steps of 5 mins)
      const activeArcs = arcCache.filter(a => Math.abs(a.timeStep - timeSlider) <= 3);
      layers.push(new ArcLayer({
        id: 'arc-layer',
        data: activeArcs,
        getSourcePosition: d => d.from,
        getTargetPosition: d => d.to,
        getSourceColor: [16,185,129],
        getTargetColor: [249,115,22],
        getWidth: d => d.count / 20,
        opacity: 0.8,
        getTilt: d => 15
      }));
    }

        
    if (showTrips && tripsCache) {
      layers.push(new TripsLayer({
        id: 'trips-layer',
        data: tripsCache,
        getPath: d => d.path,
        getTimestamps: d => d.timestamps,
        getColor: d => (d.vendor === 0 ? [253, 128, 93] : [23, 184, 190]),
        opacity: 0.8,
        widthMinPixels: 4,
        rounded: true,
        trailLength: 5,
        currentTime: timeSlider,
        shadowEnabled: false
      }));
    }
    
    deckOverlayRef.current.setProps({ layers });

    // Robust 3D Buildings integration
    if (showBuildings) {
      if (!map.getLayer('3d-buildings-ext')) {
        const sources = map.getStyle().sources;
        const vectorSourceId = Object.keys(sources).find(k => sources[k].type === 'vector');
        if (vectorSourceId) {
          map.addLayer({
            'id': '3d-buildings-ext',
            'source': vectorSourceId,
            'source-layer': 'building', // Standard openmaptiles layer
            'type': 'fill-extrusion',
            'minzoom': 14,
            'paint': {
              'fill-extrusion-color': '#1e293b',
              'fill-extrusion-height': ['get', 'render_height'],
              'fill-extrusion-base': ['get', 'render_min_height'],
              'fill-extrusion-opacity': 0.8
            }
          });
        }
      }
    } else {
      if (map.getLayer('3d-buildings-ext')) {
        map.removeLayer('3d-buildings-ext');
      }
    }

  }, [showHexbins, showArcs, showBuildings, timeSlider, mapReady, heatmapCache, arcCache, tripsCache, showTrips]);

  // ── Map ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current) return;
    const style = mapTheme === "dark" ? DARK_STYLE : (mapTheme === "light" ? LIGHT_STYLE : SATELLITE_STYLE);
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style,
      center: DELHI_CENTER,
      zoom: DELHI_ZOOM,
      pitch: mapTheme === "satellite" ? 0 : 45,
      bearing: mapTheme === "satellite" ? 0 : -10,
      antialias: true
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass:false }), "top-right");

    map.on("load", () => {
      setMapReady(true);

      // ── Load GeoJSON polygon zones ────────────────────────────
      axios.get(`${API_BASE}/analytics/geojson`).then(res => {
        if (!map.getSource("zones-src")) {
          map.addSource("zones-src", { type:"geojson", data: res.data });
          // Fill polygons
          map.addLayer({ id:"zones-fill", type:"fill", source:"zones-src",
            paint: {
              "fill-color": ["case",
                ["has","name",["get","properties"]], "#6366f1", "#334155"],
              "fill-opacity": 0.12
            }
          });
          // Stroke polygons
          map.addLayer({ id:"zones-stroke", type:"line", source:"zones-src",
            paint: {
              "line-color": ["case",
                ["has","name",["get","properties"]], "#818cf8", "#475569"],
              "line-width": 1.5,
              "line-dasharray": [3,2]
            }
          });
        }
      }).catch(console.error);

      // ── Heatmap data (only when heatmap mode active) ──────
      if (showHeatmap) {
        axios.get(`${API_BASE}/analytics/heatmap`).then(res => {
          if (map.getSource("heat-src")) return;
          map.addSource("heat-src", { type:"geojson", data: res.data });
          map.addLayer({
            id:"heat-layer", type:"heatmap", source:"heat-src",
            paint: {
              "heatmap-weight": 0.2, // Normalize for 10K+ records per node
              "heatmap-intensity":["interpolate",["linear"],["zoom"],0,0.5,18,3],
              "heatmap-color":["interpolate",["linear"],["heatmap-density"],
                0,"rgba(0,0,255,0)", 0.1,"#312e81", 0.3,"#4f46e5", 0.6,"#06b6d4", 0.8,"#10b981", 1,"#f59e0b"],
              "heatmap-radius":["interpolate",["linear"],["zoom"],0,2,14,20,18,40],
              "heatmap-opacity":0.85
            }
          });
          map.addLayer({
            id:"heat-pts", type:"circle", source:"heat-src", minzoom:13,
            paint: {
              "circle-radius":["interpolate",["linear"],["zoom"],13,3,18,10],
              "circle-color":["match",["get","class_name"],
                "car","#6366f1", "truck","#f59e0b", "person","#10b981",
                "motorcycle","#ec4899", "bus","#06b6d4", "#a855f7"],
              "circle-stroke-width":1.5, "circle-stroke-color":"#fff", "circle-opacity":0.9
            }
          });
          const popup = new maplibregl.Popup({ closeButton:false, closeOnClick:false });
          map.on("mouseenter","heat-pts",(e) => {
            map.getCanvas().style.cursor = "pointer";
            const p = e.features[0].properties;
            const coord = e.features[0].geometry.coordinates.slice();
            popup.setLngLat(coord).setHTML(`
              <div style="font-family:system-ui;font-size:11px;background:#0f172a;color:#e2e8f0;
                border-radius:10px;padding:10px 12px;border:1px solid #1e293b;min-width:140px">
                <b style="color:#818cf8;font-size:13px">#${p.track_id} ${(p.class_name||"").toUpperCase()}</b>
                <div style="margin-top:6px;color:#94a3b8">Region: <b style="color:#f1f5f9">${p.region_label||"—"}</b></div>
                <div style="color:#94a3b8">Direction: <b style="color:${p.direction==="IN"?"#10b981":"#f59e0b"}">${p.direction}</b></div>
                <div style="color:#94a3b8">Confidence: <b style="color:#f1f5f9">${((p.confidence||0)*100).toFixed(1)}%</b></div>
                <div style="color:#475569;font-size:10px;margin-top:4px">${new Date(p.timestamp).toLocaleTimeString()}</div>
              </div>`).addTo(map);
          });
          map.on("mouseleave","heat-pts",() => { map.getCanvas().style.cursor=""; popup.remove(); });
        }).catch(console.error);
      }
    });

    return () => { setMapReady(false); map.remove(); };
  }, [mapTheme, showHeatmap, showZones]);

  // ── Markers ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    cameras.forEach(cam => {
      const isSelected = cam.id === selectedCam;
      const el = document.createElement("div");
      el.style.cssText = `cursor:pointer;width:${isSelected?44:32}px;height:${isSelected?44:32}px;
        border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:${isSelected?"linear-gradient(135deg,#6366f1,#4f46e5)":"rgba(99,102,241,0.35)"};
        border:${isSelected?"2.5px solid #818cf8":"2px solid #4338ca"};
        box-shadow:${isSelected?"0 0 20px rgba(99,102,241,0.5)":"none"};
        transition:all 0.2s ease`;
      el.innerHTML = `<svg width="${isSelected?18:14}" height="${isSelected?18:14}" viewBox="0 0 24 24" fill="none"
        stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>`;

      el.addEventListener("click", () => {
        setSelectedCam(cam.id);
        map.flyTo({ center:[cam.longitude,cam.latitude], zoom:16, pitch:60, speed:0.9 });
      });

      const labelEl = document.createElement("div");
      labelEl.style.cssText = `position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);
        white-space:nowrap;font-size:10px;font-weight:700;color:${isSelected?"#818cf8":"#94a3b8"};
        background:rgba(15,23,42,0.85);padding:2px 6px;border-radius:6px;border:1px solid ${isSelected?"#4338ca":"#1e293b"}`;
      labelEl.textContent = cam.name;

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "position:relative;";
      wrapper.appendChild(el);
      wrapper.appendChild(labelEl);

      const marker = new maplibregl.Marker({ element:wrapper })
        .setLngLat([cam.longitude, cam.latitude])
        .addTo(map);
      markersRef.current[cam.id] = marker;
    });

    if (cameras.length && !cameras.find(c => c.id === selectedCam)) {
      setSelectedCam(cameras[0].id);
    }
  }, [cameras, mapReady, selectedCam]);

  // ── Data derivations ───────────────────────────────────
  const classData = summary?.class_distribution
    ? Object.entries(summary.class_distribution)
        .filter(([cls]) => visLayers[cls] !== false)
        .map(([name, value]) => ({ name, value, fill: CLASS_CONFIG[name]?.color || COLORS[0] }))
    : [];

  const directionData = summary?.direction_distribution
    ? Object.entries(summary.direction_distribution).map(([name, value]) => ({ name, value }))
    : [];

  const timeSeriesData = (summary?.time_series || []);

  // Multi-node comparison data
  const nodeComparisonData = cameras.map(cam => ({
    name: cam.name.replace(/AATMS /i,"").substring(0,18),
    total: allCamStats[cam.id]?.total_vehicles || 0,
    IN:    allCamStats[cam.id]?.direction_distribution?.IN || 0,
    OUT:   allCamStats[cam.id]?.direction_distribution?.OUT || 0,
  }));

  const totalAll = nodeComparisonData.reduce((a,c) => a+c.total, 0);
  const selectedStats = allCamStats[selectedCam];
  const selectedCamera = cameras.find(c => c.id === selectedCam);

  const sectionBtnStyle = (s) => ({
    padding:"8px 16px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer",
    border:`1px solid ${activeSection===s?"#6366f1":"#1e293b"}`,
    background: activeSection===s?"rgba(99,102,241,0.15)":"transparent",
    color: activeSection===s?"#818cf8":"#475569",
    transition:"all 0.2s ease"
  });

  return (
    <div style={{
      display:"flex", flexDirection:"column", gap:0,
      height:"calc(100vh - 180px)", overflow:"hidden",
      background:"rgba(2,6,23,0.5)", borderRadius:24,
      border:"1px solid rgba(30,41,59,0.8)"
    }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        padding:"16px 24px", borderBottom:"1px solid rgba(30,41,59,0.8)",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        background:"rgba(15,23,42,0.6)", flexShrink:0
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:12, background:"rgba(99,102,241,0.2)",
            border:"1px solid rgba(99,102,241,0.4)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Zap style={{ width:18, height:18, color:"#818cf8" }} />
          </div>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800, color:"#f1f5f9", margin:0 }}>Digital Twin Analytics</h2>
            <p style={{ fontSize:11, color:"#475569", margin:0 }}>
              {cameras.length} nodes · {totalAll.toLocaleString()} total tracked · PostgreSQL live
            </p>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {/* Section pills */}
          {[
            { id:"overview", label:"Overview",   icon:BarChart3  },
            { id:"density",  label:"Density",    icon:Flame      }
          ].map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={sectionBtnStyle(s.id)}>
              <s.icon style={{ width:12, height:12, display:"inline", marginRight:5, verticalAlign:"middle" }} />
              {s.label}
            </button>
          ))}
          <button onClick={() => fetchSummary(selectedCam)} disabled={loading}
            style={{ padding:"8px 14px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer",
              border:"1px solid #1e293b", background:"rgba(30,41,59,0.5)", color:"#94a3b8",
              display:"flex", alignItems:"center", gap:6 }}>
            <RefreshCw style={{ width:13, height:13, animation: loading?"spin 1s linear infinite":"none" }} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Scrollable Master Container ─────────────────────────── */}
      <div style={{
        flex:1, overflowY:"auto", overflowX:"hidden", padding:"20px 24px",
        scrollbarWidth:"thin", scrollbarColor:"rgba(99,102,241,0.3) transparent"
      }}>

        
        {/* ── HERO MAP SECTION ─────────────────────────────────── */}
        <div style={{ marginBottom:24, display:"grid", gridTemplateColumns:"1fr 320px", gap:16 }}>
          {/* Map canvas */}
          <div style={{ borderRadius:18, overflow:"hidden", border:"1px solid rgba(30,41,59,0.8)",
            height:560, position:"relative", boxShadow:"0 10px 30px rgba(0,0,0,0.5)" }}>
            <div ref={mapContainer} style={{ width:"100%", height:"100%" }} />

            {/* Weather Widget */}
            {weatherData && (
              <div style={{ position:"absolute", top:16, left:16, zIndex:10, 
                background:"rgba(15,23,42,0.85)", backdropFilter:"blur(8px)",
                borderRadius:12, border:"1px solid rgba(99,102,241,0.4)",
                padding:"12px", color:"#cbd5e1", display:"flex", alignItems:"center", gap:12 }}>
                <div>
                  <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", fontWeight:800 }}>Delhi Live</div>
                  <div style={{ fontSize:18, fontWeight:700, color:"#f8fafc" }}>{weatherData.temperature_2m}°C</div>
                </div>
                <CloudRain style={{ width:24, height:24, color:"#60a5fa" }} />
                <div style={{ fontSize:11, color:"#94a3b8" }}>
                  Precip: <span style={{color:"#f8fafc"}}>{weatherData.precipitation}mm</span><br/>
                  <span style={{color:"#8b5cf6"}}>Conditions optimal.</span>
                </div>
              </div>
            )}

            {/* Time Slider */}
            <div style={{ position:"absolute", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:10, 
              background:"rgba(15,23,42,0.85)", backdropFilter:"blur(8px)",
              borderRadius:20, border:"1px solid rgba(99,102,241,0.4)",
              padding:"12px 24px", color:"#cbd5e1", display:"flex", alignItems:"center", gap:16, width:"60%", minWidth:400 }}>
              <button onClick={() => setIsPlaying(!isPlaying)} style={{ background:"#6366f1", border:"none", borderRadius:"50%", width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", color:"white", cursor:"pointer" }}>
                {isPlaying ? <span style={{fontWeight:800}}>||</span> : <Zap style={{width:16,height:16}}/>}
              </button>
              <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, fontWeight:700, marginBottom:4 }}>
                  <span>00:00 (Yesterday)</span>
                  <span style={{ color:"#818cf8", textTransform:"uppercase", letterSpacing:"0.05em" }}>
                    Temporal Animation: {String(Math.floor((timeSlider * 5) / 60)).padStart(2, '0')}:{String((timeSlider * 5) % 60).padStart(2, '0')}
                  </span>
                  <span>24:00 (Now)</span>
                </div>
                <input type="range" min="0" max="287" value={timeSlider} onChange={e => setTimeSlider(parseInt(e.target.value))} 
                  style={{ width:"100%", accentColor:"#6366f1", cursor:"pointer" }} />
              </div>
            </div>

            
            {/* Floating Map Layers Control */}
            <div style={{ position:"absolute", top:16, right:16, zIndex:10 }}>
              <div style={{ background:"rgba(15,23,42,0.85)", backdropFilter:"blur(8px)",
                borderRadius:12, border:"1px solid rgba(99,102,241,0.4)",
                padding:"8px", color:"#cbd5e1", display:"flex", flexDirection:"column", alignItems:"flex-end",
                minWidth:140 }}>
                <button onClick={() => setShowLayerMenu(!showLayerMenu)}
                  style={{ background:"transparent", border:"none", color:"#f1f5f9", cursor:"pointer",
                    display:"flex", alignItems:"center", gap:6, fontWeight:700, fontSize:12 }}>
                  <Layers style={{ width:16, height:16 }} />
                  Map Layers
                </button>
                {showLayerMenu && (
                  <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:10, alignItems:"flex-start", width:"100%", padding:"0 4px 4px 4px" }}>
                    <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:800 }}>Base Map</div>
                    {[
                      { id:"dark", label:"OSM Dark" },
                      { id:"light", label:"Light" },
                      { id:"satellite", label:"Satellite" }
                    ].map(t => (
                      <label key={t.id} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer", color:mapTheme===t.id?"#f1f5f9":"#94a3b8", fontWeight:mapTheme===t.id?700:500 }}>
                        <input type="radio" name="mapTheme" value={t.id} checked={mapTheme===t.id}
                          onChange={() => setMapTheme(t.id)}
                          style={{ accentColor:"#6366f1", width:14, height:14 }} />
                        {t.label}
                      </label>
                    ))}
                    <div style={{ height:1, background:"rgba(255,255,255,0.1)", width:"100%", margin:"2px 0" }} />
                    <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:800 }}>Data Overlays</div>
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer", color:showHeatmap?"#f1f5f9":"#94a3b8", fontWeight:showHeatmap?700:500 }}>
                      <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)}
                        style={{ accentColor:"#f59e0b", width:14, height:14 }} />
                      <Flame style={{ width:12, height:12, color:"#f59e0b" }} /> Heatmap
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer", color:showZones?"#f1f5f9":"#94a3b8", fontWeight:showZones?700:500 }}>
                      <input type="checkbox" checked={showZones} onChange={e => setShowZones(e.target.checked)}
                        style={{ accentColor:"#10b981", width:14, height:14 }} />
                      <MapPin style={{ width:12, height:12, color:"#10b981" }} /> Polygon Zones
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer", color:showHexbins?"#f1f5f9":"#94a3b8", fontWeight:showHexbins?700:500 }}>
                      <input type="checkbox" checked={showHexbins} onChange={e => setShowHexbins(e.target.checked)}
                        style={{ accentColor:"#8b5cf6", width:14, height:14 }} />
                      <Hexagon style={{ width:12, height:12, color:"#8b5cf6" }} /> 3D Hexbins
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer", color:showArcs?"#f1f5f9":"#94a3b8", fontWeight:showArcs?700:500 }}>
                      <input type="checkbox" checked={showArcs} onChange={e => setShowArcs(e.target.checked)}
                        style={{ accentColor:"#f43f5e", width:14, height:14 }} />
                      <Component style={{ width:12, height:12, color:"#f43f5e" }} /> Flow Arcs
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer", color:showTrips?"#f1f5f9":"#94a3b8", fontWeight:showTrips?700:500 }}>
                      <input type="checkbox" checked={showTrips} onChange={e => setShowTrips(e.target.checked)}
                        style={{ accentColor:"#06b6d4", width:14, height:14 }} />
                      <Route style={{ width:12, height:12, color:"#06b6d4" }} /> Road Trips
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer", color:showBuildings?"#f1f5f9":"#94a3b8", fontWeight:showBuildings?700:500 }}>
                      <input type="checkbox" checked={showBuildings} onChange={e => setShowBuildings(e.target.checked)}
                        style={{ accentColor:"#3b82f6", width:14, height:14 }} />
                      <Activity style={{ width:12, height:12, color:"#3b82f6" }} /> 3D Buildings
                    </label>

                  </div>
                )}
              </div>
            </div>

            {!mapReady && (
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
                justifyContent:"center", background:"rgba(2,6,23,0.8)", borderRadius:18 }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                  <div style={{ width:32, height:32, borderRadius:"50%",
                    border:"3px solid #6366f1", borderTopColor:"transparent",
                    animation:"spin 0.8s linear infinite" }} />
                  <span style={{ color:"#64748b", fontSize:13 }}>Loading map...</span>
                </div>
              </div>
            )}
          </div>

          {/* Node sidebar */}
          <div style={{ display:"flex", flexDirection:"column", gap:10, overflowY:"auto",
            maxHeight:560, scrollbarWidth:"thin", scrollbarColor:"rgba(99,102,241,0.2) transparent" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase",
              letterSpacing:"0.08em", paddingBottom:8, borderBottom:"1px solid #1e293b", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span>Camera Nodes ({cameras.length})</span>
            </div>
            {cameras.map(cam => {
              const stats = allCamStats[cam.id];
              const isActive = cam.id === selectedCam;
              return (
                <div key={cam.id}
                  onClick={() => {
                    setSelectedCam(cam.id);
                    mapRef.current?.flyTo({ center:[cam.longitude,cam.latitude], zoom:16, pitch:mapTheme==="satellite"?0:60, speed:0.9 });
                  }}
                  style={{ padding:"12px 14px", borderRadius:14, cursor:"pointer",
                    border:`1px solid ${isActive?"rgba(99,102,241,0.5)":"rgba(30,41,59,0.6)"}`,
                    background: isActive?"rgba(99,102,241,0.08)":"rgba(15,23,42,0.4)",
                    transition:"all 0.2s ease" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%",
                      background: isActive?"#10b981":"#334155",
                      boxShadow: isActive?"0 0 8px #10b98188":"none" }} />
                    <span style={{ fontSize:13, fontWeight:700, color: isActive?"#f1f5f9":"#94a3b8" }}>
                      {cam.name}
                    </span>
                  </div>
                  <div style={{ fontSize:10, color:"#475569", fontFamily:"monospace", marginBottom:8 }}>
                    {cam.latitude?.toFixed(4)}, {cam.longitude?.toFixed(4)}
                  </div>
                  {stats && (
                    <div style={{ display:"flex", gap:8 }}>
                      <div style={{ flex:1, textAlign:"center", padding:"6px 4px", borderRadius:8,
                        background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.15)" }}>
                        <div style={{ fontSize:16, fontWeight:800, color:"#818cf8" }}>
                          {stats.total_vehicles?.toLocaleString() || 0}
                        </div>
                        <div style={{ fontSize:9, color:"#475569", textTransform:"uppercase", fontWeight:600 }}>Total</div>
                      </div>
                      <div style={{ flex:1, textAlign:"center", padding:"6px 4px", borderRadius:8,
                        background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.15)" }}>
                        <div style={{ fontSize:16, fontWeight:800, color:"#10b981" }}>
                          {stats.direction_distribution?.IN || 0}
                        </div>
                        <div style={{ fontSize:9, color:"#475569", textTransform:"uppercase", fontWeight:600 }}>IN</div>
                      </div>
                      <div style={{ flex:1, textAlign:"center", padding:"6px 4px", borderRadius:8,
                        background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.15)" }}>
                        <div style={{ fontSize:16, fontWeight:800, color:"#f59e0b" }}>
                          {stats.direction_distribution?.OUT || 0}
                        </div>
                        <div style={{ fontSize:9, color:"#475569", textTransform:"uppercase", fontWeight:600 }}>OUT</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── TOP STAT CARDS ─────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14, marginBottom:20 }}>
          <StatCard icon={Activity}   label="Total Tracked" value={summary?.total_vehicles||0}
            color="#6366f1" sub="All classes combined" trend={4} />
          <StatCard icon={ArrowUpRight} label="Incoming (IN)" value={summary?.direction_distribution?.IN||0}
            color="#10b981" sub="Entering monitored zone" trend={2} />
          <StatCard icon={ArrowDownRight} label="Outgoing (OUT)" value={summary?.direction_distribution?.OUT||0}
            color="#f59e0b" sub="Exiting monitored zone" />
          <StatCard icon={Camera}     label="Active Nodes"  value={cameras.length}
            color="#06b6d4" sub="Camera nodes online" />
          <StatCard icon={Signal}     label="Network Events" value={totalAll}
            color="#a855f7" sub="Across all nodes" />
        </div>

        {/* ── CLASS LAYER TOGGLES ─────────────────────────────────── */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, flexWrap:"wrap",
          padding:"12px 16px", background:"rgba(15,23,42,0.5)", borderRadius:14,
          border:"1px solid rgba(30,41,59,0.6)" }}>
          <span style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.08em", marginRight:4 }}>
            <Filter style={{ width:11, height:11, display:"inline", marginRight:4 }} />
            Vehicle Layers:
          </span>
          {Object.entries(CLASS_CONFIG).map(([cls, cfg]) => (
            <LayerPill key={cls}
              active={visLayers[cls]}
              color={cfg.color}
              Icon={cfg.Icon}
              label={cfg.label}
              onClick={() => setVisLayers(v => ({ ...v, [cls]: !v[cls] }))}
            />
          ))}
        </div>

        {/* ── SECTION: OVERVIEW ─────────────────────────────────── */}
        {(activeSection === "overview" || activeSection === "density") && (
          <>
            {/* Charts row */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>

              {/* Bar: Class Breakdown */}
              <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)", padding:"18px 20px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                  <BarChart3 style={{ width:15, height:15, color:"#6366f1" }} />
                  <span style={{ fontSize:12, fontWeight:700, color:"#cbd5e1" }}>Vehicle Class Breakdown</span>
                </div>
                <div style={{ height:220 }}>
                  {classData.length === 0 ? (
                    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                      color:"#334155", fontSize:12 }}>No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classData} margin={{ top:4, right:4, left:-20, bottom:4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                        <XAxis dataKey="name" stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                        <YAxis stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                        <Tooltip content={<DarkTooltip />} />
                        <Bar dataKey="value" radius={[6,6,0,0]}>
                          {classData.map((e,i) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Pie: Direction */}
              <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)", padding:"18px 20px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                  <Navigation style={{ width:15, height:15, color:"#10b981" }} />
                  <span style={{ fontSize:12, fontWeight:700, color:"#cbd5e1" }}>Traffic Direction Ratio</span>
                </div>
                <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {directionData.length === 0 ? (
                    <div style={{ color:"#334155", fontSize:12 }}>No direction data</div>
                  ) : (
                    <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center" }}>
                      <ResponsiveContainer width="55%" height="100%">
                        <PieChart>
                          <Pie data={directionData} cx="50%" cy="50%"
                            innerRadius={50} outerRadius={72} paddingAngle={5} dataKey="value">
                            {directionData.map((e,i) => (
                              <Cell key={i} fill={e.name==="IN"?"#10b981":"#f59e0b"} />
                            ))}
                          </Pie>
                          <Tooltip content={<DarkTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display:"flex", flexDirection:"column", gap:12, flex:1, paddingLeft:8 }}>
                        {directionData.map(d => (
                          <div key={d.name} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ width:10, height:10, borderRadius:3,
                                background: d.name==="IN"?"#10b981":"#f59e0b", display:"inline-block" }} />
                              <span style={{ fontSize:11, color:"#94a3b8", fontWeight:600 }}>{d.name}</span>
                            </div>
                            <span style={{ fontSize:22, fontWeight:800, color: d.name==="IN"?"#10b981":"#f59e0b", paddingLeft:16 }}>
                              {d.value.toLocaleString()}
                            </span>
                            <div style={{ height:4, background:"#1e293b", borderRadius:4, marginLeft:16, overflow:"hidden" }}>
                              <div style={{
                                height:"100%", borderRadius:4,
                                background: d.name==="IN"?"#10b981":"#f59e0b",
                                width:`${((d.value/(summary?.total_vehicles||1))*100).toFixed(0)}%`,
                                transition:"width 0.6s ease"
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Radar: class-wise activity */}
              <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)", padding:"18px 20px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                  <Activity style={{ width:15, height:15, color:"#a855f7" }} />
                  <span style={{ fontSize:12, fontWeight:700, color:"#cbd5e1" }}>Class Activity Radar</span>
                </div>
                <div style={{ height:220 }}>
                  {classData.length < 3 ? (
                    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                      color:"#334155", fontSize:12 }}>Need ≥3 classes</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={classData}>
                        <PolarGrid stroke="#1e293b" />
                        <PolarAngleAxis dataKey="name" tick={{ fill:"#64748b", fontSize:10 }} />
                        <Radar name="Count" dataKey="value" stroke="#818cf8" fill="#6366f1" fillOpacity={0.3} />
                        <Tooltip content={<DarkTooltip />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Timeseries Area Chart — full width */}
            <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)",
              padding:"18px 20px", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <TrendingUp style={{ width:15, height:15, color:"#06b6d4" }} />
                <span style={{ fontSize:12, fontWeight:700, color:"#cbd5e1" }}>Peak Hour Traffic Trends (Last 24 Hours)</span>
                {selectedCamera && (
                  <span style={{ marginLeft:"auto", fontSize:11, color:"#475569", display:"flex", alignItems:"center", gap:4 }}>
                    <MapPin style={{ width:11, height:11 }} /> {selectedCamera.name}
                  </span>
                )}
              </div>
              <div style={{ height:220 }}>
                {timeSeriesData.length === 0 ? (
                  <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                    color:"#334155", fontSize:12 }}>No timeseries data. Start streaming to generate trends.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeSeriesData} margin={{ top:4, right:8, left:-20, bottom:4 }}>
                      <defs>
                        {Object.entries(CLASS_CONFIG).map(([cls, cfg]) => (
                          <linearGradient key={cls} id={`grad-${cls}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                      <XAxis dataKey="time" stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                      <YAxis stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                      <Tooltip content={<DarkTooltip />} />
                      <Legend wrapperStyle={{ fontSize:11, color:"#64748b", paddingTop:8 }} />
                      {Object.keys(timeSeriesData[0] || {})
                        .filter(k => k !== "time" && visLayers[k] !== false)
                        .map((cls, i) => (
                          <Area key={cls} type="monotone" dataKey={cls}
                            stroke={CLASS_CONFIG[cls]?.color || COLORS[i % COLORS.length]}
                            fill={`url(#grad-${cls})`}
                            strokeWidth={2} dot={false} activeDot={{ r:5 }} />
                        ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── SECTION: MULTI-NODE COMPARISON ─────────────────────── */}
        {(activeSection === "overview" || activeSection === "nodes") && cameras.length > 1 && (
          <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:16, marginBottom:16 }}>
            <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)",
              padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <Signal style={{ width:15, height:15, color:"#f59e0b" }} />
                <span style={{ fontSize:12, fontWeight:700, color:"#cbd5e1" }}>Multi-Node Traffic Comparison</span>
              </div>
            <div style={{ height:220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nodeComparisonData} margin={{ top:4, right:8, left:-20, bottom:4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                  <XAxis dataKey="name" stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                  <YAxis stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                  <Tooltip content={<DarkTooltip />} />
                  <Legend wrapperStyle={{ fontSize:11, color:"#64748b", paddingTop:8 }} />
                  <Bar dataKey="total" name="Total" fill="#6366f1" radius={[4,4,0,0]} />
                  <Bar dataKey="IN"    name="IN"    fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="OUT"   name="OUT"   fill="#f59e0b" radius={[4,4,0,0]} />
                </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sankey Flow Diagram */}
            <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)",
              padding:"18px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <Component style={{ width:15, height:15, color:"#10b981" }} />
                <span style={{ fontSize:12, fontWeight:700, color:"#cbd5e1" }}>Daily Flow Distribution (Sankey)</span>
              </div>
              <div style={{ height:320, width:"100%" }}>
                {sankeyData ? (
                  <ResponsiveContainer>
                    <Sankey
                      data={sankeyData}
                      node={{ fill:"#6366f1", stroke:"#312e81" }}
                      link={{ stroke:"#4f46e5", strokeOpacity: 0.3 }}
                      margin={{ left: 20, right: 20, top: 20, bottom: 20 }}
                    >
                      <Tooltip 
                        contentStyle={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, color:"#f8fafc" }} 
                        itemStyle={{ color:"#e2e8f0" }}
                      />
                    </Sankey>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", color:"#64748b" }}>
                    Generating Flow Analytics...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* ── SECTION: DENSITY / 2-DAY TIMESERIES ──────────────────── */}
        {activeSection === "density" && (
          <div style={{ marginBottom:16 }}>
            {/* Controls bar */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <Clock style={{ width:15, height:15, color:"#6366f1" }} />
              <span style={{ fontSize:12, fontWeight:700, color:"#cbd5e1" }}>2-Day Multi-Node Traffic Density</span>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto", flexWrap:"wrap" }}>
                <span style={{ fontSize:11, color:"#64748b" }}>From</span>
                <input type="date" value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:8, color:"#cbd5e1",
                    padding:"4px 8px", fontSize:11, cursor:"pointer" }} />
                <span style={{ fontSize:11, color:"#64748b" }}>To</span>
                <input type="date" value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:8, color:"#cbd5e1",
                    padding:"4px 8px", fontSize:11, cursor:"pointer" }} />
                {["hour","day"].map(iv => (
                  <button key={iv} onClick={() => setTsInterval(iv)}
                    style={{ padding:"4px 12px", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer",
                      border:`1px solid ${tsInterval===iv?"#6366f1":"#334155"}`,
                      background: tsInterval===iv ? "rgba(99,102,241,0.12)" : "transparent",
                      color: tsInterval===iv ? "#818cf8" : "#64748b" }}>
                    {iv === "hour" ? "Hourly" : "Daily"}
                  </button>
                ))}
                <button onClick={() => fetchTimeseries(dateFrom, dateTo, tsInterval)}
                  style={{ padding:"4px 12px", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer",
                    border:"1px solid #6366f1", background:"rgba(99,102,241,0.12)", color:"#818cf8",
                    display:"flex", alignItems:"center", gap:5 }}>
                  <RefreshCw style={{ width:11, height:11 }} />
                  {tsLoading ? "Loading…" : "Refresh"}
                </button>
              </div>
            </div>

            {/* 48-hr stacked area chart — total across all nodes */}
            {(() => {
              // Merge all node timeseries into a single unified time axis
              const allBuckets = {};
              timeseries.forEach(nodeTs => {
                const shortId = NODE_CENTROIDS[nodeTs.camera_id]?.label || nodeTs.camera_id;
                nodeTs.timeseries.forEach(pt => {
                  const label = tsInterval === "hour"
                    ? new Date(pt.bucket).toLocaleString("en-IN",{month:"short",day:"numeric",hour:"2-digit"})
                    : new Date(pt.bucket).toLocaleDateString("en-IN",{month:"short",day:"numeric"});
                  if (!allBuckets[pt.bucket]) allBuckets[pt.bucket] = { label };
                  allBuckets[pt.bucket][shortId] = (allBuckets[pt.bucket][shortId]||0) + (pt.total||0);
                });
              });
              const chartData = Object.entries(allBuckets)
                .sort(([a],[b]) => a.localeCompare(b))
                .map(([,v]) => v);
              const nodeKeys = timeseries.map(n => NODE_CENTROIDS[n.camera_id]?.label || n.camera_id);
              const nodeColors = ["#6366f1","#10b981","#f59e0b","#ec4899","#06b6d4","#a855f7","#f97316","#84cc16","#14b8a6"];

              return (
                <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)",
                  padding:"16px 18px", marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                    Cumulative Traffic — All Nodes ({tsInterval === "hour" ? "Hourly" : "Daily"})
                  </div>
                  {tsLoading ? (
                    <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center", color:"#334155" }}>Loading timeseries…</div>
                  ) : chartData.length === 0 ? (
                    <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center", color:"#334155", fontSize:12 }}>
                      No data for selected range. Try 2026-05-26 to 2026-05-27.
                    </div>
                  ) : (
                    <div style={{ height:260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top:4, right:12, left:-15, bottom:20 }}>
                          <defs>
                            {nodeKeys.map((k,i) => (
                              <linearGradient key={k} id={`tsGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={nodeColors[i%nodeColors.length]} stopOpacity={0.35} />
                                <stop offset="95%" stopColor={nodeColors[i%nodeColors.length]} stopOpacity={0.02} />
                              </linearGradient>
                            ))}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                          <XAxis dataKey="label" stroke="#334155" fontSize={9} tick={{ fill:"#475569" }}
                            interval={tsInterval==="hour"?5:0} angle={-30} textAnchor="end" />
                          <YAxis stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                          <Tooltip content={<DarkTooltip />} />
                          <Legend wrapperStyle={{ fontSize:10, color:"#64748b", paddingTop:8 }} />
                          {nodeKeys.map((k,i) => (
                            <Area key={k} type="monotone" dataKey={k} name={k} stackId="1"
                              stroke={nodeColors[i%nodeColors.length]}
                              fill={`url(#tsGrad${i})`}
                              strokeWidth={1.5} dot={false} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Per-node daily breakdown bar chart */}
            {(() => {
              // For each node, aggregate total per day
              const perNodeDayData = [];
              timeseries.forEach(nodeTs => {
                const label = NODE_CENTROIDS[nodeTs.camera_id]?.label || nodeTs.camera_id;
                const dayTotals = {};
                nodeTs.timeseries.forEach(pt => {
                  const day = pt.bucket.slice(0,10);
                  dayTotals[day] = (dayTotals[day]||0) + (pt.total||0);
                });
                const row = { node: label.split(" ").slice(0,2).join(" ") };
                Object.entries(dayTotals).forEach(([d,v]) => { row[d] = v; });
                perNodeDayData.push(row);
              });
              const dayKeys = [...new Set(timeseries.flatMap(n => n.timeseries.map(p=>p.bucket.slice(0,10))))].sort();

              return perNodeDayData.length > 0 && (
                <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)",
                  padding:"16px 18px", marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                    Per-Node Daily Volume Comparison
                  </div>
                  <div style={{ height:220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perNodeDayData} margin={{ top:4, right:12, left:-15, bottom:4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                        <XAxis dataKey="node" stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                        <YAxis stroke="#334155" fontSize={10} tick={{ fill:"#64748b" }} />
                        <Tooltip content={<DarkTooltip />} />
                        <Legend wrapperStyle={{ fontSize:11, color:"#64748b", paddingTop:6 }} />
                        {dayKeys.map((d,i) => (
                          <Bar key={d} dataKey={d} name={d} fill={["#6366f1","#10b981","#f59e0b"][i%3]}
                            radius={[4,4,0,0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}

            {/* IN/OUT flow balance per node */}
            {timeseries.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10, marginBottom:14 }}>
                {timeseries.filter(n => !["default","test_cam_node"].includes(n.camera_id)).map((nodeTs, idx) => {
                  const totalIn  = nodeTs.timeseries.reduce((s,p) => s+(p.IN||0), 0);
                  const totalOut = nodeTs.timeseries.reduce((s,p) => s+(p.OUT||0), 0);
                  const total    = totalIn + totalOut;
                  const inPct    = total > 0 ? Math.round((totalIn/total)*100) : 50;
                  const label    = NODE_CENTROIDS[nodeTs.camera_id]?.label || nodeTs.camera_id;
                  const color    = ["#6366f1","#10b981","#f59e0b","#ec4899","#06b6d4","#a855f7","#f97316","#84cc16","#14b8a6"][idx%9];
                  return (
                    <div key={nodeTs.camera_id} style={{ background:"rgba(15,23,42,0.6)", borderRadius:14,
                      border:`1px solid ${color}20`, padding:"12px 14px" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:"#f8fafc", marginBottom:4 }}>{total.toLocaleString()}</div>
                      <div style={{ height:4, borderRadius:4, background:"rgba(30,41,59,0.8)", overflow:"hidden", marginBottom:6 }}>
                        <div style={{ width:`${inPct}%`, height:"100%", background:`linear-gradient(90deg,#10b981,#6366f1)`, borderRadius:4 }} />
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10 }}>
                        <span style={{ color:"#10b981" }}>IN {totalIn.toLocaleString()}</span>
                        <span style={{ color:"#f59e0b" }}>OUT {totalOut.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Synthesis Log Transparency Panel */}
            {synthLog && (
              <div style={{ background:"rgba(15,23,42,0.6)", borderRadius:18, border:"1px solid rgba(30,41,59,0.6)",
                padding:"16px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                  <CheckCircle2 style={{ width:14, height:14, color:"#10b981" }} />
                  <span style={{ fontSize:12, fontWeight:700, color:"#cbd5e1" }}>Synthetic Data Provenance Log</span>
                  <span style={{ marginLeft:"auto", fontSize:10, color:"#475569" }}>
                    Generated: {new Date(synthLog.generated_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid #1e293b" }}>
                        {["Node","Records","Day 1","Day 2","Top Class","IN%","OUT%","Avg Conf","Regions"].map(h => (
                          <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:"#475569",
                            fontWeight:700, fontSize:10, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(synthLog.nodes||{}).map(([nodeId, info]) => {
                        const topClass = Object.entries(info.class_breakdown||{}).sort((a,b)=>b[1]-a[1])[0];
                        const days = Object.entries(info.day_distribution||{}).sort(([a],[b])=>a.localeCompare(b));
                        const inPct = info.direction_split?.IN
                          ? Math.round(info.direction_split.IN / (info.direction_split.IN + info.direction_split.OUT) * 100)
                          : "—";
                        const regionCount = Object.keys(info.region_breakdown||{}).length;
                        return (
                          <tr key={nodeId} style={{ borderBottom:"1px solid rgba(30,41,59,0.4)" }}>
                            <td style={{ padding:"7px 10px", color:"#818cf8", fontWeight:700, whiteSpace:"nowrap" }}>
                              {NODE_CENTROIDS[nodeId]?.label || nodeId}
                            </td>
                            <td style={{ padding:"7px 10px", color:"#f1f5f9", fontWeight:700 }}>{info.records_generated?.toLocaleString()}</td>
                            <td style={{ padding:"7px 10px", color:"#94a3b8" }}>{days[0]?.[1]?.toLocaleString()}</td>
                            <td style={{ padding:"7px 10px", color:"#94a3b8" }}>{days[1]?.[1]?.toLocaleString()}</td>
                            <td style={{ padding:"7px 10px" }}>
                              <span style={{ color: CLASS_CONFIG[topClass?.[0]]?.color || "#94a3b8", fontWeight:700 }}>
                                {topClass?.[0]} ({topClass?.[1]})
                              </span>
                            </td>
                            <td style={{ padding:"7px 10px", color:"#10b981" }}>{inPct}%</td>
                            <td style={{ padding:"7px 10px", color:"#f59e0b" }}>{100-inPct}%</td>
                            <td style={{ padding:"7px 10px", color:"#94a3b8" }}>{info.avg_confidence}</td>
                            <td style={{ padding:"7px 10px", color:"#64748b" }}>{regionCount} zones</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BOTTOM SPACER ── */}
        <div style={{ height:20 }} />
      </div>

      {/* spin keyframe via style tag */}
      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
