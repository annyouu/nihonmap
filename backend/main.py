# backend/app/main.py
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import osmnx as ox
import networkx as nx
import numpy as np
import random
from collections import defaultdict
import json
import geopandas as gpd
from shapely.geometry import Point
import time
import itertools
import uuid
import threading

# --- 設定 ---
PLACE_NAME = "日本工業大学, 宮代町, 埼玉県, 日本"
Q_TABLE_FILE = "q_table_nit.pkl"
SARSA_TABLE_FILE = "sarsa_table_nit.pkl"
NEARBY_NODE_THRESHOLD = 5.0  # m
METERS_PER_MINUTE_WALK = 80

app = FastAPI(title="NIHONMAPAPI Backend")

# グローバル状態（簡易的な in-memory 管理）
G_osm = None
G_osm_proj = None
q_table = defaultdict(lambda: defaultdict(float))
sarsa_table = defaultdict(lambda: defaultdict(float))

# タスク管理（簡易）
tasks = {}  # task_id -> {'status': 'pending/running/done/failed', 'progress': 0.0, 'result': {...}, 'error': None}

# ---- ユーティリティ（GUI版から移植） ----
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(np.radians, [lat1, lon1, lat2, lon2])
    dlon, dlat = lon2_rad - lon1_rad, lat2_rad - lat1_rad
    a = np.sin(dlat/2)**2 + np.cos(lat1_rad)*np.cos(lat2_rad)*np.sin(dlon/2)**2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))

def densify_curved_edges(G):
    """曲線エッジ上に中間ノードを追加して曲線を近似（元コードを簡潔化）"""
    edges_to_modify = []
    for u, v, key, data in G.edges(keys=True, data=True):
        if 'geometry' in data and data['geometry'] is not None:
            geom = data['geometry']
            if hasattr(geom, 'coords'):
                coords = list(geom.coords)
                if len(coords) > 2:
                    edges_to_modify.append((u, v, key, data, coords))
    new_node_id_counter = -1
    for u, v, key, data, coords in edges_to_modify:
        G.remove_edge(u, v, key)
        prev_node = u
        total_length = data.get('length', 0)
        segment_length = total_length / (len(coords) - 1) if len(coords) > 1 else 0
        for coord in coords[1:-1]:
            new_node_id = new_node_id_counter
            new_node_id_counter -= 1
            G.add_node(new_node_id, y=coord[1], x=coord[0], osmid=new_node_id, generated=True)
            G.add_edge(prev_node, new_node_id, key=0, length=segment_length,
                       highway=data.get('highway', 'footway'), generated=True)
            prev_node = new_node_id
        G.add_edge(prev_node, v, key=0, length=segment_length,
                   highway=data.get('highway', 'footway'), generated=True)

def connect_nearby_nodes(G):
    """5メートル以内のノード間に自動でエッジ作成"""
    nodes = list(G.nodes(data=True))
    added_count = 0
    for i, (u, u_data) in enumerate(nodes):
        for j, (v, v_data) in enumerate(nodes):
            if i >= j or G.has_edge(u, v):
                continue
            dist = haversine_distance(u_data['y'], u_data['x'], v_data['y'], v_data['x'])
            if dist <= NEARBY_NODE_THRESHOLD:
                G.add_edge(u, v, key=0, length=dist, highway='footway', generated=True)
                added_count += 1
    return added_count

def graph_to_geojson(graph_proj):
    nodes_gdf, edges_gdf = ox.graph_to_gdfs(graph_proj)
    return {"nodes": json.loads(nodes_gdf.to_json()), "edges": json.loads(edges_gdf.to_json())}

def get_path_distance(G, path):
    if not path or len(path) < 2:
        return 0.0
    total = 0.0
    for i in range(len(path)-1):
        u, v = path[i], path[i+1]
        if G.has_edge(u, v):
            edge_data = G[u][v]
            min_length = float('inf')
            for key in edge_data:
                if 'length' in edge_data[key]:
                    min_length = min(min_length, edge_data[key]['length'])
            if min_length != float('inf'):
                total += min_length
            else:
                total += haversine_distance(G.nodes[u]['y'], G.nodes[u]['x'], G.nodes[v]['y'], G.nodes[v]['x'])
        else:
            # fallback: straight distance
            total += haversine_distance(G.nodes[u]['y'], G.nodes[u]['x'], G.nodes[v]['y'], G.nodes[v]['x'])
    return total

