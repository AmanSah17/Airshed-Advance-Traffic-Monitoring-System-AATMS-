import json
from sqlalchemy import create_engine, text
from datetime import datetime

engine = create_engine("postgresql://postgres:Amansah%401717@localhost:5432/aatms_db")

with engine.connect() as conn:
    # 1. Schema of crossing_events
    print("="*80)
    print("TABLE: crossing_events - COLUMN SCHEMA")
    print("="*80)
    cols = conn.execute(text("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'crossing_events'
        ORDER BY ordinal_position
    """)).fetchall()
    for c in cols:
        print(f"  {c[0]:<25} {c[1]:<25} nullable={c[2]}  default={c[3]}")

    # 2. Sample rows
    print("\n" + "="*80)
    print("SAMPLE DATA (first 10 rows)")
    print("="*80)
    rows = conn.execute(text("SELECT * FROM crossing_events LIMIT 10")).fetchall()
    keys = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='crossing_events' ORDER BY ordinal_position")).fetchall()
    col_names = [k[0] for k in keys]
    print("Columns:", col_names)
    for r in rows:
        print(dict(zip(col_names, r)))

    # 3. Aggregated stats
    print("\n" + "="*80)
    print("REAL DATA DISTRIBUTION")
    print("="*80)
    total = conn.execute(text("SELECT COUNT(*) FROM crossing_events")).scalar()
    print(f"  Total records: {total}")
    
    cam_dist = conn.execute(text("SELECT camera_id, COUNT(*) as cnt FROM crossing_events GROUP BY camera_id ORDER BY cnt DESC")).fetchall()
    print("\n  Per camera_id distribution:")
    for r in cam_dist:
        print(f"    {r[0]:<25} {r[1]}")
    
    class_dist = conn.execute(text("SELECT class_name, COUNT(*) as cnt FROM crossing_events GROUP BY class_name ORDER BY cnt DESC")).fetchall()
    print("\n  Per class_name distribution:")
    for r in class_dist:
        print(f"    {r[0]:<20} {r[1]}")
    
    dir_dist = conn.execute(text("SELECT direction, COUNT(*) as cnt FROM crossing_events GROUP BY direction ORDER BY cnt DESC")).fetchall()
    print("\n  Direction distribution:")
    for r in dir_dist:
        print(f"    {r[0]:<15} {r[1]}")

    region_dist = conn.execute(text("SELECT region_label, COUNT(*) as cnt FROM crossing_events GROUP BY region_label ORDER BY cnt DESC LIMIT 20")).fetchall()
    print("\n  Top region_labels:")
    for r in region_dist:
        print(f"    {str(r[0]):<30} {r[1]}")

    # Time range
    trange = conn.execute(text("SELECT MIN(timestamp), MAX(timestamp), MIN(confidence), MAX(confidence), AVG(confidence) FROM crossing_events")).fetchone()
    print(f"\n  Timestamp range: {trange[0]} --> {trange[1]}")
    print(f"  Confidence range: {trange[2]:.3f} to {trange[3]:.3f}, avg={trange[4]:.3f}")

    # track_id range
    tid = conn.execute(text("SELECT MIN(track_id), MAX(track_id), MIN(vehicle_id), MAX(vehicle_id) FROM crossing_events")).fetchone()
    print(f"  track_id range: {tid[0]} to {tid[1]}")
    print(f"  vehicle_id range: {tid[2]} to {tid[3]}")

    # speed, time_in_zone
    extra = conn.execute(text("""
        SELECT column_name FROM information_schema.columns 
        WHERE table_name='crossing_events' 
        AND column_name IN ('speed', 'time_in_zone', 'entry_time', 'exit_time', 'dwell_time', 'zone_entry_time')
    """)).fetchall()
    print(f"\n  Extra timing columns present: {[e[0] for e in extra]}")

    # Check regions table
    print("\n" + "="*80)
    print("TABLE: regions - SCHEMA + SAMPLE")
    print("="*80)
    rcols = conn.execute(text("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name='regions' ORDER BY ordinal_position
    """)).fetchall()
    for c in rcols:
        print(f"  {c[0]:<25} {c[1]}")
    rrows = conn.execute(text("SELECT * FROM regions LIMIT 5")).fetchall()
    print(f"  Sample regions rows ({len(rrows)} shown):")
    for r in rrows:
        print(f"    {r}")
