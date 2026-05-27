"""
AATMS Scaled Synthetic Data Generator v2
==========================================
Wipes and regenerates all node-based synthetic data with:
  - 10,000-15,000 records per node (5x-8x scale-up)
  - Balanced class distribution: other vehicles = 0.30-0.40x the car count
  - New class weights: car ~33%, heavy vehicles ~12% each, bikes ~12%, auto ~11%
  - Covers 2 full days (2026-05-26 to 2026-05-27)
  - Maintains realistic Delhi hourly traffic patterns
  - Logs full provenance per node
"""
import random
import json
import math
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("synth_v2")

engine = create_engine("postgresql://postgres:Amansah%401717@localhost:5432/aatms_db")

# ─────────────────────────────────────────────────────────────────────────────
# NEW BALANCED CLASS DISTRIBUTION
# Target: cars at ~33%, each main non-car class at 0.30-0.40x of car count
# Rationale: if cars=4000 (33%), then motor-bike=1400(35%), heavy-duty=1400(35%)
#            auto=1400(35%), truck=1200(30%), scooty=700(17.5%)...
# ─────────────────────────────────────────────────────────────────────────────
CLASS_DIST = {
    "car":              0.333,   # ~33% — still dominant but reduced from 61%
    "heavy-duty-truck": 0.115,   # 11.5% → ~0.35x of cars
    "motor-bike":       0.115,   # 11.5% → ~0.35x of cars
    "auto":             0.110,   # 11.0% → ~0.33x of cars
    "truck":            0.100,   # 10.0% → ~0.30x of cars
    "scooty":           0.065,   # 6.5%  → ~0.20x of cars  (was 0.2%)
    "motorcycle":       0.055,   # 5.5%  → ~0.17x of cars  (was 0.6%)
    "bus":              0.040,   # 4.0%
    "small-truck":      0.032,   # 3.2%
    "e-rickshaw(toto)": 0.015,   # 1.5%
    "person":           0.012,   # 1.2%
    "vikram-auto":      0.006,   # 0.6%
    "bicycle":          0.002,   # 0.2%
}

DIRECTION_DIST = {"IN": 0.54, "OUT": 0.46}

# ─────────────────────────────────────────────────────────────────────────────
# Node-specific region labels (from real AATMS zone naming)
# ─────────────────────────────────────────────────────────────────────────────
NODE_REGION_LABELS = {
    "node_0": ["ITO_up_1", "ITO_down_1", "ITO_crossing_N", "ITO_crossing_S",
               "ITO_polygon_A", "ITO_signal_zone", "ITO_median_cross", "ITO_flyover"],
    "node_1": ["KG_entry_line", "KG_exit_line", "KG_polygon_east", "KG_polygon_west",
               "KG_near-1", "KG_far-1", "KG_pedestrian_zone", "KG_bus_bay"],
    "node_2": ["CC_up_1", "CC_down1", "CC_polygon_inner", "CC_polygon_outer",
               "CC_lane_1", "CC_lane_2", "CC_market_zone", "CC_metro_exit"],
    "node_3": ["SPM_region_1_up", "SPM_region_2_down", "SPM_gyr", "SPM_gju",
               "SPM_cgh", "SPM_crossing", "SPM_left_turn", "SPM_right_turn"],
    "node_4": ["SHY_up_1", "SHY_down_1", "SHY_polygon_A", "SHY_polygon_B",
               "SHY_NH_node", "SHY_zone_east", "SHY_service_rd", "SHY_divider"],
    "node_7": ["DG_up_1", "DG_down1", "DG_polygon_N", "DG_polygon_S",
               "DG_line_1", "DG_line_2", "DG_gate_entry", "DG_gate_exit"],
    "ref_zone_0": ["RZ0_polygon_A", "RZ0_line_1", "RZ0_near", "RZ0_far",
                   "RZ0_zone_B", "RZ0_zone_C"],
    "ref_zone_1": ["RZ1_polygon_A", "RZ1_line_1", "RZ1_up", "RZ1_down",
                   "RZ1_zone_B", "RZ1_zone_C"],
    "ref_zone_7": ["RZ7_polygon_A", "RZ7_line_1", "RZ7_zone_1", "RZ7_zone_2",
                   "RZ7_zone_3", "RZ7_zone_4"],
}