def get_path_from_table(table, start, goal, G):
    """Q/SARSAテーブルに基づいてノード列を生成（元コードに準拠）"""
    if not table or start not in table:
        return None
    path = [start]
    current = start
    visited = {start}
    max_steps = len(G.nodes)
    for _ in range(max_steps):
        if current == goal:
            return path
        neighbors = list(G.neighbors(current))
        if not neighbors:
            break
        unvisited_neighbors = [n for n in neighbors if n not in visited]
        candidates = unvisited_neighbors if unvisited_neighbors else neighbors
        q_values = {n: table[current].get(n, -float('inf')) for n in candidates}
        if not q_values:
            break
        max_q = max(q_values.values())
        best_actions = [n for n, q in q_values.items() if q == max_q]
        next_node = random.choice(best_actions)
        path.append(next_node)
        visited.add(next_node)
        current = next_node
    return path if current == goal else None

# ---- 学習ルーチン（簡易移植） ----
def train_qlearning_task(start_node, goal_node, params, task_id):
    try:
        tasks[task_id]['status'] = 'running'
        episodes = int(params.get('episodes', 3000))
        learning_rate = float(params.get('learning_rate', 0.1))
        discount_factor = float(params.get('discount_factor', 0.9))
        initial_epsilon = float(params.get('initial_epsilon', 1.0))
        epsilon_decay = float(params.get('epsilon_decay', 0.995))
        min_epsilon = float(params.get('min_epsilon', 0.01))

        epsilon = initial_epsilon
        episode_rewards = []
        episode_steps = []
        success_count = 0
        start_time = time.time()

        for episode in range(episodes):
            # ランダム start/goal but bias to chosen nodes occasionally
            s_node = random.choice(list(G_osm.nodes()))
            g_node = random.choice(list(G_osm.nodes()))
            if episode % 10 == 0 and start_node is not None and goal_node is not None:
                s_node, g_node = start_node, goal_node

            current_state = s_node
            episode_reward = 0
            steps = 0
            visited = set()
            max_steps = len(G_osm.nodes) * 2

            while steps < max_steps:
                visited.add(current_state)
                if current_state == g_node:
                    reward = 100.0
                    episode_reward += reward
                    if current_state == goal_node:
                        success_count += 1
                    break

                neighbors = list(G_osm.neighbors(current_state))
                if not neighbors:
                    break

                if random.random() < epsilon:
                    action = random.choice(neighbors)
                else:
                    q_values = {n: q_table[current_state][n] for n in neighbors}
                    max_q = max(q_values.values()) if q_values else -float('inf')
                    best_actions = [n for n, q in q_values.items() if q == max_q]
                    action = random.choice(best_actions)

                if action == g_node:
                    reward = 100.0
                elif action in visited:
                    reward = -5.0
                else:
                    reward = -1.0

                episode_reward += reward
                old_q = q_table[current_state][action]
                next_neighbors = list(G_osm.neighbors(action))
                if next_neighbors and q_table[action]:
                    next_max_q = max(q_table[action][n] for n in next_neighbors)
                else:
                    next_max_q = 0

                new_q = old_q + learning_rate * (reward + discount_factor * next_max_q - old_q)
                q_table[current_state][action] = new_q

                current_state = action
                steps += 1

            episode_rewards.append(episode_reward)
            episode_steps.append(steps)
            epsilon = max(min_epsilon, epsilon * epsilon_decay)

            if (episode + 1) % 50 == 0:
                tasks[task_id]['progress'] = (episode + 1) / episodes * 100.0

        elapsed_time = time.time() - start_time
        tasks[task_id]['status'] = 'done'
        tasks[task_id]['result'] = {
            'algorithm': 'Q-Learning',
            'rewards': episode_rewards,
            'steps': episode_steps,
            'num_episodes': episodes,
            'success_rate': success_count / episodes * 100 if episodes > 0 else 0.0,
            'elapsed_time': elapsed_time
        }
    except Exception as e:
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = str(e)

