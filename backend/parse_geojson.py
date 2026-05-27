import json, math
from sqlalchemy import create_engine, text

engine = create_engine("postgresql://postgres:Amansah%401717@localhost:5432/aatms_db")

with open("nodes.geojson", "r") as f:
    gj = json.load(f)

def centroid(coords):
    # For a polygon ring, compute simple average of vertices
    ring = coords[0]
    lngs = [p[0] for p in ring[:-1]]  # exclude closing point
    lats = [p[1] for p in ring[:-1]]
    return sum(lngs)/len(lngs), sum(lats)/len(lats)

def bbox(coords):
    ring = coords[0]
    lngs = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lngs), min(lats), max(lngs), max(lats)

def approx_radius_m(coords):
    ring = coords[0]
    lngs = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    dlng = (max(lngs) - min(lngs)) * 111320 * math.cos(math.radians(sum(lats)/len(lats)))
    dlat = (max(lats) - min(lats)) * 110540
    return round(math.sqrt(dlng**2 + dlat**2) / 2, 1)

print("\n" + "="*80)
print("AATMS NODE GEOJSON - COMPREHENSIVE ANALYSIS")
print("="*80)
print(f"Total features: {len(gj['features'])}\n")

named_nodes = []
unnamed_nodes = []

for feat in gj["features"]:
    props = feat.get("properties", {})
    geom  = feat["geometry"]
    fid   = feat.get("id", "?")
    name  = props.get("name", None)
    coords = geom["coordinates"]
    cx, cy = centroid(coords)
    minx, miny, maxx, maxy = bbox(coords)
    radius = approx_radius_m(coords)
    ring_pts = len(coords[0]) - 1  # subtract closing point
    
    info = {
        "id": fid, "name": name, "cx": cx, "cy": cy,
        "minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy,
        "radius_m": radius, "vertices": ring_pts
    }
    if name:
        named_nodes.append(info)
    else:
        unnamed_nodes.append(info)
    
    display_name = name or f"unnamed_zone_{fid}"
    print(f"Feature ID: {fid}  |  Name: {display_name}")
    print(f"  Centroid:     Lat={cy:.7f}, Lng={cx:.7f}")
    print(f"  BBox:         Lng [{minx:.6f} ? {maxx:.6f}]")
    print(f"                Lat [{miny:.6f} ? {maxy:.6f}]")
    print(f"  Radius approx: {radius} m  |  Polygon vertices: {ring_pts}")
    print()

print("="*80)
print(f"Named nodes (camera monitoring zones): {len(named_nodes)}")
print(f"Unnamed zones (background/reference):  {len(unnamed_nodes)}")
print()

# Now seed into PostgreSQL
print("Seeding named nodes as camera_sources into PostgreSQL...")

with engine.connect() as conn:
    for n in named_nodes:
        cam_id = n["name"]  # e.g. "node_0"
        display = f"AATMS Delhi - {cam_id.replace('_', ' ').title()}"
        # check if already exists
        res = conn.execute(text("SELECT id FROM camera_sources WHERE id = :id"), {"id": cam_id})
        row = res.fetchone()
        if row:
            conn.execute(text("""
                UPDATE camera_sources SET name=:name, latitude=:lat, longitude=:lng
                WHERE id=:id
            """), {"id": cam_id, "name": display, "lat": n["cy"], "lng": n["cx"]})
            print(f"  UPDATED  {cam_id}: {display}  ({n['cy']:.5f}, {n['cx']:.5f})")
        else:
            conn.execute(text("""
                INSERT INTO camera_sources (id, name, latitude, longitude, video_url, created_at)
                VALUES (:id, :name, :lat, :lng, :url, NOW())
            """), {"id": cam_id, "name": display, "lat": n["cy"], "lng": n["cx"], "url": ""})
            print(f"  INSERTED {cam_id}: {display}  ({n['cy']:.5f}, {n['cx']:.5f})")
    conn.commit()

# Also store unnamed zones with auto-IDs for reference
print("\nSeeding unnamed reference zones...")
with engine.connect() as conn:
    for n in unnamed_nodes:
        cam_id = f"ref_zone_{n['id']}"
        display = f"AATMS Delhi - Reference Zone {n['id']}"
        res = conn.execute(text("SELECT id FROM camera_sources WHERE id = :id"), {"id": cam_id})
        row = res.fetchone()
        if not row:
            conn.execute(text("""
                INSERT INTO camera_sources (id, name, latitude, longitude, video_url, created_at)
                VALUES (:id, :name, :lat, :lng, :url, NOW())
            """), {"id": cam_id, "name": display, "lat": n["cy"], "lng": n["cx"], "url": ""})
            print(f"  INSERTED {cam_id}: {display}  ({n['cy']:.5f}, {n['cx']:.5f})")
        else:
            print(f"  EXISTS   {cam_id}: skipped")
    conn.commit()

# Final verification
print("\n" + "="*80)
print("Final camera_sources table:")
with engine.connect() as conn:
    rows = conn.execute(text("SELECT id, name, latitude, longitude FROM camera_sources ORDER BY id")).fetchall()
    for r in rows:
        print(f"  {r[0]:<22} | {r[1]:<38} | {r[2]:.5f}, {r[3]:.5f}")
print("="*80)
print(f"\nTotal camera nodes in DB: {len(rows)}")