# Region weight distributions (primary lines get most traffic)
NODE_REGION_WEIGHTS = {
    "node_0":    [0.28, 0.20, 0.14, 0.11, 0.09, 0.07, 0.06, 0.05],
    "node_1":    [0.26, 0.24, 0.15, 0.13, 0.08, 0.06, 0.05, 0.03],
    "node_2":    [0.27, 0.22, 0.17, 0.13, 0.08, 0.07, 0.04, 0.02],
    "node_3":    [0.25, 0.20, 0.15, 0.13, 0.10, 0.07, 0.06, 0.04],
    "node_4":    [0.27, 0.22, 0.16, 0.13, 0.08, 0.07, 0.04, 0.03],
    "node_7":    [0.28, 0.21, 0.16, 0.12, 0.08, 0.07, 0.05, 0.03],
    "ref_zone_0":[0.30, 0.25, 0.18, 0.13, 0.08, 0.06],
    "ref_zone_1":[0.30, 0.25, 0.18, 0.13, 0.08, 0.06],
    "ref_zone_7":[0.30, 0.25, 0.18, 0.13, 0.08, 0.06],
}

# Target record count per node (10K-15K range, varying for realism)
NODE_TARGET_COUNT = {
    "node_0":    14500,   # ITO Junction — highest traffic (major interchange)
    "node_1":    12000,   # Kashmere Gate
    "node_2":    13200,   # Chandni Chowk — very busy
    "node_3":    11000,   # SP Mukherjee Marg
    "node_4":    10500,   # Shyama Prasad East
    "node_7":    11800,   # Delhi Gate South
    "ref_zone_0": 10200,  # Reference Zone A
    "ref_zone_1": 10200,  # Reference Zone B
    "ref_zone_7": 10200,  # Reference Zone C
}

ALL_NODES = list(NODE_TARGET_COUNT.keys())

# ─────────────────────────────────────────────────────────────────────────────
# Delhi hourly traffic multiplier (realistic peak patterns)
# ─────────────────────────────────────────────────────────────────────────────
HOURLY_PATTERN = {
    0: 0.04, 1: 0.02, 2: 0.01, 3: 0.01, 4: 0.03, 5: 0.08,
    6: 0.28, 7: 0.72, 8: 1.00, 9: 0.92, 10: 0.78, 11: 0.72,
    12: 0.82, 13: 0.78, 14: 0.68, 15: 0.70, 16: 0.82, 17: 1.00,
    18: 0.96, 19: 0.82, 20: 0.62, 21: 0.42, 22: 0.22, 23: 0.10,
}

def traffic_multiplier(hour: int) -> float:
    return HOURLY_PATTERN.get(hour, 0.1)

def sample_class() -> str:
    classes = list(CLASS_DIST.keys())
    weights = list(CLASS_DIST.values())
    return random.choices(classes, weights=weights, k=1)[0]

def sample_direction() -> str:
    return random.choices(["IN", "OUT"], weights=[0.54, 0.46], k=1)[0]

def sample_confidence(class_name: str) -> float:
    # Per-class confidence ranges (heavier → higher confidence)
    conf_ranges = {
        "car":              (0.35, 0.92),
        "truck":            (0.40, 0.93),
        "heavy-duty-truck": (0.45, 0.94),
        "bus":              (0.42, 0.93),
        "motor-bike":       (0.22, 0.82),
        "auto":             (0.20, 0.80),
        "scooty":           (0.18, 0.76),
        "motorcycle":       (0.20, 0.80),
        "person":           (0.18, 0.80),
        "small-truck":      (0.38, 0.91),
        "e-rickshaw(toto)": (0.18, 0.76),
        "vikram-auto":      (0.20, 0.78),
        "bicycle":          (0.14, 0.68),
    }
    lo, hi = conf_ranges.get(class_name, (0.20, 0.85))
    val = lo + (hi - lo) * random.betavariate(1.8, 3.5)
    return round(max(lo, min(hi, val)), 6)

def sample_region(node_id: str) -> str:
    labels  = NODE_REGION_LABELS.get(node_id, ["zone_1", "zone_2"])
    weights = NODE_REGION_WEIGHTS.get(node_id, None)
    if weights and len(weights) == len(labels):
        return random.choices(labels, weights=weights, k=1)[0]
    return random.choice(labels)

