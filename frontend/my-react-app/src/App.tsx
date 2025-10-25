"use client";
import { type CSSProperties, useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMapEvent } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Edge = { id: string; coords: { x: number; y: number }[] };
type Node = { id: number; lat: number; lng: number };

export default function WalkMap() {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [startNode, setStartNode] = useState<Node | null>(null);
  const [endNode, setEndNode] = useState<Node | null>(null);
  const [algorithm, setAlgorithm] = useState<"Q-Learning"|"SARSA">("Q-Learning");
  const [episodes, setEpisodes] = useState(100);
  const [learningRate, setLearningRate] = useState(0.1);
  const [discount, setDiscount] = useState(0.9);

  // edges取得
  useEffect(() => {
    async function fetchEdges() {
      try {
        const res = await fetch("http://127.0.0.1:8000/api/edges");
        const data = await res.json();
        setEdges(data.edges);
      } catch (err) {
        console.error("Error fetching edges:", err instanceof Error ? err.message : err);
      }
    }
    fetchEdges();
  }, []);

  const distanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A*C + B*D;
    const len_sq = C*C + D*D;
    const param = len_sq !== 0 ? dot / len_sq : -1;
    let xx, yy;
    if(param < 0){ xx = x1; yy = y1; }
    else if(param > 1){ xx = x2; yy = y2; }
    else { xx = x1 + param*C; yy = y1 + param*D; }
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx*dx + dy*dy);
  };

  // マップクリック用
  function MapClickHandler() {
    useMapEvent("click", (e) => {
      const {lat, lng} = e.latlng;
      const THRESHOLD = 0.0001;

      let onEdge = false;
      for (const edge of edges) {
        for (let i = 0; i < edge.coords.length - 1; i++) {
          const d = distanceToSegment(
            lng, lat,
            edge.coords[i].x, edge.coords[i].y,
            edge.coords[i+1].x, edge.coords[i+1].y
          );
          if (d < THRESHOLD) {
            onEdge = true;
            break;
          }
        }
        if (onEdge) {
          break;
        }
      }

      if (!onEdge) {
        alert("歩道上に追加をしてください");
        return;
      }

      const newNode: Node = {
        id: Date.now(), lat, lng
      };

      setNodes(prev => [...prev, newNode]);

      if (!startNode) {
        // 始点が未選択なら、新しいノードを始点に設定
        setStartNode(newNode);
      } else if (!endNode) {
        // 始点が選択済みで終点が未選択なら、新しいノードを終点に設定
        setEndNode(newNode);
      } else {
        // 始点・終点ともに選択済みなら、始点を新しいノードに置き換え、終点をリセット
        setStartNode(newNode);
        setEndNode(null);
      }
    });
    return null;
  }
  // function MapClickHandler() {
  //   useMapEvent("click", (e) => {
  //     const { lat, lng } = e.latlng;
  //     const THRESHOLD = 0.0001;

  //     let onEdge = false;
  //     for (const edge of edges) {
  //       for (let i = 0; i < edge.coords.length - 1; i++) {
  //         const d = distanceToSegment(
  //           lng, lat,
  //           edge.coords[i].x, edge.coords[i].y,
  //           edge.coords[i+1].x, edge.coords[i+1].y
  //         );
  //         if(d < THRESHOLD){ onEdge = true; break; }
  //       }
  //       if(onEdge) break;
  //     }

  //     if(!onEdge){
  //       alert("歩道上に追加してください");
  //       return;
  //     }

  //     const newNode: Node = { id: Date.now(), lat, lng };
  //     setNodes(prev => [...prev, newNode]);
  //   });
  //   return null;
  // }

  const handleTrain = () => {
    alert(`学習開始: ${algorithm}, episodes=${episodes}, α=${learningRate}, γ=${discount}`);
  };
  const handleReset = () => { setStartNode(null); setEndNode(null); setNodes([]); };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>OSMnx キャンパスナビゲーター</h1>
        <p style={styles.subtitle}>強化学習による最適経路探索</p>
      </div>

      <div style={styles.controlPanel}>
        {/* アルゴリズム選択 */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>学習アルゴリズム</h3>
          <div style={styles.radioGroup}>
            <label style={styles.radioLabel}>
              <input type="radio" name="algorithm" checked={algorithm==="Q-Learning"} onChange={()=>setAlgorithm("Q-Learning")} style={styles.radio}/>
              Q-Learning
            </label>
            <label style={styles.radioLabel}>
              <input type="radio" name="algorithm" checked={algorithm==="SARSA"} onChange={()=>setAlgorithm("SARSA")} style={styles.radio}/>
              SARSA
            </label>
          </div>
        </div>

        {/* パラメータ */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>学習パラメータ</h3>
          <div style={styles.parameterGrid}>
            <div style={styles.parameterItem}>
              <label style={styles.label}>エピソード数:</label>
              <input type="number" value={episodes} onChange={e=>setEpisodes(Number(e.target.value))} style={styles.input}/>
            </div>
            <div style={styles.parameterItem}>
              <label style={styles.label}>学習率 (α):</label>
              <input type="number" step={0.01} value={learningRate} onChange={e=>setLearningRate(Number(e.target.value))} style={styles.input}/>
            </div>
            <div style={styles.parameterItem}>
              <label style={styles.label}>割引率 (γ):</label>
              <input type="number" step={0.01} value={discount} onChange={e=>setDiscount(Number(e.target.value))} style={styles.input}/>
            </div>
          </div>
        </div>

        {/* 状態表示 */}
        <div style={styles.statusSection}>
          <div style={styles.statusGrid}>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>始点:</span>
              <span style={startNode ? styles.statusSelected : styles.statusUnselected}>
                {startNode ? `ノード ${startNode.id}` : "未選択"}
              </span>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>終点:</span>
              <span style={endNode ? styles.statusSelected : styles.statusUnselected}>
                {endNode ? `ノード ${endNode.id}` : "未選択"}
              </span>
            </div>
          </div>
        </div>

        <div style={styles.buttonSection}>
          <button onClick={handleTrain} style={styles.trainButton} disabled={!startNode || !endNode}>学習実行</button>
          <button onClick={handleReset} style={styles.resetButton}>リセット</button>
        </div>
      </div>

      {/* Leaflet マップ */}
      <div style={styles.mapContainer}>
        <h3 style={styles.mapTitle}>キャンパスマップ（クリックして始点・終点を選択）</h3>
        <MapContainer center={[36.0263, 139.7121]} zoom={18} style={{ height:"400px", width:"100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors"/>
          {edges.map(edge => <Polyline key={edge.id} positions={edge.coords.map(c=>[c.y, c.x])} color="gray" weight={3}/>)}
          {nodes.map(node => (
          <Marker
            key={node.id}
            position={[node.lat, node.lng]}
            eventHandlers={{
              click: () => {
                // Marker クリックで始点/終点更新
                if (!startNode) {
                  setStartNode(node);
                } else if (!endNode && startNode.id !== node.id) {
                  setEndNode(node);
                } else {
                  setStartNode(node);
                  setEndNode(null);
                }
              },
            }}
            icon={L.divIcon({
              className: "custom-node",
              html: `
                <div style="
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  border: 2px solid white;
                  background: ${
                    startNode?.id === node.id ? "blue" :
                    endNode?.id === node.id ? "red" :
                    "gray"
                  };
                "></div>
              `,
            })}
          />
        ))}
          <MapClickHandler/>
        </MapContainer>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "20px",
    // 💡 中央寄せのための修正
    maxWidth: "1200px", // コンテンツの最大幅を設定
    margin: '0 auto', // 左右マージンを自動にし、中央寄せ
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
    borderRadius: "12px",
    padding: "24px",
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
  radio: {
    marginRight: "8px",
  },
  parameterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px",
  },
  parameterItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "500",
    color: "#374151",
  },
  input: {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
    backgroundColor: "#ffffff",
  },
  statusSection: {
    backgroundColor: "#f9fafb",
    padding: "16px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  statusGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  statusItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusLabel: {
    fontSize: "14px",
    fontWeight: "500",
    color: "#374151",
  },
  statusSelected: {
    fontSize: "14px",
    color: "#059669",
    fontWeight: "600",
  },
  statusUnselected: {
    fontSize: "14px",
    color: "#9ca3af",
  },
  buttonSection: {
    display: "flex",
    gap: "12px",
    justifyContent: "center", // ボタンを中央に配置
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
  disabledButton: { // 無効化されたボタンのスタイルを追加
    opacity: 0.6,
    cursor: 'not-allowed',
    backgroundColor: '#9ca3af',
  },
  mapContainer: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "24px",
    paddingBottom: "24px",
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
  mapArea: {
    height: "400px",
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    border: "2px solid #e5e7eb",
    marginBottom: "16px",
  },
  svg: {
    borderRadius: "8px",
    display: "block", // SVGがインライン要素になるのを防ぐ
    margin: '0 auto', // SVG自体が中央に来るように（ただし親要素のmapAreaが100%幅なので効かない可能性も、保険）
  },
  nodeCircle: {
    cursor: "pointer",
    transition: "r 0.2s",
  },
  nodeText: {
    pointerEvents: "none",
    userSelect: "none",
  },
  legend: {
    position: "absolute",
    bottom: "-37%",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    justifyContent: "center",
    gap: "24px",
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

// "use client";
// import { useEffect, useState } from "react";
// import { MapContainer, TileLayer, Polyline, Marker, useMapEvent } from "react-leaflet";
// import L from "leaflet";
// import "leaflet/dist/leaflet.css";

// type Edge = {
//   id: string;
//   coords: { x: number; y: number }[];
// };

// type Node = {
//   id: number;
//   lat: number;
//   lng: number;
// };

// export default function WalkMap() {
//   const [edges, setEdges] = useState<Edge[]>([]);
//   const [nodes, setNodes] = useState<Node[]>([]);
//   const [startNode, setStartNode] = useState<Node | null>(null);
//   const [endNode, setEndNode] = useState<Node | null>(null);

//   useEffect(() => {
//     async function fetchEdges() {
//       try {
//         const res = await fetch("http://127.0.0.1:8000/api/edges");
//         const data = await res.json();
//         setEdges(data.edges);
//       } catch (err) {
//         if (err instanceof Error) console.error("Error fetching edges:", err.message);
//         else console.error("Unknown error fetching edges", err);
//       }
//     }
//     fetchEdges();
//   }, []);

//   // 線分上までの距離（m単位）
//   const distanceToSegmentLeaflet = (p: L.LatLng, p1: L.LatLng, p2: L.LatLng) => {
//     const A = p.distanceTo(p1);
//     const B = p.distanceTo(p2);
//     const C = p1.distanceTo(p2);
//     if (C === 0) return A;

//     const dot = ((p.lng - p1.lng) * (p2.lng - p1.lng) + (p.lat - p1.lat) * (p2.lat - p1.lat)) /
//                 ((p2.lng - p1.lng)**2 + (p2.lat - p1.lat)**2);

//     if (dot < 0) return A;
//     if (dot > 1) return B;

//     const closest = L.latLng(
//       p1.lat + dot * (p2.lat - p1.lat),
//       p1.lng + dot * (p2.lng - p1.lng)
//     );
//     return p.distanceTo(closest);
//   };

//   function MapClickHandler() {
//     useMapEvent("click", (e) => {
//       const clickLatLng = e.latlng;
//       const THRESHOLD = 5; // メートル

//       let onEdge = false;

//       for (const edge of edges) {
//         for (let i = 0; i < edge.coords.length - 1; i++) {
//           const p1 = L.latLng(edge.coords[i].y, edge.coords[i].x);
//           const p2 = L.latLng(edge.coords[i+1].y, edge.coords[i+1].x);

//           const distance = distanceToSegmentLeaflet(clickLatLng, p1, p2);
//           if (distance < THRESHOLD) {
//             onEdge = true;
//             break;
//           }
//         }
//         if (onEdge) break;
//       }

//       if (!onEdge) {
//         alert("歩道を選択してください");
//         return;
//       }

//       const newNode: Node = { id: Date.now(), lat: clickLatLng.lat, lng: clickLatLng.lng };
//       setNodes([...nodes, newNode]);
//     });
//     return null;
//   }

//   const handleNodeClick = (node: Node) => {
//     if (!startNode) setStartNode(node);
//     else if (!endNode) setEndNode(node);
//     else {
//       setStartNode(node);
//       setEndNode(null);
//     }
//   };

//   return (
//     <div style={{ width: "100%", height: "600px" }}>
//       <MapContainer center={[36.0263, 139.7121]} zoom={18} style={{ height: "100%", width: "100%" }}>
//         <TileLayer
//           url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
//           attribution="&copy; OpenStreetMap contributors"
//         />

//         {edges.map(edge => (
//           <Polyline
//             key={edge.id}
//             positions={edge.coords.map(c => [c.y, c.x])}
//             color="gray"
//             weight={3}
//           />
//         ))}

//         {nodes.map(node => (
//           <Marker
//             key={node.id}
//             position={[node.lat, node.lng]}
//             eventHandlers={{ click: () => handleNodeClick(node) }}
//             icon={L.divIcon({
//               className: "custom-node",
//               html: `<div style="width:16px;height:16px;border-radius:50%;background:${
//                 startNode?.id===node.id ? "blue" : endNode?.id===node.id ? "red" : "orange"
//               };"></div>`
//             })}
//           />
//         ))}

//         <MapClickHandler />
//       </MapContainer>
//     </div>
//   );
// }
