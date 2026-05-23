import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import axios from "axios";
import { Navigation, Globe, Layers, MapPin, Flame } from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

// Keyless OSM dark vector style
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

// Esri Satellite Raster tile source style
const SATELLITE_STYLE = {
    "version": 8,
    "sources": {
        "satellite": {
            "type": "raster",
            "tiles": [
                "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            ],
            "tileSize": 256,
            "attribution": "Esri, Maxar"
        }
    },
    "layers": [
        {
            "id": "satellite-layer",
            "type": "raster",
            "source": "satellite",
            "minzoom": 0,
            "maxzoom": 19
        }
    ]
};

export default function Map3D({ activeCameraId }) {
    const mapContainer = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    
    const [cameras, setCameras] = useState([]);
    const [mapMode, setMapMode] = useState("dark"); // "dark", "satellite", "heatmap"
    const [selectedCamera, setSelectedCamera] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);

    // Fetch cameras list
    const fetchCameras = () => {
        axios.get(`${API_BASE}/cameras`)
            .then(res => {
                setCameras(res.data);
            })
            .catch(err => console.error("Failed to load cameras coordinates:", err));
    };

    // Fetch analytics for selected camera
    const fetchCameraStats = (camId) => {
        setLoading(true);
        axios.get(`${API_BASE}/analytics/summary`, { params: { camera_id: camId } })
            .then(res => {
                setStats(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch camera reports:", err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchCameras();
    }, [activeCameraId]);

    // Initialize Map
    useEffect(() => {
        if (!mapContainer.current) return;

        // Default map center (New Delhi)
        const center = [77.2090, 28.6139]; 

        // Style selector
        const currentStyle = mapMode === "dark" ? DARK_STYLE : SATELLITE_STYLE;

        const map = new maplibregl.Map({
            container: mapContainer.current,
            style: currentStyle,
            center: center,
            zoom: 14,
            pitch: mapMode === "dark" ? 45 : 0, // 3D tilt for Dark map, flat overlay for heatmap density
            bearing: mapMode === "dark" ? -17 : 0,
            antialias: true
        });

        mapRef.current = map;

        // Add standard navigation controls
        map.addControl(new maplibregl.NavigationControl(), "top-right");

        // Load specific layers
        map.on("load", () => {
            // 1. 3D Building Extrusions (Only available in vector styles like OpenFreeMap Dark)
            if (mapMode === "dark") {
                const layers = map.getStyle().layers;
                let hasBuilding = false;
                for (const l of layers) {
                    if (l['source-layer'] === 'building') {
                        hasBuilding = true;
                        break;
                    }
                }
                
                if (hasBuilding) {
                    map.addLayer({
                        "id": "3d-buildings",
                        "source": "openmaptiles",
                        "source-layer": "building",
                        "type": "fill-extrusion",
                        "minzoom": 14,
                        "paint": {
                            "fill-extrusion-color": "#1e1b4b", // Indigo 3D buildings
                            "fill-extrusion-height": [
                                "interpolate",
                                ["linear"],
                                ["zoom"],
                                14,
                                0,
                                14.05,
                                ["get", "render_height"]
                            ],
                            "fill-extrusion-base": [
                                "interpolate",
                                ["linear"],
                                ["zoom"],
                                14,
                                0,
                                14.05,
                                ["get", "render_min_height"]
                            ],
                            "fill-extrusion-opacity": 0.8
                        }
                    });
                }
            }

            // 2. Traffic Density Heatmap Layer
            if (mapMode === "heatmap") {
                axios.get(`${API_BASE}/analytics/heatmap`)
                    .then(res => {
                        const geoJsonData = res.data;
                        
                        // Add GeoJSON source
                        map.addSource('traffic-heatmap-source', {
                            type: 'geojson',
                            data: geoJsonData
                        });

                        // Add Heatmap layer
                        map.addLayer({
                            id: 'traffic-heatmap-layer',
                            type: 'heatmap',
                            source: 'traffic-heatmap-source',
                            maxzoom: 18,
                            paint: {
                                // Intensity increases as zoom level increases
                                'heatmap-intensity': [
                                    'interpolate',
                                    ['linear'],
                                    ['zoom'],
                                    0, 1,
                                    18, 4
                                ],
                                // Color ramp for heatmap
                                'heatmap-color': [
                                    'interpolate',
                                    ['linear'],
                                    ['heatmap-density'],
                                    0, 'rgba(0, 0, 255, 0)',
                                    0.2, 'royalblue',
                                    0.4, 'cyan',
                                    0.6, 'lime',
                                    0.8, 'yellow',
                                    1, 'red'
                                ],
                                // Radius increases by zoom level
                                'heatmap-radius': [
                                    'interpolate',
                                    ['linear'],
                                    ['zoom'],
                                    0, 3,
                                    18, 30
                                ],
                                'heatmap-opacity': 0.85
                            }
                        });

                        // Add Point Circle layer for individual event dots
                        map.addLayer({
                            id: 'traffic-point-layer',
                            type: 'circle',
                            source: 'traffic-heatmap-source',
                            minzoom: 13,
                            paint: {
                                'circle-radius': [
                                    'interpolate',
                                    ['linear'],
                                    ['zoom'],
                                    13, 3.5,
                                    18, 9
                                ],
                                'circle-color': [
                                    'match',
                                    ['get', 'direction'],
                                    'IN', '#10b981',   // Emerald for IN crossings
                                    'OUT', '#f43f5e',  // Rose for OUT crossings
                                    '#f59e0b'          // Amber fallback
                                ],
                                'circle-stroke-width': 1.5,
                                'circle-stroke-color': '#ffffff',
                                'circle-opacity': 0.95
                            }
                        });

                        // Setup Hover Popup details
                        const popup = new maplibregl.Popup({
                            closeButton: false,
                            closeOnClick: false
                        });

                        map.on('mouseenter', 'traffic-point-layer', (e) => {
                            map.getCanvas().style.cursor = 'pointer';
                            const coordinates = e.features[0].geometry.coordinates.slice();
                            const props = e.features[0].properties;

                            const content = `
                                <div style="font-family: system-ui, sans-serif; padding: 8px; font-size: 11px; background: #0f172a; color: #e2e8f0; border-radius: 8px; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                                    <div style="font-weight: bold; color: #818cf8; font-size: 12px; margin-bottom: 4px; border-bottom: 1px solid #1e293b; padding-bottom: 3px;">
                                        #${props.track_id} ${props.class_name.toUpperCase()}
                                    </div>
                                    <div style="margin-bottom: 2px;"><b>Region:</b> ${props.region_label}</div>
                                    <div style="margin-bottom: 2px;"><b>Flow:</b> <span style="color: ${props.direction === 'IN' ? '#10b981' : '#f43f5e'}; font-weight: bold;">${props.direction}</span></div>
                                    <div style="margin-bottom: 2px;"><b>Confidence:</b> ${(props.confidence * 100).toFixed(1)}%</div>
                                    <div style="color: #64748b; font-size: 9px; margin-top: 5px;">${new Date(props.timestamp).toLocaleTimeString()}</div>
                                </div>
                            `;

                            // Ensure that if the map is zoomed out such that multiple
                            // copies of the feature are visible, the popup appears over the copy being pointed to.
                            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                                coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                            }

                            popup.setLngLat(coordinates).setHTML(content).addTo(map);
                        });

                        map.on('mouseleave', 'traffic-point-layer', () => {
                            map.getCanvas().style.cursor = '';
                            popup.remove();
                        });
                    })
                    .catch(err => console.error("Error loading heatmap points:", err));
            }
        });

        return () => {
            map.remove();
        };
    }, [mapMode]);

    // Render Camera Markers
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // Clear existing markers
        Object.values(markersRef.current).forEach(m => m.remove());
        markersRef.current = {};

        // In heatmap mode, we show density grids, so we can hide or render minimal marker nodes.
        cameras.forEach(cam => {
            const el = document.createElement("div");
            el.className = "custom-map-marker";
            el.style.width = "32px";
            el.style.height = "32px";
            el.style.display = "flex";
            el.style.alignItems = "center";
            el.style.justifyContent = "center";
            el.style.cursor = "pointer";
            
            el.innerHTML = `
                <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                </div>
            `;

            el.addEventListener("click", () => {
                setSelectedCamera(cam);
                fetchCameraStats(cam.id);
                
                map.flyTo({
                    center: [cam.longitude, cam.latitude],
                    zoom: 16,
                    pitch: mapMode === "dark" ? 60 : 0,
                    speed: 0.8
                });
            });

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([cam.longitude, cam.latitude])
                .addTo(map);

            markersRef.current[cam.id] = marker;
        });

        if (cameras.length > 0) {
            const firstCam = cameras[0];
            map.setCenter([firstCam.longitude, firstCam.latitude]);
        }
    }, [cameras, mapMode]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 p-6 bg-slate-900/60 rounded-3xl border border-slate-800 backdrop-blur-xl">
            {/* Map Canvas - Span 3 */}
            <div className="xl:col-span-3 flex flex-col h-[550px] relative rounded-2xl border-2 border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
                {/* Style Toggles */}
                <div className="absolute top-4 left-4 z-10 flex gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 backdrop-blur-md">
                    <button
                        onClick={() => setMapMode("dark")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            mapMode === "dark" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        3D Dark Map
                    </button>
                    <button
                        onClick={() => setMapMode("satellite")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            mapMode === "satellite" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        <Globe className="w-3.5 h-3.5" />
                        Satellite Layer
                    </button>
                    <button
                        onClick={() => setMapMode("heatmap")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            mapMode === "heatmap" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        <Flame className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                        Satellite Heatmap
                    </button>
                </div>

                {/* Map Container Element */}
                <div ref={mapContainer} className="w-full h-full" />
            </div>

            {/* Sidebar Information Card */}
            <div className="flex flex-col bg-slate-950/50 p-6 rounded-2xl border border-slate-800/80 justify-between">
                <div>
                    <h4 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2 border-b border-slate-900 pb-2">
                        <MapPin className="w-5 h-5 text-indigo-400" />
                        Camera Nodes Details
                    </h4>

                    {!selectedCamera ? (
                        <div className="text-slate-500 text-center py-20 text-sm">
                            <p>No camera node selected.</p>
                            <p className="text-xs mt-1">Click a marker pin on the map to view live vehicle statistics.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">Selected Camera</span>
                                <h5 className="text-base font-bold text-white mt-0.5">{selectedCamera.name}</h5>
                                <span className="font-mono text-xs text-indigo-400 block mt-1">
                                    Lat: {selectedCamera.latitude.toFixed(5)}, Lng: {selectedCamera.longitude.toFixed(5)}
                                </span>
                            </div>

                            {loading ? (
                                <div className="flex items-center justify-center py-10">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
                                </div>
                            ) : stats ? (
                                <div className="space-y-4">
                                    <div className="bg-indigo-950/20 border border-indigo-900/40 p-4 rounded-xl text-center">
                                        <span className="block text-xs font-semibold text-indigo-300">Total Count</span>
                                        <span className="text-3xl font-extrabold text-white mt-1 block">{stats.total_vehicles || 0}</span>
                                    </div>

                                    <div className="space-y-2">
                                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Flow Direction</span>
                                        <div className="flex gap-2">
                                            <div className="flex-1 bg-slate-900 border border-slate-850 p-2.5 rounded-xl text-center">
                                                <span className="block text-[10px] text-slate-500 font-bold">IN</span>
                                                <span className="text-base font-bold text-emerald-400">{stats.direction_distribution?.IN || 0}</span>
                                            </div>
                                            <div className="flex-1 bg-slate-900 border border-slate-850 p-2.5 rounded-xl text-center">
                                                <span className="block text-[10px] text-slate-500 font-bold">OUT</span>
                                                <span className="text-base font-bold text-amber-400">{stats.direction_distribution?.OUT || 0}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Category distribution</span>
                                        <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
                                            {Object.entries(stats.class_distribution || {}).map(([cls, cnt]) => (
                                                <div key={cls} className="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded-lg border border-slate-850/40">
                                                    <span className="capitalize text-slate-300">{cls}</span>
                                                    <span className="font-bold text-white">{cnt}</span>
                                                </div>
                                            ))}
                                            {Object.keys(stats.class_distribution || {}).length === 0 && (
                                                <span className="text-slate-600 text-xs block py-2">No category logs.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-slate-600 text-xs py-4">Failed to load statistics.</div>
                            )}
                        </div>
                    )}
                </div>

                <div className="text-slate-500 text-[10px] mt-4 pt-2 border-t border-slate-900 flex items-center justify-between">
                    <span>Total Nodes: {cameras.length}</span>
                    <span>Rendering Mode: {mapMode.toUpperCase()}</span>
                </div>
            </div>
        </div>
    );
}
