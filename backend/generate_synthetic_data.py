"""
AATMS Synthetic Data Generator
================================
Generates 10,000-12,000 crossing_events records across all 9 GeoJSON nodes
for a 2-day window, mirroring real data distributions exactly.

Real data profile (extracted from live DB):
  - class_name distribution: car(61%), truck(8%), heavy-duty-truck(8%),
    motor-bike(5%), auto(4%), person(4%), bus(4%), small-truck(3%), others(3%)
  - direction: IN(54%) / OUT(46%)
  - confidence: 0.20-0.94, avg 0.43 (skewed toward lower confidence)
  - region_labels: per-node specific zones (lines + polygons)
  - timestamps: realistic Delhi traffic patterns (rush hours, lull at night)
  - track_id: sequential per node session
  - vehicle_id: {class_name}_{track_id} format

Nodes being populated (from GeoJSON):
  node_0, node_1, node_2, node_3, node_4, node_7,
  ref_zone_0, ref_zone_1, ref_zone_7 + default
"""

import random
import json
import math
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("synth")

engine = create_engine("postgresql://postgres:Amansah%401717@localhost:5432/aatms_db")

# ── Real data distributions (from analysis) ────────────────────────────────────
CLASS_DIST = {
    "car":              0.608,
    "truck":            0.083,
    "heavy-duty-truck": 0.082,
    "motor-bike":       0.052,
    "auto":             0.045,
    "person":           0.036,
    "bus":              0.035,
    "small-truck":      0.028,
    "motorcycle":       0.006,
    "e-rickshaw(toto)": 0.005,
    "vikram-auto":      0.004,
    "scooty":           0.002,
    "train":            0.001,
    "bicycle":          0.001,
}

DIRECTION_DIST = {"IN": 0.54, "OUT": 0.46}

# Node-specific region labels (mirrors real region naming: lines + polygons)
NODE_REGION_LABELS = {
    "node_0": ["ITO_up_1", "ITO_down_1", "ITO_crossing_N", "ITO_crossing_S",
               "ITO_polygon_A", "ITO_signal_zone"],
    "node_1": ["KG_entry_line", "KG_exit_line", "KG_polygon_east", "KG_polygon_west",
               "KG_near-1", "KG_far-1"],
    "node_2": ["CC_up_1", "CC_down1", "CC_polygon_inner", "CC_polygon_outer",
               "CC_lane_1", "CC_lane_2"],
    "node_3": ["SPM_region_1_up", "SPM_region_2_down", "SPM_gyr", "SPM_gju",
               "SPM_cgh", "SPM_crossing"],
    "node_4": ["SHY_up_1", "SHY_down_1", "SHY_polygon_A", "SHY_polygon_B",
               "SHY_NH_node", "SHY_zone_east"],
    "node_7": ["DG_up_1", "DG_down1", "DG_polygon_N", "DG_polygon_S",
               "DG_line_1", "DG_line_2"],
    "ref_zone_0": ["RZ0_polygon_A", "RZ0_line_1", "RZ0_near", "RZ0_far"],
    "ref_zone_1": ["RZ1_polygon_A", "RZ1_line_1", "RZ1_up", "RZ1_down"],
    "ref_zone_7": ["RZ7_polygon_A", "RZ7_line_1", "RZ7_zone_1", "RZ7_zone_2"],
    "default":    ["up_1", "down1", "Default Smoke Test Polygon",
                   "NH31_node02_Noida", "region_1_up", "region_2_down"],
}

# Line zones get more events than polygon zones (mirrors real data: up_1=3782, down1=2343)
NODE_REGION_WEIGHTS = {
    "node_0": [0.35, 0.25, 0.15, 0.12, 0.08, 0.05],
    "node_1": [0.30, 0.28, 0.18, 0.14, 0.06, 0.04],
    "node_2": [0.32, 0.26, 0.20, 0.12, 0.06, 0.04],
    "node_3": [0.28, 0.24, 0.18, 0.16, 0.08, 0.06],
    "node_4": [0.33, 0.27, 0.17, 0.13, 0.06, 0.04],
    "node_7": [0.34, 0.26, 0.18, 0.12, 0.06, 0.04],
    "ref_zone_0": [0.35, 0.30, 0.20, 0.15],
    "ref_zone_1": [0.35, 0.30, 0.20, 0.15],
    "ref_zone_7": [0.35, 0.30, 0.20, 0.15],
    "default":    [0.35, 0.22, 0.20, 0.10, 0.08, 0.05],
}

# Node traffic volume weights (node_0 is the largest zone, gets more traffic)
NODE_VOLUME_WEIGHTS = {
    "node_0":    0.22,   # ITO Junction — major
    "node_1":    0.14,   # Kashmere Gate
    "node_2":    0.16,   # Chandni Chowk
    "node_3":    0.12,   # SP Mukherjee
    "node_4":    0.10,   # Shyama Prasad East
    "node_7":    0.11,   # Delhi Gate South
    "ref_zone_0": 0.05,
    "ref_zone_1": 0.05,
    "ref_zone_7": 0.05,
}