def train_sarsa_task(start_node, goal_node, params, task_id):
    try:
        tasks[task_id]['status'] = 'running'
        episodes = int(params.get('episodes', 3000))
        learning_rate = float(params.get('learning_rate', 0.1))
        discount_factor = float(params.get('discount_factor', 0.9))
        initial_epsilon = float(params.get('initial_epsilon', 1.0))
        epsilon_decay = float(params.get('epsilon_decay', 0.995))
        min_epsilon = float(params.get('min_epsilon', 0.01))

        epsilon = initial_epsilon
        episode_rewards = []
        episode_steps = []
        success_count = 0
        start_time = time.time()

        for episode in range(episodes):
            s_node = random.choice(list(G_osm.nodes()))
            g_node = random.choice(list(G_osm.nodes()))
            if episode % 10 == 0 and start_node is not None and goal_node is not None:
                s_node, g_node = start_node, goal_node

            current_state = s_node
            episode_reward = 0
            steps = 0
            visited = set()
            max_steps = len(G_osm.nodes) * 2

            # initial action
            neighbors = list(G_osm.neighbors(current_state))
            if not neighbors:
                continue
            if random.random() < epsilon:
                current_action = random.choice(neighbors)
            else:
                q_values = {n: sarsa_table[current_state][n] for n in neighbors}
                max_q = max(q_values.values()) if q_values else -float('inf')
                best_actions = [n for n, q in q_values.items() if q == max_q]
                current_action = random.choice(best_actions)

            while steps < max_steps:
                visited.add(current_state)
                if current_state == g_node:
                    reward = 100.0
                    episode_reward += reward
                    if current_state == goal_node:
                        success_count += 1
                    break

                next_state = current_action
                if next_state == g_node:
                    reward = 100.0
                elif next_state in visited:
                    reward = -5.0
                else:
                    reward = -1.0

                episode_reward += reward

                next_neighbors = list(G_osm.neighbors(next_state))
                if next_neighbors:
                    if random.random() < epsilon:
                        next_action = random.choice(next_neighbors)
                    else:
                        q_values = {n: sarsa_table[next_state][n] for n in next_neighbors}
                        max_q = max(q_values.values()) if q_values else -float('inf')
                        best_actions = [n for n, q in q_values.items() if q == max_q]
                        next_action = random.choice(best_actions)
                else:
                    next_action = None

                old_q = sarsa_table[current_state][current_action]
                if next_action is not None:
                    next_q = sarsa_table[next_state][next_action]
                else:
                    next_q = 0

                new_q = old_q + learning_rate * (reward + discount_factor * next_q - old_q)
                sarsa_table[current_state][current_action] = new_q

                current_state = next_state
                current_action = next_action
                steps += 1
                if current_action is None:
                    break

            episode_rewards.append(episode_reward)
            episode_steps.append(steps)
            epsilon = max(min_epsilon, epsilon * epsilon_decay)

            if (episode + 1) % 50 == 0:
                tasks[task_id]['progress'] = (episode + 1) / episodes * 100.0

        elapsed_time = time.time() - start_time
        tasks[task_id]['status'] = 'done'
        tasks[task_id]['result'] = {
            'algorithm': 'SARSA',
            'rewards': episode_rewards,
            'steps': episode_steps,
            'num_episodes': episodes,
            'success_rate': success_count / episodes * 100 if episodes > 0 else 0.0,
            'elapsed_time': elapsed_time
        }
    except Exception as e:
        tasks[task_id]['status'] = 'failed'
        tasks[task_id]['error'] = str(e)

# ---- FastAPI モデル ----
class LatLon(BaseModel):
    lat: float
    lon: float

class RouteRequest(BaseModel):
    start: int
    goal: int
    method: str = "shortest"  # "shortest"|"q"|"sarsa"

class TrainRequest(BaseModel):
    start: int | None = None
    goal: int | None = None
    method: str  # "q" or "sarsa"
    params: dict | None = None

# ---- エンドポイント ----
@app.on_event("startup")
def load_graph():
    global G_osm, G_osm_proj
    # WARNING: ここは起動時にOSMデータをダウンロードするため時間がかかる場合があります
    G_osm = ox.graph_from_place(PLACE_NAME, network_type='walk', retain_all=True, simplify=False)
    densify_curved_edges(G_osm)
    connect_nearby_nodes(G_osm)
    G_osm_proj = ox.project_graph(G_osm)

