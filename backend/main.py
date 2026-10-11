import json
import math
import os
import itertools
from typing import List, Tuple, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

app = FastAPI(title="Puja Hopper Routing Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "pandals.json")

def load_pandals() -> List[Dict[str, Any]]:
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def haversine(c1: Tuple[float, float], c2: Tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [c1[0], c1[1], c2[0], c2[1]])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2.0)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0)**2
    return 6371000.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

def total_path_distance(route: List[Dict[str, Any]]) -> float:
    return sum(haversine(route[i]["coords"], route[i+1]["coords"]) for i in range(len(route) - 1))

class Coordinate(BaseModel):
    lat: float
    lng: float

class OptimizeRequest(BaseModel):
    start: Coordinate
    end: Coordinate
    selected_pandal_ids: List[str]

@app.get("/api/pandals")
def get_pandals():
    return load_pandals()

@app.post("/api/optimize-route")
async def optimize_route(req: OptimizeRequest):
    pandal_map = {p["id"]: p for p in load_pandals()}
    targets = [pandal_map[pid] for pid in req.selected_pandal_ids if pid in pandal_map]

    if not targets:
        raise HTTPException(status_code=400, detail="No valid pandals selected.")

    start_node = {"id": "start", "name": "Start Location", "coords": (req.start.lat, req.start.lng), "estWaitMins": 0}
    end_node = {"id": "end", "name": "Exit / Destination", "coords": (req.end.lat, req.end.lng), "estWaitMins": 0}

    # Solver: Exact permutation for small inputs, 2-Opt heuristic for larger inputs
    if len(targets) <= 7:
        best_dist = float("inf")
        best_pandal_order = targets
        for perm in itertools.permutations(targets):
            candidate = [start_node] + [{"id": p["id"], "name": p["name"], "coords": (p["lat"], p["lng"]), "estWaitMins": p.get("estWaitMins", 0)} for p in perm] + [end_node]
            dist = total_path_distance(candidate)
            if dist < best_dist:
                best_dist = dist
                best_pandal_order = perm
        ordered_stops = [start_node] + [{"id": p["id"], "name": p["name"], "coords": (p["lat"], p["lng"]), "estWaitMins": p.get("estWaitMins", 0)} for p in best_pandal_order] + [end_node]
    else:
        unvisited = targets.copy()
        current_coord = (req.start.lat, req.start.lng)
        greedy_order = []
        while unvisited:
            nearest = min(unvisited, key=lambda p: haversine(current_coord, (p["lat"], p["lng"])))
            greedy_order.append(nearest)
            current_coord = (nearest["lat"], nearest["lng"])
            unvisited.remove(nearest)

        ordered_stops = [start_node] + [{"id": p["id"], "name": p["name"], "coords": (p["lat"], p["lng"]), "estWaitMins": p.get("estWaitMins", 0)} for p in greedy_order] + [end_node]

        improved = True
        while improved:
            improved = False
            for i in range(1, len(ordered_stops) - 2):
                for j in range(i + 1, len(ordered_stops) - 1):
                    p1, p2 = ordered_stops[i - 1]["coords"], ordered_stops[i]["coords"]
                    p3, p4 = ordered_stops[j]["coords"], ordered_stops[j + 1]["coords"]
                    if haversine(p1, p3) + haversine(p2, p4) < haversine(p1, p2) + haversine(p3, p4) - 1e-4:
                        ordered_stops[i:j + 1] = reversed(ordered_stops[i:j + 1])
                        improved = True

    # Call OSRM Foot API
    osrm_coords = ";".join([f"{pt['coords'][1]:.6f},{pt['coords'][0]:.6f}" for pt in ordered_stops])
    osrm_url = f"https://router.project-osrm.org/route/v1/foot/{osrm_coords}?overview=full&geometries=geojson"

    total_wait_mins = sum(s["estWaitMins"] for s in ordered_stops)
    geometry = None
    walk_distance_m = 0.0
    walk_duration_s = 0.0

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(osrm_url, timeout=12.0)
            if resp.status_code == 200:
                data = resp.json()
                route = data["routes"][0]
                geometry = route["geometry"]
                walk_distance_m = route["distance"]
                walk_duration_s = route["duration"]
        except Exception:
            geometry = None

    if not geometry:
        # Fallback to straight lines if OSRM is unreachable
        geometry = {"type": "LineString", "coordinates": [[pt["coords"][1], pt["coords"][0]] for pt in ordered_stops]}
        walk_distance_m = total_path_distance(ordered_stops)
        walk_duration_s = (walk_distance_m / 1.2) # ~4.3 km/h walking speed

    return {
        "ordered_stops": ordered_stops,
        "total_walk_km": round(walk_distance_m / 1000.0, 2),
        "total_walk_mins": round(walk_duration_s / 60.0),
        "total_wait_mins": total_wait_mins,
        "geometry": geometry
    }