# All target nodes
ALL_NODES = list(NODE_VOLUME_WEIGHTS.keys())

# ── Traffic pattern: multiplier by hour (Delhi typical weekday) ────────────────
def traffic_multiplier(hour: int) -> float:
    """Returns a traffic density multiplier for a given hour of day."""
    pattern = {
        0: 0.05, 1: 0.03, 2: 0.02, 3: 0.02, 4: 0.04, 5: 0.08,
        6: 0.25, 7: 0.70, 8: 1.00, 9: 0.95, 10: 0.75, 11: 0.70,
        12: 0.80, 13: 0.75, 14: 0.65, 15: 0.68, 16: 0.80, 17: 1.00,
        18: 0.95, 19: 0.80, 20: 0.60, 21: 0.40, 22: 0.20, 23: 0.10,
    }
    return pattern.get(hour, 0.1)

def sample_class():
    classes = list(CLASS_DIST.keys())
    weights = list(CLASS_DIST.values())
    return random.choices(classes, weights=weights, k=1)[0]

def sample_direction():
    return random.choices(["IN", "OUT"], weights=[0.54, 0.46], k=1)[0]

def sample_confidence(class_name: str) -> float:
    """Heavier vehicles detected with higher confidence generally."""
    base_conf = {
        "car": (0.35, 0.92), "truck": (0.40, 0.93), "heavy-duty-truck": (0.42, 0.94),
        "bus": (0.40, 0.91), "motor-bike": (0.22, 0.80), "auto": (0.20, 0.78),
        "person": (0.20, 0.82), "small-truck": (0.38, 0.90), "motorcycle": (0.22, 0.78),
        "e-rickshaw(toto)": (0.18, 0.75), "vikram-auto": (0.20, 0.76),
        "scooty": (0.18, 0.72), "train": (0.50, 0.94), "bicycle": (0.15, 0.68),
    }
    lo, hi = base_conf.get(class_name, (0.20, 0.85))
    # Right-skewed distribution (more low confidence detections)
    val = lo + (hi - lo) * (random.betavariate(1.8, 3.5))
    return round(max(lo, min(hi, val)), 6)

def sample_region(node_id: str) -> str:
    labels  = NODE_REGION_LABELS.get(node_id, ["zone_1", "zone_2"])
    weights = NODE_REGION_WEIGHTS.get(node_id, None)
    if weights and len(weights) == len(labels):
        return random.choices(labels, weights=weights, k=1)[0]
    return random.choice(labels)

def random_timestamp_in_window(day_offset: int, hour_weights: dict) -> datetime:
    """Pick a random timestamp respecting traffic density by hour."""
    hours   = list(range(24))
    weights = [traffic_multiplier(h) for h in hours]
    hour    = random.choices(hours, weights=weights, k=1)[0]
    minute  = random.randint(0, 59)
    second  = random.randint(0, 59)
    micros  = random.randint(0, 999999)
    base    = datetime(2026, 5, 26) + timedelta(days=day_offset)  # Day 1 = 2026-05-26, Day 2 = 2026-05-27
    return base.replace(hour=hour, minute=minute, second=second, microsecond=micros)

def generate_node_records(node_id: str, n_records: int, track_id_start: int) -> list:
    """Generate n_records synthetic crossing_event rows for a given node."""
    records = []
    track_id = track_id_start

    # Distribute across 2 days based on traffic patterns
    # Day 1: 55% of records, Day 2: 45%
    n_day1 = int(n_records * 0.55)
    n_day2 = n_records - n_day1

    for day_offset, n_day in enumerate([n_day1, n_day2]):
        for _ in range(n_day):
            class_name   = sample_class()
            direction    = sample_direction()
            confidence   = sample_confidence(class_name)
            region_label = sample_region(node_id)
            ts           = random_timestamp_in_window(day_offset, {})
            vehicle_id   = f"{class_name}_{track_id}"

            records.append({
                "camera_id":    node_id,
                "track_id":     track_id,
                "vehicle_id":   vehicle_id,
                "class_name":   class_name,
                "direction":    direction,
                "timestamp":    ts,
                "confidence":   confidence,
                "region_label": region_label,
            })
            track_id += 1

    # Sort by timestamp so DB insertion is chronological
    records.sort(key=lambda x: x["timestamp"])
    return records