def random_timestamp(day_offset: int) -> datetime:
    hours   = list(range(24))
    weights = [traffic_multiplier(h) for h in hours]
    hour    = random.choices(hours, weights=weights, k=1)[0]
    minute  = random.randint(0, 59)
    second  = random.randint(0, 59)
    micros  = random.randint(0, 999999)
    base    = datetime(2026, 5, 26) + timedelta(days=day_offset)
    return base.replace(hour=hour, minute=minute, second=second, microsecond=micros)

def generate_node_records(node_id: str, n_total: int, track_id_start: int) -> list:
    records = []
    track_id = track_id_start
    # Split across 2 days: day1 gets slightly more (rush on weekday)
    n_day1 = int(n_total * 0.53)
    n_day2 = n_total - n_day1

    for day_offset, n_day in enumerate([n_day1, n_day2]):
        for _ in range(n_day):
            cls     = sample_class()
            dirn    = sample_direction()
            conf    = sample_confidence(cls)
            region  = sample_region(node_id)
            ts      = random_timestamp(day_offset)
            vid     = f"{cls}_{track_id}"

            records.append({
                "camera_id":    node_id,
                "track_id":     track_id,
                "vehicle_id":   vid,
                "class_name":   cls,
                "direction":    dirn,
                "timestamp":    ts,
                "confidence":   conf,
                "region_label": region,
            })
            track_id += 1

    records.sort(key=lambda x: x["timestamp"])
    return records

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Delete old synthetic data for these nodes
# ─────────────────────────────────────────────────────────────────────────────
def wipe_existing_synthetic():
    node_list = tuple(ALL_NODES)
    with engine.connect() as conn:
        result = conn.execute(text(
            "DELETE FROM crossing_events WHERE camera_id = ANY(:nodes)"
        ), {"nodes": list(ALL_NODES)})
        conn.commit()
        log.info(f"  Deleted {result.rowcount:,} existing synthetic records.")

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
def run():
    grand_target = sum(NODE_TARGET_COUNT.values())
    log.info("="*72)
    log.info("AATMS SYNTHETIC DATA v2 — SCALED + BALANCED CLASS DISTRIBUTION")
    log.info("="*72)
    log.info(f"  Grand total target   : {grand_target:,} records")
    log.info(f"  Date window          : 2026-05-26 → 2026-05-27 (2 full days)")
    log.info(f"  Per-node target      : 10,200 – 14,500")
    log.info(f"  Class balance fix    : car ~33%, others 0.30-0.40x car count")
    log.info("")
    log.info("  Per-node allocation:")
    for nid, cnt in NODE_TARGET_COUNT.items():
        n_car  = int(cnt * CLASS_DIST["car"])
        n_bike = int(cnt * CLASS_DIST["motor-bike"])
        n_hdv  = int(cnt * CLASS_DIST["heavy-duty-truck"])
        log.info(f"    {nid:<22} → {cnt:>6} records | cars≈{n_car} | motor-bike≈{n_bike} | heavy-duty≈{n_hdv}")

    log.info("")
    log.info("  New class distribution:")
    for cls, pct in CLASS_DIST.items():
        ratio = pct / CLASS_DIST["car"]
        log.info(f"    {cls:<22} {pct*100:>5.1f}%  ({ratio:.2f}x cars)")

    # Wipe
    log.info("")
    log.info("  Wiping existing synthetic records...")
    wipe_existing_synthetic()

    synthesis_log = {
        "version": "v2",
        "generated_at": datetime.now().isoformat(),
        "grand_total_target": grand_target,
        "date_window": ["2026-05-26", "2026-05-27"],
        "class_distribution": CLASS_DIST,
        "methodology": {
            "scale": "5x-8x vs v1 (10,200-14,500 records per node)",
            "class_balance": "car:33%, non-car classes at 0.30-0.40x of car count",
            "direction_split": "IN 54% / OUT 46%",
            "confidence": "Beta(1.8,3.5) per class, range 0.14-0.94",
            "timestamps": "Delhi hourly profile (dual peak: 8-9am, 5-6pm)",
            "region_labels": "8 zones per node (lines + polygons)",
        },
        "nodes": {}
    }

    all_records  = []
    track_id_ctr = 20000  # well above real data (max track_id=819) and v1 (max ~12300)

    for node_id in ALL_NODES:
        n = NODE_TARGET_COUNT[node_id]
        log.info(f"  Generating {n:>6,} records for {node_id}...")
        records = generate_node_records(node_id, n, track_id_ctr)
        track_id_ctr += n + 200

        # Tally for log
        class_tally   = {}
        dir_tally     = {"IN": 0, "OUT": 0}
        region_tally  = {}
        day_tally     = {}

        for r in records:
            class_tally[r["class_name"]]    = class_tally.get(r["class_name"], 0) + 1
            dir_tally[r["direction"]]       += 1
            region_tally[r["region_label"]] = region_tally.get(r["region_label"], 0) + 1
            dk = r["timestamp"].strftime("%Y-%m-%d")
            day_tally[dk] = day_tally.get(dk, 0) + 1

        # Class balance check
        n_car   = class_tally.get("car", 0)
        balance_summary = {
            cls: {"count": cnt, "ratio_to_car": round(cnt/n_car, 3) if n_car else 0}
            for cls, cnt in class_tally.items()
        }

        synthesis_log["nodes"][node_id] = {
            "records_generated": n,
            "class_balance": balance_summary,
            "direction_split": dir_tally,
            "region_breakdown": region_tally,
            "day_distribution": day_tally,
            "track_id_range": [records[0]["track_id"], records[-1]["track_id"]],
            "timestamp_range": [records[0]["timestamp"].isoformat(), records[-1]["timestamp"].isoformat()],
            "avg_confidence": round(sum(r["confidence"] for r in records) / n, 4),
        }

        all_records.extend(records)

    log.info("")
    log.info(f"  Total records in memory: {len(all_records):,}")
    log.info("  Batch-inserting into PostgreSQL (batch=1000)...")

    BATCH = 1000
    inserted = 0
    with engine.connect() as conn:
        for i in range(0, len(all_records), BATCH):
            batch = all_records[i:i+BATCH]
            conn.execute(text("""
                INSERT INTO crossing_events
                  (camera_id, track_id, vehicle_id, class_name, direction,
                   timestamp, confidence, region_label)
                VALUES
                  (:camera_id, :track_id, :vehicle_id, :class_name, :direction,
                   :timestamp, :confidence, :region_label)
            """), batch)
            conn.commit()
            inserted += len(batch)
            if inserted % 10000 == 0:
                log.info(f"    ... inserted {inserted:,} / {len(all_records):,}")

    log.info(f"  Inserted {inserted:,} records total.")

    # Save log
    with open("synth_data_log.json", "w") as f:
        json.dump(synthesis_log, f, indent=2, default=str)
    log.info("  Synthesis log saved to synth_data_log.json")

    # Verify
    log.info("")
    log.info("="*72)
    log.info("POST-INSERTION VERIFICATION")
    log.info("="*72)
    with engine.connect() as conn:
        for nid in ALL_NODES:
            row = conn.execute(text("""
                SELECT COUNT(*),
                       SUM(CASE WHEN class_name='car' THEN 1 ELSE 0 END),
                       SUM(CASE WHEN class_name='motor-bike' THEN 1 ELSE 0 END),
                       SUM(CASE WHEN class_name='heavy-duty-truck' THEN 1 ELSE 0 END),
                       SUM(CASE WHEN class_name='scooty' THEN 1 ELSE 0 END),
                       SUM(CASE WHEN class_name='auto' THEN 1 ELSE 0 END),
                       AVG(confidence)
                FROM crossing_events WHERE camera_id=:cid
            """), {"cid": nid}).fetchone()
            total, cars, bikes, hdv, scooty, auto_r, avg_c = row
            ratio_bike = f"{bikes/cars:.2f}x" if cars else "N/A"
            ratio_hdv  = f"{hdv/cars:.2f}x"  if cars else "N/A"
            ratio_sco  = f"{scooty/cars:.2f}x" if cars else "N/A"
            log.info(
                f"  {nid:<22} | {total:>6} rows | cars={cars:>5} | "
                f"moto={bikes:>5}({ratio_bike}) | hdv={hdv:>5}({ratio_hdv}) | "
                f"sco={scooty:>5}({ratio_sco}) | conf={float(avg_c):.3f}"
            )

        grand = conn.execute(text("SELECT COUNT(*) FROM crossing_events")).scalar()
        synth = conn.execute(text(
            "SELECT COUNT(*) FROM crossing_events WHERE camera_id = ANY(:nds)"
        ), {"nds": ALL_NODES}).scalar()
        log.info("")
        log.info(f"  Synthetic records (nodes only) : {synth:,}")
        log.info(f"  Grand total all crossing_events: {grand:,}")

    log.info("="*72)
    log.info("DONE")
    return synthesis_log

if __name__ == "__main__":
    random.seed(2026)
    run()