@app.get("/api/graph")
def api_graph():
    if G_osm_proj is None:
        raise HTTPException(status_code=500, detail="graph not loaded")
    return graph_to_geojson(G_osm_proj)

@app.post("/api/nearest_node")
def api_nearest(payload: LatLon):
    if G_osm_proj is None:
        raise HTTPException(status_code=500, detail="graph not loaded")
    pt = gpd.GeoSeries([Point(payload.lon, payload.lat)], crs="EPSG:4326")
    pt_proj = pt.to_crs(G_osm_proj.graph['crs'])
    x, y = pt_proj.geometry.x.iloc[0], pt_proj.geometry.y.iloc[0]
    node = ox.nearest_nodes(G_osm_proj, X=x, Y=y)
    return {"node_id": int(node)}

@app.post("/api/route")
def api_route(req: RouteRequest):
    if G_osm is None or G_osm_proj is None:
        raise HTTPException(status_code=500, detail="graph not loaded")
    if req.method == "shortest":
        try:
            path = nx.shortest_path(G_osm, req.start, req.goal, weight="length")
        except nx.NetworkXNoPath:
            raise HTTPException(status_code=404, detail="no path")
    elif req.method == "q":
        path = get_path_from_table(q_table, req.start, req.goal, G_osm)
        if path is None:
            raise HTTPException(status_code=404, detail="Q-table path not available")
    elif req.method == "sarsa":
        path = get_path_from_table(sarsa_table, req.start, req.goal, G_osm)
        if path is None:
            raise HTTPException(status_code=404, detail="SARSA-table path not available")
    else:
        raise HTTPException(status_code=400, detail="invalid method")

    nodes_proj = [(G_osm_proj.nodes[n]['y'], G_osm_proj.nodes[n]['x']) for n in path]  # lat, lon order for front
    distance = get_path_distance(G_osm, path)
    return {"path": path, "coords": nodes_proj, "distance_m": distance}

@app.post("/api/train")
def api_train(req: TrainRequest, background_tasks: BackgroundTasks):
    if G_osm is None:
        raise HTTPException(status_code=500, detail="graph not loaded")
    if req.method not in ("q", "sarsa"):
        raise HTTPException(status_code=400, detail="method must be 'q' or 'sarsa'")
    task_id = str(uuid.uuid4())
    tasks[task_id] = {"status": "pending", "progress": 0.0, "result": None, "error": None}
    # launch background training in a thread via BackgroundTasks
    if req.method == "q":
        background_tasks.add_task(train_qlearning_task, req.start, req.goal, req.params or {}, task_id)
    else:
        background_tasks.add_task(train_sarsa_task, req.start, req.goal, req.params or {}, task_id)
    return {"task_id": task_id}

@app.get("/api/train/{task_id}")
def api_train_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="task not found")
    return tasks[task_id]

@app.post("/api/q/save")
def api_q_save():
    import pickle
    with open(Q_TABLE_FILE, "wb") as f:
        pickle.dump({k: dict(v) for k, v in q_table.items()}, f)
    return {"saved": True}

@app.post("/api/q/load")
def api_q_load():
    import pickle
    try:
        with open(Q_TABLE_FILE, "rb") as f:
            loaded = pickle.load(f)
        global q_table
        q_table = defaultdict(lambda: defaultdict(float))
        for k, v in loaded.items():
            q_table[k] = defaultdict(float, v)
        return {"loaded": True}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Q table not found")

@app.post("/api/sarsa/save")
def api_sarsa_save():
    import pickle
    with open(SARSA_TABLE_FILE, "wb") as f:
        pickle.dump({k: dict(v) for k, v in sarsa_table.items()}, f)
    return {"saved": True}

@app.post("/api/sarsa/load")
def api_sarsa_load():
    import pickle
    try:
        with open(SARSA_TABLE_FILE, "rb") as f:
            loaded = pickle.load(f)
        global sarsa_table
        sarsa_table = defaultdict(lambda: defaultdict(float))
        for k, v in loaded.items():
            sarsa_table[k] = defaultdict(float, v)
        return {"loaded": True}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="SARSA table not found")
