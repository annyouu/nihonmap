import { type CSSProperties, useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Edge = {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  length: number;
};
type Node = { id: number; lat: number; lng: number };

type PathResponse = {
  path: { lat: number; lng: number }[];
  distance: number;
  mapped_start: { lat: number; lng: number }; 
  mapped_goal: { lat: number; lng: number };   
  algorithm: string;
};

export default function WalkMap() {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [startNode, setStartNode] = useState<Node | null>(null);
  const [endNode, setEndNode] = useState<Node | null>(null);
  const [algorithm, setAlgorithm] = useState<"Q-Learning" | "SARSA">("Q-Learning");
  const [episodes, setEpisodes] = useState(100);
  const [learningRate, setLearningRate] = useState(0.1);
  const [discount, setDiscount] = useState(0.9);
  const [path, setPath] = useState<{ lat: number; lng: number }[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [graphNodes, setGraphNodes] = useState<Node[]>([]);
  
  // 経路描画の接続点として使用するため、状態は保持
  const [mappedStartNode, setMappedStartNode] = useState<{ lat: number; lng: number } | null>(null);
  const [mappedEndNode, setMappedEndNode] = useState<{ lat: number; lng: number } | null>(null);


  useEffect(() => {
    async function fetchEdges() {
      try {
        const resNodes = await fetch("http://127.0.0.1:8000/api/nodes");
        const dataNodes = await resNodes.json();
        if (Array.isArray(dataNodes.nodes)) {
            setGraphNodes(dataNodes.nodes); 
        }
      } catch (err) {
        console.error("Error fetching graph nodes:", err);
      }
      
      try {
        const res = await fetch("http://127.0.0.1:8000/api/edges");
        const data = await res.json();
        if (Array.isArray(data.edges)) {
            setEdges(data.edges);
        } else {
            console.error("Fetched edges data is not an array:", data);
        }
      } catch (err) {
        console.error("Error fetching edges:", err instanceof Error ? err.message : err);
      }
    }
    fetchEdges();
  }, []);

  function MapClickHandler() {
    useMapEvents({
      click: (e) => {
        const { lat, lng } = e.latlng;
        
        const newNode: Node = {
          id: Date.now(),
          lat,
          lng,
        };

        setNodes((prev) => [...prev, newNode]);
        
        setMappedStartNode(null); 
        setMappedEndNode(null);

        if (!startNode) {
          setStartNode(newNode);
        } else if (!endNode) {
          setEndNode(newNode);
        } else {
          setStartNode(newNode);
          setEndNode(null);
        }
      },
    });
    return null;
  }

  const handleTrain = async () => {
    if (!startNode || !endNode) {
      alert("始点と終点を選択してください");
      return;
    }

    setLoading(true);
    setPath([]);
    setDistance(null);
    setMappedStartNode(null); 
    setMappedEndNode(null);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { lat: startNode.lat, lng: startNode.lng },
          goal: { lat: endNode.lat, lng: endNode.lng },
          algorithm: algorithm,
          episodes: episodes,
          learning_rate: learningRate,
          discount: discount,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`HTTP error ${res.status}: ${errorData.error || res.statusText || 'Unknown error'}`);
      }

      const data: PathResponse = await res.json();
      console.log("経路取得成功:", data);
      
      // 決定版修正: 経路データにクリック座標を挿入
      const finalPath = [...data.path];

      // 始点のクリック座標を経路の先頭に追加
      if (startNode && data.mapped_start) {
        finalPath.unshift({ lat: startNode.lat, lng: startNode.lng });
      }

      // 終点のクリック座標を経路の末尾に追加
      if (endNode && data.mapped_goal) {
        finalPath.push({ lat: endNode.lat, lng: endNode.lng });
      }
      
      setPath(finalPath);
      setDistance(data.distance);
      setMappedStartNode(data.mapped_start);
      setMappedEndNode(data.mapped_goal);
      
    } catch (err) {
      console.error("API error:", err);
      alert(`経路計算に失敗しました。バックエンドを確認してください。\n詳細: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStartNode(null);
    setEndNode(null);
    setNodes([]);
    setPath([]);
    setDistance(null);
    setMappedStartNode(null);
    setMappedEndNode(null);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>OSMnx キャンパスナビゲーター</h1>
        <p style={styles.subtitle}>強化学習による最適経路探索</p>
      </div>

      <div style={styles.controlPanel}>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>学習アルゴリズム</h3>
          <div style={styles.radioGroup}>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="algorithm"
                checked={algorithm === "Q-Learning"}
                onChange={() => setAlgorithm("Q-Learning")}
              />{" "}
              Q-Learning
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="algorithm"
                checked={algorithm === "SARSA"}
                onChange={() => setAlgorithm("SARSA")}
              />{" "}
              SARSA
            </label>
          </div>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>学習パラメータ</h3>
          <div style={styles.parameterGrid}>
            <div style={styles.parameterItem}>
              <label style={styles.label}>エピソード数:</label>
              <input
                style={styles.input}
                type="number"
                value={episodes}
                onChange={(e) => setEpisodes(Number(e.target.value))}
              />
            </div>
            <div style={styles.parameterItem}>
              <label style={styles.label}>学習率 (α):</label>
              <input
                style={styles.input}
                type="number"
                step={0.01}
                value={learningRate}
                onChange={(e) => setLearningRate(Number(e.target.value))}
              />
            </div>
            <div style={styles.parameterItem}>
              <label style={styles.label}>割引率 (γ):</label>
              <input
                style={styles.input}
                type="number"
                step={0.01}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div style={styles.buttonSection}>
          <button
            style={{
              ...styles.trainButton,
              ...((!startNode || !endNode || loading) && styles.disabledButton),
            }}
            onClick={handleTrain}
            disabled={!startNode || !endNode || loading}
          >
            {loading ? "学習中..." : "学習実行"}
          </button>
          <button style={styles.resetButton} onClick={handleReset}>
            リセット
          </button>
        </div>

        {distance !== null && (
          <div style={styles.resultSection}>
            <p style={styles.resultText}>総距離: {distance.toFixed(2)} m</p>
          </div>
        )}
      </div>

      <div style={styles.mapContainer}>
        <h3 style={styles.mapTitle}>キャンパスマップ</h3>
        <MapContainer
          center={[36.0263, 139.7121]}
          zoom={18}
          style={{ height: "500px", width: "100%", borderRadius: "8px" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {graphNodes.map((node) => (
                <Marker
                    key={`node-${node.id}`}
                    position={[node.lat, node.lng]}
                    icon={L.divIcon({
                        className: "osmnx-node-icon",
                        // ノードを小さな黒い点として表示
                        html: `<div style="width:4px;height:4px;border-radius:50%;background:black;opacity:0.6;"></div>`,
                    })}
                />
            ))}
          
          {/* Q学習経路（赤線）: クリック座標を含むように更新済み */}
          {path.length > 1 && (
            <Polyline
              positions={path.map((p) => [p.lat, p.lng])}
              color="red"
              weight={6}
              opacity={0.8}
            />
          )}

          {/* マーカー描画: クリック座標に固定 (移動しない) */}
          {startNode && (
            <Marker
              position={[startNode.lat, startNode.lng]}
              icon={L.divIcon({
                className: "start-icon",
                html: `<div style="width:18px;height:18px;border-radius:50%;background:blue;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
              })}
            />
          )}
          {endNode && (
            <Marker
              position={[endNode.lat, endNode.lng]}
              icon={L.divIcon({
                className: "end-icon",
                html: `<div style="width:18px;height:18px;border-radius:50%;background:red;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
              })}
            />
          )}

          <MapClickHandler />
        </MapContainer>

        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendColor, background: "blue" }}></div>
            <span>始点</span>
          </div>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendColor, background: "red" }}></div>
            <span>終点</span>
          </div>
          <div style={styles.legendItem}>
            <div
              style={{
                width: "24px",
                height: "4px",
                background: "red",
                borderRadius: "2px",
              }}
            ></div>
            <span>最適経路 (Q学習)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ... (styles 定義は省略) ...
const styles: Record<string, CSSProperties> = {
  // ... (省略)
  container: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "20px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center",
    marginBottom: "30px",
  },
  title: {
    fontSize: "32px",
    fontWeight: "bold",
    color: "#1f2937",
    margin: "0 0 8px 0",
  },
  subtitle: {
    fontSize: "16px",
    color: "#6b7280",
    margin: "0",
  },
  controlPanel: {
    backgroundColor: "white",
    padding: "20px 40px 40px 20px",
    marginBottom: "24px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
    border: "1px solid #e5e7eb",
  },
  section: {
    marginBottom: "24px",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#374151",
    marginBottom: "12px",
    margin: "0 0 12px 0",
  },
  radioGroup: {
    display: "flex",
    gap: "16px",
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    fontSize: "14px",
    color: "#4b5563",
    cursor: "pointer",
  },
  parameterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "44px",
    alignItems: "center",
  },
  parameterItem: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "500",
    color: "#374151",
    display: "block",
    marginBottom: "4px",
  },
  input: {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
    backgroundColor: "#ffffff",
    width: "100%",
  },
  buttonSection: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    marginTop: "16px",
  },
  trainButton: {
    backgroundColor: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  resetButton: {
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
    backgroundColor: "#9ca3af",
  },
  resultSection: {
    marginTop: "20px",
    padding: "16px",
    backgroundColor: "#f0fdf4",
    borderRadius: "8px",
    border: "2px solid #10b981",
  },
  resultText: {
    textAlign: "center",
    color: "#059669",
    fontWeight: "bold",
    fontSize: "18px",
    margin: 0,
  },
  mapContainer: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
    border: "1px solid #e5e7eb",
  },
  mapTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#374151",
    marginBottom: "16px",
    margin: "0 0 16px 0",
    textAlign: "center",
  },
  legend: {
    display: "flex",
    justifyContent: "center",
    gap: "24px",
    marginTop: "16px",
    flexWrap: "wrap",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    color: "#4b5563",
  },
  legendColor: {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    border: "2px solid white",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
  },
};