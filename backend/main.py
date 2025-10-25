import os
import pyproj
import osmnx as ox
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 実際はフロントのURL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PLACE_NAME = "日本工業大学, 宮代町, 埼玉県, Japan"
NETWORK_TYPE = "walk"

G_unproj = None
G_proj = None

def ensure_graph():
    global G_unproj, G_proj
    if G_unproj is None or G_proj is None:
        G_unproj = ox.graph_from_place(PLACE_NAME, network_type=NETWORK_TYPE)
        G_proj = ox.project_graph(G_unproj, to_crs="EPSG:4326")  # WGS84(lat/lng)
        
@app.get("/api/edges")
def get_edges():
    try:
        ensure_graph()
        edges_out = []
        for u, v, key, data in G_proj.edges(keys=True, data=True):
            # print("data:",data)
            coords = data.get("geometry")
            if coords is None:
                # geometry が無い場合は端点のみ
                coords = [(G_proj.nodes[u]["x"], G_proj.nodes[u]["y"]),
                          (G_proj.nodes[v]["x"], G_proj.nodes[v]["y"])]
            else:
                coords = [(pt[0], pt[1]) for pt in coords.coords]  # (lng, lat)
            edges_out.append({
                "id": f"{u}-{v}-{key}",
                "coords": [{"x": x, "y": y} for x, y in coords]
            })
        return {"edges": edges_out}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
