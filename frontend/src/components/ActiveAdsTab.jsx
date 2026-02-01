import React, { useEffect, useState } from "react";

const ActiveAdsTab = () => {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadAds = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:5000/api/ads/active");
      const data = await response.json();
      setAds(Array.isArray(data?.ads) ? data.ads : []);
    } catch (error) {
      console.error("Ошибка загрузки активных объявлений:", error);
      setAds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAds();
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, color: "#f8fafc" }}>🧾 Активные объявления</h2>
        <button
          className="primary-button"
          onClick={loadAds}
          disabled={loading}
          style={{
            padding: "8px 16px",
            color: "white",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "14px"
          }}
        >
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {ads.length === 0 && !loading && (
        <div style={{
          padding: "20px",
          borderRadius: "16px",
          border: "1px solid rgba(148,163,184,0.2)",
          background: "rgba(15,23,42,0.7)",
          color: "#94a3b8"
        }}>
          Активных объявлений не найдено.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
        {ads.map((ad, index) => (
          <div
            key={`${ad.accountId || "acc"}-${index}-${ad.title}`}
            style={{
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: "18px",
              overflow: "hidden",
              background: "linear-gradient(135deg, #0b1220 0%, #111827 100%)",
              boxShadow: "0 18px 40px rgba(15,23,42,0.35)",
              color: "#e2e8f0"
            }}
          >
            <div style={{ height: "160px", background: "rgba(15,23,42,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {ad.image ? (
                <img src={ad.image} alt={ad.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ color: "#94a3b8", fontSize: "12px" }}>Нет изображения</span>
              )}
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontWeight: "600", color: "#f8fafc", marginBottom: "6px" }}>{ad.title}</div>
              <div style={{ color: "#7dd3fc", fontWeight: "600", marginBottom: "6px" }}>{ad.price || "Цена не указана"}</div>
              <div style={{ marginBottom: "6px" }}>
                <span style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: ad.status === "Reserviert" ? "#f59e0b" : ad.status === "Gelöscht" ? "#ef4444" : "#16a34a",
                  color: "white",
                  fontSize: "12px"
                }}>
                  {ad.status || "Aktiv"}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                Аккаунт: <strong>{ad.accountLabel || "—"}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActiveAdsTab;
