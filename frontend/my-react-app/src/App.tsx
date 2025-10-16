"use client";
import type { CSSProperties } from "react";
import { useState, useCallback } from "react";

// モック用ノード（OSMnx から取得した座標の例）
const MOCK_NODES = [
  { id: 1, lat: 35.7125, lng: 139.7665 },
  { id: 2, lat: 35.713, lng: 139.767 },
  { id: 3, lat: 35.712, lng: 139.7675 },
  { id: 4, lat: 35.7135, lng: 139.766 },
  { id: 5, lat: 35.7128, lng: 139.7668 },
  { id: 6, lat: 35.7122, lng: 139.7672 },
  { id: 7, lat: 35.7133, lng: 139.7663 },
  { id: 8, lat: 35.7127, lng: 139.7669 },
];

export default function CampusNavigatorOSMMock() {
  const [algorithm, setAlgorithm] = useState("Q-Learning");
  const [episodes, setEpisodes] = useState(5000);
  const [learningRate, setLearningRate] = useState(0.1);
  const [discount, setDiscount] = useState(0.9);

  const [startNode, setStartNode] = useState<typeof MOCK_NODES[0] | null>(null);
  const [endNode, setEndNode] = useState<typeof MOCK_NODES[0] | null>(null);

  const handleNodeClick = useCallback(
    (node: typeof MOCK_NODES[0]) => {
      if (!startNode) {
        setStartNode(node);
      } else if (!endNode) {
        setEndNode(node);
      } else {
        // すでに両方選んでいる場合はリセット
        setStartNode(node);
        setEndNode(null);
      }
    },
    [startNode, endNode],
  );

  const handleTrain = () => {
    if (!startNode || !endNode) {
      alert("始点と終点を選択してください");
      return;
    }

    console.log("Train Start", {
      algorithm,
      episodes,
      learningRate,
      discount,
      startNode,
      endNode,
    });
    alert(
      `学習実行開始\nアルゴリズム: ${algorithm}\nエピソード: ${episodes}\n始点: ノード${startNode.id}\n終点: ノード${endNode.id}`,
    );
  };

  const handleReset = () => {
    setStartNode(null);
    setEndNode(null);
  };

  return (
    <div style={styles.container}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <h1 style={styles.title}>OSMnx キャンパスナビゲーター</h1>
        <p style={styles.subtitle}>強化学習による最適経路探索</p>
      </div>

      {/* コントロールパネル */}
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
                style={styles.radio}
              />
              Q-Learning
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="algorithm"
                checked={algorithm === "SARSA"}
                onChange={() => setAlgorithm("SARSA")}
                style={styles.radio}
              />
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
                type="number"
                value={episodes}
                onChange={(e) => setEpisodes(Number(e.target.value))}
                style={styles.input}
                min="100"
                max="100000"
                step="100"
              />
            </div>
            <div style={styles.parameterItem}>
              <label style={styles.label}>学習率 (α):</label>
              <input
                type="number"
                step={0.01}
                value={learningRate}
                onChange={(e) => setLearningRate(Number(e.target.value))}
                style={styles.input}
                min="0.01"
                max="1"
              />
            </div>
            <div style={styles.parameterItem}>
              <label style={styles.label}>割引率 (γ):</label>
              <input
                type="number"
                step={0.01}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                style={styles.input}
                min="0.1"
                max="0.99"
              />
            </div>
          </div>
        </div>

        <div style={styles.statusSection}>
          <div style={styles.statusGrid}>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>始点:</span>
              <span
                style={
                  startNode ? styles.statusSelected : styles.statusUnselected
                }
              >
                {startNode ? `ノード ${startNode.id}` : "未選択"}
              </span>
            </div>
            <div style={styles.statusItem}>
              <span style={styles.statusLabel}>終点:</span>
              <span
                style={
                  endNode ? styles.statusSelected : styles.statusUnselected
                }
              >
                {endNode ? `ノード ${endNode.id}` : "未選択"}
              </span>
            </div>
          </div>
        </div>

        <div style={styles.buttonSection}>
          <button 
            onClick={handleTrain} 
            style={{
                ...styles.trainButton, 
                // 始点・終点が未選択の場合は無効化
                ...(!startNode || !endNode ? styles.disabledButton : {})
            }}
            disabled={!startNode || !endNode}
          >
            学習実行
          </button>
          <button onClick={handleReset} style={styles.resetButton}>
            リセット
          </button>
        </div>
      </div>

      {/* マップ部分 */}
      <div style={styles.mapContainer}>
        <h3 style={styles.mapTitle}>
          ノードマップ（クリックして始点・終点を選択）
        </h3>
        <div style={styles.mapArea}>
          {/*
            NOTE: SVG内での座標変換は、このモックのラフな実装のためにハードコードされています。
            実際のOSMnx連携では、緯度/経度を画面上のピクセル座標に変換するロジックが必要です。
            ここでは、ノードが中央に集まるように見せるため、SVGの座標系を調整しています。
          */}
          <svg width="100%" height="100%" style={styles.svg}>
          
           
            

            {/* 始点-終点の経路線 */}
            {/* {startNode && endNode && (
              <line
                x1={((startNode.lng - 139.766) / 0.002) * 500 + 50}
                y1={((35.714 - startNode.lat) / 0.002) * 300 + 50}
                x2={((endNode.lng - 139.766) / 0.002) * 500 + 50}
                y2={((35.714 - endNode.lat) / 0.002) * 300 + 50}
                stroke="#10b981"
                strokeWidth={3}
                strokeDasharray="5,5"
              />
            )} */}

            {/* ノード描画 */}
            {MOCK_NODES.map((node) => {
              const x = ((node.lng - 139.766) / 0.002) * 500 + 50;
              const y = ((35.714 - node.lat) / 0.002) * 300 + 50;
              const isStart = startNode?.id === node.id;
              const isEnd = endNode?.id === node.id;

              return (
                <g key={node.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isStart || isEnd ? 12 : 8}
                    fill={isStart ? "#1e40af" : isEnd ? "#dc2626" : "#6b7280"}
                    stroke="white"
                    strokeWidth={2}
                    onClick={() => handleNodeClick(node)}
                    style={styles.nodeCircle}
                  />
                  <text
                    x={x}
                    y={y + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                    style={styles.nodeText}
                  >
                    {node.id}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <div
              style={{ ...styles.legendColor, backgroundColor: "#1e40af" }}
            ></div>
            <span>始点</span>
          </div>
          <div style={styles.legendItem}>
            <div
              style={{ ...styles.legendColor, backgroundColor: "#dc2626" }}
            ></div>
            <span>終点</span>
          </div>
          <div style={styles.legendItem}>
            <div
              style={{ ...styles.legendColor, backgroundColor: "#6b7280" }}
            ></div>
            <span>未選択ノード</span>
          </div>
        </div>
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