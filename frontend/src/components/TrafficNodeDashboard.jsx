import React, { useMemo } from "react";
import {
  TrendingUp, TrendingDown, Activity, Clock,
  ArrowRight, BarChart3, Layers, AlertCircle
} from "lucide-react";

// Distinct colours for regions
const REGION_COLORS = [
  { bg: "rgba(99,102,241,0.12)",  border: "rgba(99,102,241,0.3)",  accent: "#818cf8",  dot: "#6366f1" },
  { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", accent: "#fbbf24", dot: "#f59e0b" },
  { bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.3)", accent: "#f472b6", dot: "#ec4899" },
  { bg: "rgba(6,182,212,0.12)",  border: "rgba(6,182,212,0.3)",  accent: "#22d3ee", dot: "#06b6d4" },
  { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)", accent: "#34d399", dot: "#10b981" },
];

// Vehicle class → compact icon/label
const CLASS_META = {
  "car":              { label: "Car",       emoji: "🚗", color: "#60a5fa" },
  "heavy-duty-truck": { label: "H-Truck",   emoji: "🚛", color: "#f97316" },
  "truck":            { label: "Truck",     emoji: "🚚", color: "#fb923c" },
  "motorcycle":       { label: "Moto",      emoji: "🏍️", color: "#a78bfa" },
  "bus":              { label: "Bus",       emoji: "🚌", color: "#34d399" },
  "auto-rickshaw":    { label: "Auto",      emoji: "🛺", color: "#fbbf24" },
  "bicycle":          { label: "Bicycle",   emoji: "🚲", color: "#94a3b8" },
  "pedestrian":       { label: "Person",    emoji: "🚶", color: "#64748b" },
};
const getClassMeta = (cls) => CLASS_META[cls] || { label: cls, emoji: "🚗", color: "#94a3b8" };

/**
 * TrafficNodeDashboard
 *
 * Props:
 *   regionMatrix  – { [regionLabel]: { [className]: { IN: n, OUT: n } } }
 *   eventLogs     – array of { vehicle_id, class_name, direction, region_label, timestamp }
 *   occupancy     – { [regionLabel]: n }   (polygon zones only; optional)
 *   regionColors  – optional array mapping region index → color token
 *   running       – bool
 */
export default function TrafficNodeDashboard({ regionMatrix = {}, eventLogs = [], occupancy = {}, running = false }) {

  // ── Derived data ──────────────────────────────────────────────────────────
  const regions = useMemo(() => Object.keys(regionMatrix), [regionMatrix]);
  const allClasses = useMemo(() => {
    const s = new Set();
    Object.values(regionMatrix).forEach(cls => Object.keys(cls).forEach(c => s.add(c)));
    return [...s].sort();
  }, [regionMatrix]);

  // Per-region totals
  const regionTotals = useMemo(() => {
    const t = {};
    regions.forEach(r => {
      let totalIn = 0, totalOut = 0;
      Object.values(regionMatrix[r] || {}).forEach(({ IN = 0, OUT = 0 }) => {
        totalIn += IN; totalOut += OUT;
      });
      t[r] = { IN: totalIn, OUT: totalOut, total: totalIn + totalOut };
    });
    return t;
  }, [regionMatrix, regions]);

  // Last 30 events bucketed into 15-second windows for sparkline
  const sparklineBuckets = useMemo(() => {
    if (eventLogs.length === 0) return {};
    const buckets = {}; // { regionLabel: [count per 15s window, last 10 windows] }
    regions.forEach(r => { buckets[r] = Array(10).fill(0); });
    const now = Date.now();
    eventLogs.slice(0, 200).forEach(ev => {
      const age = (now - new Date(ev.timestamp).getTime()) / 1000; // seconds ago
      const bucketIdx = Math.floor(age / 15);
      if (bucketIdx < 10 && buckets[ev.region_label]) {
        buckets[ev.region_label][bucketIdx]++;
      }
    });
    // Reverse so oldest first
    regions.forEach(r => { buckets[r] = buckets[r].reverse(); });
    return buckets;
  }, [eventLogs, regions]);

  // Recent unique vehicles per region (last 20 events)
  const recentVehicles = useMemo(() => {
    const rv = {};
    regions.forEach(r => { rv[r] = []; });
    const seen = new Set();
    [...eventLogs].slice(0, 50).forEach(ev => {
      const key = `${ev.region_label}|${ev.vehicle_id}`;
      if (!seen.has(key) && rv[ev.region_label]) {
        seen.add(key);
        rv[ev.region_label].push({ id: ev.vehicle_id, cls: ev.class_name, dir: ev.direction, ts: ev.timestamp });
      }
    });
    regions.forEach(r => { rv[r] = rv[r].slice(0, 6); });
    return rv;
  }, [eventLogs, regions]);

  // Event rate (events per minute) per region, based on last 60s
  const eventRates = useMemo(() => {
    const rates = {};
    const now = Date.now();
    regions.forEach(r => {
      const recent = eventLogs.filter(ev =>
        ev.region_label === r && (now - new Date(ev.timestamp).getTime()) < 60000
      );
      rates[r] = recent.length; // events in last 60s
    });
    return rates;
  }, [eventLogs, regions]);

  if (regions.length === 0) {
    return (
      <div className="tnd-empty">
        <BarChart3 className="w-8 h-8 text-slate-700 mb-2" />
        <p className="text-slate-600 text-sm font-semibold">Traffic Node Dashboard</p>
        <p className="text-slate-700 text-xs mt-1">
          {running ? "Waiting for first crossing events…" : "Start the analysis to see traffic intelligence"}
        </p>
      </div>
    );
  }

  return (
    <div className="tnd-root">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="tnd-header">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-bold text-slate-200">Traffic Node Intelligence Dashboard</span>
          {running && <span className="tnd-live-dot">● LIVE</span>}
        </div>
        <span className="text-[10px] text-slate-600">{eventLogs.length} total events · {regions.length} region{regions.length !== 1 ? "s" : ""} · {allClasses.length} class{allClasses.length !== 1 ? "es" : ""}</span>
      </div>

      {/* ── Region cards row ─────────────────────────────────────────── */}
      <div className="tnd-regions-row">
        {regions.map((region, rIdx) => {
          const rColor = REGION_COLORS[rIdx % REGION_COLORS.length];
          const totals = regionTotals[region] || { IN: 0, OUT: 0, total: 0 };
          const rate = eventRates[region] || 0;
          const spark = sparklineBuckets[region] || Array(10).fill(0);
          const sparkMax = Math.max(...spark, 1);
          const occ = occupancy[region] ?? null;
          const classCounts = regionMatrix[region] || {};

          return (
            <div key={region} className="tnd-region-card" style={{ borderColor: rColor.border, background: rColor.bg }}>
              {/* Region title */}
              <div className="tnd-rc-header">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="tnd-region-dot" style={{ background: rColor.dot }} />
                  <span className="tnd-region-name" title={region}>{region}</span>
                  {occ !== null && (
                    <span className="tnd-occ-badge" style={{ color: rColor.accent, borderColor: rColor.border }}>
                      {occ} inside
                    </span>
                  )}
                </div>
                <span className="tnd-rate" style={{ color: rColor.accent }}>
                  {rate}/min
                </span>
              </div>

              {/* Big IN/OUT numbers */}
              <div className="tnd-inout-row">
                <div className="tnd-inout-box tnd-in">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="tnd-inout-n">{totals.IN}</span>
                  <span className="tnd-inout-lbl">IN</span>
                </div>
                <div className="tnd-flow-arrow">
                  <ArrowRight className="w-3 h-3 text-slate-700" />
                </div>
                <div className="tnd-inout-box tnd-out">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span className="tnd-inout-n">{totals.OUT}</span>
                  <span className="tnd-inout-lbl">OUT</span>
                </div>
              </div>

              {/* Sparkline (activity in last 150s) */}
              <div className="tnd-spark-section">
                <span className="tnd-spark-label">Activity (last 2.5 min)</span>
                <div className="tnd-sparkline">
                  {spark.map((v, i) => (
                    <div key={i} className="tnd-spark-bar"
                      style={{ height: `${Math.max(4, (v / sparkMax) * 32)}px`, background: rColor.dot, opacity: 0.4 + (i / spark.length) * 0.6 }}
                      title={`${v} events`} />
                  ))}
                </div>
              </div>

              {/* Per-class breakdown */}
              <div className="tnd-class-section">
                <span className="tnd-spark-label">By Vehicle Class</span>
                <div className="tnd-class-rows">
                  {Object.entries(classCounts).length === 0 && (
                    <span className="text-slate-700 text-[10px]">No data yet</span>
                  )}
                  {Object.entries(classCounts).map(([cls, counts]) => {
                    const meta = getClassMeta(cls);
                    const total = (counts.IN || 0) + (counts.OUT || 0);
                    const pct = Math.round(((counts.IN || 0) / Math.max(total, 1)) * 100);
                    return (
                      <div key={cls} className="tnd-class-row">
                        <span className="tnd-class-emoji">{meta.emoji}</span>
                        <span className="tnd-class-name" title={cls}>{meta.label}</span>
                        <div className="tnd-class-bar-wrapper">
                          <div className="tnd-class-bar-fill"
                            style={{ width: `${pct}%`, background: meta.color }} />
                        </div>
                        <span className="tnd-class-inout" style={{ color: "#34d399" }}>↑{counts.IN || 0}</span>
                        <span className="tnd-class-inout" style={{ color: "#f87171" }}>↓{counts.OUT || 0}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent vehicle IDs */}
              <div className="tnd-recent-section">
                <span className="tnd-spark-label">Recent Vehicles</span>
                <div className="tnd-recent-list">
                  {(recentVehicles[region] || []).length === 0 && (
                    <span className="text-slate-700 text-[10px]">None yet</span>
                  )}
                  {(recentVehicles[region] || []).map((v, i) => {
                    const meta = getClassMeta(v.cls);
                    return (
                      <div key={`${v.id}-${i}`} className="tnd-recent-item">
                        <span className="tnd-recent-emoji">{meta.emoji}</span>
                        <span className="tnd-recent-id" title={v.id}>{v.id}</span>
                        <span className={`tnd-recent-dir ${v.dir === "IN" ? "tnd-dir-in" : "tnd-dir-out"}`}>
                          {v.dir}
                        </span>
                        <span className="tnd-recent-ts">
                          {new Date(v.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Cross-region matrix (only if multiple regions) ─────────────── */}
      {regions.length > 1 && allClasses.length > 0 && (
        <div className="tnd-matrix-section">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span className="tnd-spark-label" style={{ color: "#94a3b8", fontSize: 10 }}>REGION × CLASS CROSSING MATRIX</span>
          </div>
          <div className="tnd-matrix-scroll">
            <table className="tnd-matrix">
              <thead>
                <tr>
                  <th className="tnd-th tnd-th-class">Class</th>
                  {regions.map((r, ri) => (
                    <React.Fragment key={r}>
                      <th className="tnd-th" style={{ color: REGION_COLORS[ri % REGION_COLORS.length].accent }}>
                        {r}<br /><span style={{ fontWeight: 400, color: "#64748b", fontSize: 8 }}>IN</span>
                      </th>
                      <th className="tnd-th" style={{ color: REGION_COLORS[ri % REGION_COLORS.length].accent }}>
                        &nbsp;<br /><span style={{ fontWeight: 400, color: "#64748b", fontSize: 8 }}>OUT</span>
                      </th>
                    </React.Fragment>
                  ))}
                  <th className="tnd-th" style={{ color: "#94a3b8" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {allClasses.map(cls => {
                  const meta = getClassMeta(cls);
                  let grandTotal = 0;
                  return (
                    <tr key={cls} className="tnd-tr">
                      <td className="tnd-td tnd-td-class">
                        <span className="tnd-class-emoji">{meta.emoji}</span>
                        <span style={{ color: meta.color }}>{meta.label}</span>
                      </td>
                      {regions.map((r, ri) => {
                        const counts = (regionMatrix[r] || {})[cls] || { IN: 0, OUT: 0 };
                        grandTotal += (counts.IN || 0) + (counts.OUT || 0);
                        const rCol = REGION_COLORS[ri % REGION_COLORS.length];
                        return (
                          <React.Fragment key={r}>
                            <td className="tnd-td tnd-td-in">{counts.IN || 0}</td>
                            <td className="tnd-td tnd-td-out">{counts.OUT || 0}</td>
                          </React.Fragment>
                        );
                      })}
                      <td className="tnd-td tnd-td-total">{grandTotal}</td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="tnd-tr-total">
                  <td className="tnd-td tnd-td-class" style={{ fontWeight: 800, color: "#94a3b8" }}>TOTAL</td>
                  {regions.map((r, ri) => {
                    const t = regionTotals[r] || { IN: 0, OUT: 0 };
                    return (
                      <React.Fragment key={r}>
                        <td className="tnd-td tnd-td-in" style={{ fontWeight: 800 }}>{t.IN}</td>
                        <td className="tnd-td tnd-td-out" style={{ fontWeight: 800 }}>{t.OUT}</td>
                      </React.Fragment>
                    );
                  })}
                  <td className="tnd-td tnd-td-total" style={{ fontWeight: 800 }}>
                    {Object.values(regionTotals).reduce((a, b) => a + b.total, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Live event stream (last 10) ─────────────────────────────────── */}
      <div className="tnd-stream-section">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-3.5 h-3.5 text-emerald-500" />
          <span className="tnd-spark-label" style={{ color: "#94a3b8", fontSize: 10 }}>LIVE EVENT STREAM</span>
          {running && <span className="tnd-pulse-dot" />}
        </div>
        <div className="tnd-stream-grid">
          {eventLogs.slice(0, 12).map((ev, i) => {
            const meta = getClassMeta(ev.class_name);
            const rIdx = regions.indexOf(ev.region_label);
            const rColor = REGION_COLORS[Math.max(0, rIdx) % REGION_COLORS.length];
            return (
              <div key={i} className="tnd-stream-item" style={{ borderLeftColor: rColor.dot, opacity: 1 - i * 0.06 }}>
                <span className="tnd-stream-emoji">{meta.emoji}</span>
                <div className="tnd-stream-body">
                  <span className="tnd-stream-id">{ev.vehicle_id}</span>
                  <span className="tnd-stream-region" style={{ color: rColor.accent }}>{ev.region_label}</span>
                </div>
                <span className={`tnd-stream-dir ${ev.direction === "IN" ? "tnd-dir-in" : "tnd-dir-out"}`}>
                  {ev.direction}
                </span>
                <span className="tnd-stream-ts">
                  {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            );
          })}
          {eventLogs.length === 0 && (
            <div className="tnd-stream-empty">
              <AlertCircle className="w-4 h-4 text-slate-700 mr-2" />
              Waiting for crossing events…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
