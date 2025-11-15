# 日本工業大学　最短経路マップナビゲーター

## 概要
本プロジェクトは、OSM（OpenStreetMap）データを利用し、日本工業大学キャンパス内の歩行者向け最短経路を強化学習(Q学習)を使って探索するWebアプリです。
今はQ学習を利用していますが、Sarsaなどにも拡張できたらと思っております。
フロントエンドは React + Leaflet で地図を表示し、バックエンドは FastAPI + NetworkX + OSMnx で経路計算を行います。
Q学習を用いた強化学習アルゴリズムで経路を学習し、失敗時はダイクストラ法で最短経路を計算します。


### なぜダイクストラ法を採用したのか？

## 技術スタック
| 種類      | 技術                                        |
| ------- | ----------------------------------------- |
| フロントエンド | React, TypeScript, react-leaflet, Leaflet |
| バックエンド  | Python, FastAPI, NetworkX, OSMnx          |
| 通信      | REST API (JSON)                           |

### react-leaflet, Leaflet ってどういうもの？

## プロジェクト構成
```bash
project/
├─ frontend/              # React アプリ
│   └─ src/
│       └─ WalkMap.tsx
├─ backend/               # FastAPI アプリ
│   └─ main.py
├─ README.md
└─ requirements.txt       # Python依存
```
現時点では、MVP(最小構成なので)、コンポーネントによる切り分けは行なっていません。
今後アプリが拡張される場合は、アーキテクチャ設計もしっかり取り入れたいと考えています。

# バックエンド仕様（FastAPI）
API一覧
| エンドポイント      | メソッド | 説明                       |
| ------------ | ---- | ------------------------ |
| `/api/nodes` | GET  | グラフ上の全ノード座標を取得           |
| `/api/edges` | GET  | グラフ上の全エッジ情報（始点・終点・距離）を取得 |
| `/api/train` | POST | 選択した始点・終点に対して経路探索を実行     |

## なぜPython(FastAPI)を採用したか？

## /api/train クエスト例
```bash
"start": { "lat": 36.0263, "lng": 139.7121 }, # スタート地点のクリック座標
"goal": { "lat": 36.0270, "lng": 139.7130 },  # ゴール地点のクリック座標
"episodes": 100,  # エピソード数
"alpha": 0.1, # 学習率
"gamma": 0.9 # 割引率
```

## /api/train レスポンス例
```bash
{
  "path": [
    {"lat": 36.0263, "lng": 139.7121},
    {"lat": 36.0265, "lng": 139.7125},
    {"lat": 36.0270, "lng": 139.7130}
  ],
  "distance": 120.5,
  "mapped_start": {"lat": 36.0263, "lng": 139.7121},
  "mapped_goal": {"lat": 36.0270, "lng": 139.7130},
  "algorithm": "Q-Learning (Fallback to Dijkstra)"
}
```

## バックエンドの詳細処理内容(関数について)
1. haversine_distance(lat1, lon1, lat2, lon2)
- 経度緯度から地球上の距離(メートル)を計算する

2. densify_curved_edges(G)
- OSMnxの曲線道路を中間ノードで分割する
- より正確な距離計算と Q学習経路探索のために必要

3. connect_nearby_nodes_wrapper(G, threshold)
- 閾値以内のノード同士を接続する
- 道路が断裂している場合でも、歩行可能な近接経路を作る

4. nearest_node(lat, lng)
- 指定した座標に最も近いグラフ上のノードIDを返す
- フロントでクリックした座標をグラフにマッピングする

5. /api/nodes
- グラフ内のすべてのノードのIDと座標を返す

6. /api/edges
- グラフ内のすべてのエッジ情報(from, to, length)を返す

7. /api/train
実際に強化学習を行うAPI
- 入力座標から終了までの最短経路を求める


# フロントエンド仕様(主要機能)
- 地図表示（Leaflet + OpenStreetMap）
- マップクリックで始点・終点を選択
- 学習アルゴリズムを選択する
- 学習パラメータ設定 (エピソード数、学習率 α、割引率 γ)
- 経路描画 (赤線)
- 総距離表示

# フロント → バックエンドの通信
1. 初回ロード時：
- /api/nodes でノード取得
- /api/edges でエッジ取得
2. ユーザーが始点・終点を選択 → 「学習実行」ボタン押下：
- /api/train に POST
- 結果を Polyline としてマップ上に描画



## 距離計算distanceってどうやって行なっている？