# ── Main synthesis ─────────────────────────────────────────────────────────────
def run():
    TARGET_TOTAL = 11000  # total synthetic records

    # Compute per-node counts based on volume weights
    node_counts = {}
    total_weight = sum(NODE_VOLUME_WEIGHTS.values())
    for node_id, weight in NODE_VOLUME_WEIGHTS.items():
        node_counts[node_id] = int(round((weight / total_weight) * TARGET_TOTAL))

    # Fix rounding drift
    diff = TARGET_TOTAL - sum(node_counts.values())
    node_counts["node_0"] += diff

    log.info("="*70)
    log.info("AATMS SYNTHETIC DATA GENERATION PLAN")
    log.info("="*70)
    log.info(f"  Target records : {TARGET_TOTAL:,}")
    log.info(f"  Date window    : 2026-05-26 to 2026-05-27 (2 full days)")
    log.info(f"  Nodes targeted : {len(ALL_NODES)}")
    log.info("")
    log.info("  Per-node record allocation:")
    for nid, cnt in node_counts.items():
        log.info(f"    {nid:<22} → {cnt:>5} records")
    log.info("")

    synthesis_log = {
        "generated_at": datetime.utcnow().isoformat(),
        "target_total": TARGET_TOTAL,
        "date_window": ["2026-05-26", "2026-05-27"],
        "methodology": {
            "class_distribution": "Mirrored from real DB (car 60.8%, truck 8.3%, ...)",
            "direction_split":    "IN 54% / OUT 46% (from real data)",
            "confidence":         "Beta(1.8, 3.5) distribution per class, range 0.20-0.94",
            "timestamps":         "Weighted by Delhi hourly traffic profile (peak 8-9am, 5-6pm)",
            "region_labels":      "Node-specific zone naming matching real AATMS region patterns",
            "vehicle_id":         "{class_name}_{track_id} format",
        },
        "nodes": {}
    }

    all_records  = []
    track_id_ctr = 1000  # start above real data range to avoid collisions

    for node_id in ALL_NODES:
        n = node_counts[node_id]
        log.info(f"  Generating {n:>5} records for {node_id}...")
        records = generate_node_records(node_id, n, track_id_ctr)
        track_id_ctr += n + 50  # gap between nodes

        # Per-node synthesis log
        class_tally = {}
        dir_tally   = {"IN": 0, "OUT": 0}
        region_tally = {}
        day_tally   = {}

        for r in records:
            class_tally[r["class_name"]]    = class_tally.get(r["class_name"], 0) + 1
            dir_tally[r["direction"]]       = dir_tally.get(r["direction"], 0) + 1
            region_tally[r["region_label"]] = region_tally.get(r["region_label"], 0) + 1
            day_key = r["timestamp"].strftime("%Y-%m-%d")
            day_tally[day_key] = day_tally.get(day_key, 0) + 1

        synthesis_log["nodes"][node_id] = {
            "records_generated": n,
            "class_breakdown":   class_tally,
            "direction_split":   dir_tally,
            "region_breakdown":  region_tally,
            "day_distribution":  day_tally,
            "track_id_range":    [records[0]["track_id"], records[-1]["track_id"]],
            "timestamp_range":   [records[0]["timestamp"].isoformat(), records[-1]["timestamp"].isoformat()],
            "avg_confidence":    round(sum(r["confidence"] for r in records) / n, 4),
        }

        all_records.extend(records)

    log.info("")
    log.info(f"  Total records generated: {len(all_records):,}")
    log.info("  Inserting into PostgreSQL crossing_events table...")

    # Batch insert — 500 rows per transaction
    BATCH = 500
    inserted = 0
    with engine.connect() as conn:
        for i in range(0, len(all_records), BATCH):
            batch = all_records[i:i+BATCH]
            conn.execute(text("""
                INSERT INTO crossing_events
                  (camera_id, track_id, vehicle_id, class_name, direction, timestamp, confidence, region_label)
                VALUES
                  (:camera_id, :track_id, :vehicle_id, :class_name, :direction, :timestamp, :confidence, :region_label)
            """), batch)
            conn.commit()
            inserted += len(batch)
            if inserted % 2000 == 0:
                log.info(f"    ... inserted {inserted:,} / {len(all_records):,}")

    log.info(f"  ✓ Inserted {inserted:,} records successfully.")

    # Save synthesis log
    log_path = "synth_data_log.json"
    with open(log_path, "w") as f:
        # Convert datetime objects in log to strings
        json.dump(synthesis_log, f, indent=2, default=str)
    log.info(f"  ✓ Synthesis log saved to: {log_path}")

    # Final DB verification
    log.info("")
    log.info("="*70)
    log.info("POST-INSERTION VERIFICATION")
    log.info("="*70)
    with engine.connect() as conn:
        for node_id in ALL_NODES:
            row = conn.execute(text("""
                SELECT COUNT(*), MIN(timestamp), MAX(timestamp),
                       COUNT(DISTINCT class_name), AVG(confidence)
                FROM crossing_events WHERE camera_id=:cid
            """), {"cid": node_id}).fetchone()
            log.info(
                f"  {node_id:<22} | {row[0]:>6} rows | "
                f"{str(row[1])[:16]} → {str(row[2])[:16]} | "
                f"{row[3]} classes | conf_avg={float(row[4]):.3f}"
            )

        grand_total = conn.execute(text("SELECT COUNT(*) FROM crossing_events")).scalar()
        log.info("")
        log.info(f"  Grand total crossing_events: {grand_total:,}")

    return synthesis_log

if __name__ == "__main__":
    random.seed(42)  # reproducible
    result = run()
    print("\n✅ Synthesis complete. Check synth_data_log.json for full report.")
