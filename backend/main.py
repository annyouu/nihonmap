from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import osmnx as ox
import networkx as nx
import math, random
import itertools
from math import radians, sin, cos, atan2, sqrt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


PLACE_NAME = "日本工業大学, 宮代町, 埼玉県, Japan" 
NETWORK_TYPE = "walk"
NEARBY_NODE_THRESHOLD = 30
NEW_NODE_ID_COUNTER = -1


def haversine_distance(lat1, lon1, lat2, lon2):
    """2点間の距離を計算（メートル）"""
    R = 6371000
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(radians, [lat1, lon1, lat2, lon2])
    dlon, dlat = lon2_rad - lon1_rad, lat2_rad - lat1_rad
    a = sin(dlat / 2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

# 曲線エッジ詳細化関数
def densify_curved_edges(G):
    """曲線エッジ上に中間ノードを追加して曲線を近似"""
    global NEW_NODE_ID_COUNTER 
    edges_to_modify = []
    
    # データをコピーしてからイテレート
    # 💡 G.edges()の引数を修正: keys=Trueは不要な場合があるが、既存のロジックに合わせる
    for u, v, key, data in list(G.edges(keys=True, data=True)): 
        if 'geometry' in data and data['geometry'] is not None:
            geom = data['geometry']
            if hasattr(geom, 'coords'):
                coords = list(geom.coords)
                if len(coords) > 2:
                    edges_to_modify.append((u, v, key, data, coords))
    
    for u, v, key, data, coords in edges_to_modify:
        G.remove_edge(u, v, key)
        
        prev_node = u
        total_length = data.get('length', 0)
        num_segments = len(coords) - 1
        segment_length = total_length / num_segments if num_segments > 0 else 0
        
        for i, coord in enumerate(coords[1:-1], 1):
            new_node_id = NEW_NODE_ID_COUNTER
            NEW_NODE_ID_COUNTER -= 1
            
            # y=緯度, x=経度
            G.add_node(new_node_id, y=coord[1], x=coord[0], 
                              osmid=new_node_id, generated=True)
            
            G.add_edge(prev_node, new_node_id, key=0, 
                              length=segment_length, 
                              highway=data.get('highway', 'footway'),
                              generated=True)
            
            prev_node = new_node_id
        
        # 最後のノードと終点vを接続
        G.add_edge(prev_node, v, key=0, 
                          length=segment_length,
                          highway=data.get('highway', 'footway'),
                          generated=True)

    print(f"{len(edges_to_modify)}本の曲線エッジを詳細化しました。")

# 近接ノード接続関数
def connect_nearby_nodes_wrapper(G, threshold):
    """閾値内のノード間にエッジを作成し、グラフの接続性を向上"""
    nodes = list(G.nodes(data=True))
    added_count = 0
    
    for i, (u, u_data) in enumerate(nodes):
        u_lat, u_lng = u_data['y'], u_data['x']
        
        for j in range(i + 1, len(nodes)):
            v, v_data = nodes[j]
            if G.has_edge(u, v) or G.has_edge(v, u):
                continue
            
            v_lat, v_lng = v_data['y'], v_data['x']
            
            # haversine_distance を使用
            dist = haversine_distance(u_lat, u_lng, v_lat, v_lng)
            
            if dist <= threshold:
                # 無向グラフなので、両方向を追加
                G.add_edge(u, v, key=0, length=dist, highway='footway', generated=True)
                G.add_edge(v, u, key=0, length=dist, highway='footway', generated=True)
                added_count += 1
                
    print(f"近接ノード接続完了: {added_count}本の近接エッジを追加。")

# 💡 グラフ初期化ブロック（修正箇所）
# ----------------------------------------------------
G = ox.graph_from_place(PLACE_NAME, network_type=NETWORK_TYPE, simplify=False)
print("Graph loaded with original settings.")

# 1. 曲線エッジの詳細化を実行
densify_curved_edges(G)
print("Curved edges densified.")

# 2. グラフの無向化 (OSMnxバージョン依存を回避)
G = G.to_undirected()

# 3. 近接ノードの接続を実行
connect_nearby_nodes_wrapper(G, NEARBY_NODE_THRESHOLD)

# 4. 速度・時間の追加 (OSMnxバージョン依存とValueErrorを回避)
# 速度が不明なエッジに歩行速度(4.8 km/h)をフォールバックとして設定
G = ox.add_edge_speeds(G, fallback=4.8) 
# G = ox.add_edge_travel_times(G) の代わりに、旧バージョンに対応した関数を使用
G = ox.add_edge_travel_times(G) 

print(f"Graph loaded and connected: nodes={len(G.nodes)}, edges={len(G.edges)}")
# ----------------------------------------------------


# APIモデル (変更なし)
class NodeModel(BaseModel):
    lat: float
    lng: float

class TrainRequest(BaseModel):
    start: NodeModel
    goal: NodeModel
    episodes: int = 100
    alpha: float = 0.1
    gamma: float = 0.9

def nearest_node(lat, lng):
    return ox.distance.nearest_nodes(G, X=lng, Y=lat)

@app.get("/api/nodes")
def get_nodes():
    """OSMnxグラフ全体のノード座標を返す"""
    nodes_list = []
    # Q学習で生成されたノードも含む
    for node_id, data in G.nodes(data=True):
        nodes_list.append({
            "id": node_id,
            "lat": data.get("y"),
            "lng": data.get("x")
        })
    return {"nodes": nodes_list}

# エッジ取得API (変更なし)
@app.get("/api/edges")
def get_edges():
    edges = []
    # 💡 Q学習で生成されたエッジも含むように変更は不要
    for u, v, data in G.edges(data=True):
        edges.append({
            "from": {"lat": G.nodes[u]["y"], "lng": G.nodes[u]["x"]},
            "to": {"lat": G.nodes[v]["y"], "lng": G.nodes[v]["x"]},
            "length": data.get("length", 0)
        })
    return {"edges": edges}


# 💡 ノード取得API (フロントエンドの要望に応じた新規追加)
@app.get("/api/nodes")
def get_nodes():
    """OSMnxグラフ全体のノード座標を返す"""
    nodes_list = []
    # 💡 Q学習で生成されたノードも含む
    for node_id, data in G.nodes(data=True):
        nodes_list.append({
            "id": node_id,
            "lat": data.get("y"),
            "lng": data.get("x")
        })
    return {"nodes": nodes_list}


# 経路探索API (Q学習 + フォールバック) (変更なし)
@app.post("/api/train")
def train_route(req: TrainRequest):
    # 1. ユーザー入力座標を最も近いOSMnxノードにマッピング (近似)
    start_node_id = nearest_node(req.start.lat, req.start.lng)
    goal_node_id  = nearest_node(req.goal.lat, req.goal.lng)
    
    # 2. Q学習の実行
    q_table = {node: {} for node in G.nodes}
    alpha = req.alpha
    gamma = req.gamma
    
    # 強化学習パラメータ (GUI版を参考にε-greedy戦略を簡略化)
    epsilon = 0.5 # 探索率を固定
    
    for _ in range(req.episodes):
        state = start_node_id
        visited = set()
        max_steps = len(G.nodes) * 2 # 無限ループ防止

        for step in range(max_steps):
            neighbors = list(G.neighbors(state))
            if not neighbors:
                break

            # ε-greedy戦略
            if random.random() < epsilon:
                next_state = random.choice(neighbors)
            else:
                q_values = {n: q_table[state].get(n, 0) for n in neighbors}
                if q_values:
                    # Q値最大の行動を選択
                    next_state = max(q_values, key=q_values.get)
                else:
                    next_state = random.choice(neighbors) # Q値がない場合はランダム

            # 報酬計算: 距離を負の報酬に設定
            # 💡 距離データを利用
            # G[state][next_state][0]でエッジデータを取得。densify_curved_edgesがlengthを追加済み
            distance = G[state][next_state][0].get("length", 1) 
            reward = -distance 
            
            # ゴール報酬を優先
            if next_state == goal_node_id:
                reward = 1000.0 # ゴールに高い正の報酬
            elif next_state in visited:
                 reward -= 5.0 # 訪問済みペナルティ

            old_q = q_table[state].get(next_state, 0)
            next_max = max(q_table[next_state].values(), default=0)
            
            # Q学習更新式
            new_q = old_q + alpha * (reward + gamma * next_max - old_q)
            q_table[state][next_state] = new_q
            state = next_state
            visited.add(state)
            
            if state == goal_node_id:
                break
    
    # 3. Q値に基づく経路復元
    path = [start_node_id]
    current = start_node_id

    while current != goal_node_id:
        if not q_table[current]:
            # Qテーブルにデータがない場合は復元終了
            break

        # Q値が最大の行動を選択
        # 経路探索なので、必ず次のノードを選択する必要がある
        next_state = max(q_table[current], key=q_table[current].get, default=None)
        
        if next_state is None:
             break # 経路復元失敗
             
        path.append(next_state)
        current = next_state
        if len(path) > len(G.nodes) * 2:  # 無限ループ防止を強化
            break
    
    # 4. フォールバック (Q学習経路が見つからなかった場合)
    if path[-1] != goal_node_id or len(path) == 1:
        print("Q学習による経路復元に失敗。NetworkXの最短パスにフォールバックします。")
        try:
            # NetworkXで最短パス (ダイクストラ法) を計算
            # 💡 weight="length" を使用することで、曲線詳細化後の正確な距離を使う
            path = nx.shortest_path(G, source=start_node_id, target=goal_node_id, weight="length")
        except nx.NetworkXNoPath:
            return JSONResponse({"error": "No path found between the selected points"}, status_code=404)

    # 5. 結果の座標列と距離を計算
    
    # 座標列に変換
    coords = [{"lat": G.nodes[n]["y"], "lng": G.nodes[n]["x"]} for n in path]

    # 距離合計
    # 💡 haversine_distance を使用し、存在しないエッジ（フォールバック時など）に対応
    dist = sum(
        G[u][v][0].get("length", haversine_distance(G.nodes[u]["y"], G.nodes[u]["x"], G.nodes[v]["y"], G.nodes[v]["x"]))
        for u, v in zip(path[:-1], path[1:])
    )

    # マッピングされた始点と終点の座標
    start_mapped = {"lat": G.nodes[start_node_id]["y"], "lng": G.nodes[start_node_id]["x"]}
    goal_mapped = {"lat": G.nodes[goal_node_id]["y"], "lng": G.nodes[goal_node_id]["x"]}


    return {
        "path": coords, 
        "distance": dist,
        "mapped_start": start_mapped,
        "mapped_goal": goal_mapped,
        "algorithm": "Q-Learning (Fallback to Dijkstra)"
    }