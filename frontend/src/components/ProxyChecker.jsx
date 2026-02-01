import React, { useState, useEffect } from "react";

const ProxyChecker = ({ proxy, onCheckComplete, onDelete }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const checkProxy = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/proxies/${proxy.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      const data = await response.json();
      setResult(data);
      
      // Добавляем проверку в историю
      const newHistoryItem = {
        timestamp: new Date().toLocaleTimeString(),
        success: data.success,
        ip: data.ip,
        location: data.location,
        responseTime: data.responseTime,
        ping: data.ping
      };
      
      setHistory(prev => [newHistoryItem, ...prev.slice(0, 4)]);
      
      if (onCheckComplete) {
        onCheckComplete(data);
      }
    } catch (error) {
      setResult({
        success: false,
        error: "Ошибка при проверке прокси"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (proxy.checkResult) {
      setResult(proxy.checkResult);
    }
  }, [proxy]);

  const getStatusColor = (status) => {
    switch(status) {
      case "active": return "#52c41a";
      case "failed": return "#ff4d4f";
      case "checking": return "#faad14";
      default: return "#d9d9d9";
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case "active": return "Работает";
      case "failed": return "Не работает";
      case "checking": return "Проверяется";
      default: return "Не проверен";
    }
  };

  return (
    <div style={{ 
      width: "100%",
      background: "linear-gradient(135deg, #0b1220 0%, #111827 100%)",
      borderRadius: "18px",
      padding: "20px",
      marginBottom: "20px",
      border: "1px solid rgba(148,163,184,0.2)",
      boxShadow: "0 18px 40px rgba(15,23,42,0.35)",
      color: "#e2e8f0"
    }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "15px" 
      }}>
        <div>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
            {proxy.name}
            <span style={{
              padding: "4px 12px",
              borderRadius: "10px",
              background: getStatusColor(proxy.status),
              color: "white",
              fontSize: "12px",
              fontWeight: "normal"
            }}>
              {getStatusText(proxy.status)}
            </span>
          </h3>
          <p style={{ margin: "5px 0", color: "#94a3b8" }}>
            {proxy.type.toUpperCase()} • {proxy.host}:{proxy.port}
            {proxy.lastChecked && (
              <span style={{ marginLeft: "10px", fontSize: "12px", color: "#64748b" }}>
                Проверено: {new Date(proxy.lastChecked).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "stretch" }}>
          <button
            className="primary-button"
            onClick={checkProxy}
            disabled={loading}
            style={{
              padding: "8px 20px",
              color: "white",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              minWidth: "160px",
              justifyContent: "center"
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: "12px",
                  height: "12px",
                  border: "2px solid white",
                  borderTop: "2px solid transparent",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite"
                }} />
                Проверка...
              </>
            ) : (
              "Проверить прокси"
            )}
          </button>
          {onDelete && (
            <button
              className="danger-button"
              onClick={onDelete}
              style={{
                padding: "8px 20px",
                color: "white",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                minWidth: "160px"
              }}
            >
              Удалить
            </button>
          )}
        </div>
      </div>

      {result && (
        <div style={{ 
          marginTop: "15px", 
          padding: "15px",
          background: result.success ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          borderRadius: "12px",
          border: `1px solid ${result.success ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ 
              margin: 0, 
              color: result.success ? "#52c41a" : "#ff4d4f",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              {result.success ? "✅ Прокси работает" : "❌ Прокси не работает"}
            </h4>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              Ответ: {result.responseTime}мс
              {result.ping && ` • Пинг: ${result.ping}мс`}
            </span>
          </div>
          
          {result.success ? (
            <div style={{ marginTop: "10px" }}>
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
                gap: "10px",
                marginTop: "10px"
              }}>
                <div style={{ padding: "10px", background: "rgba(15,23,42,0.85)", borderRadius: "10px", border: "1px solid rgba(148,163,184,0.2)" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>IP Адрес</div>
                  <div style={{ fontWeight: "bold", fontSize: "16px" }}>{result.ip}</div>
                </div>
                
                <div style={{ padding: "10px", background: "rgba(15,23,42,0.85)", borderRadius: "10px", border: "1px solid rgba(148,163,184,0.2)" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Локация</div>
                  <div style={{ fontWeight: "bold", fontSize: "16px" }}>
                    {result.location?.country}
                    {result.location?.city && `, ${result.location.city}`}
                  </div>
                </div>
                
                <div style={{ padding: "10px", background: "rgba(15,23,42,0.85)", borderRadius: "10px", border: "1px solid rgba(148,163,184,0.2)" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Провайдер</div>
                  <div style={{ fontWeight: "bold", fontSize: "16px" }}>{result.isp}</div>
                </div>
                
                <div style={{ padding: "10px", background: "rgba(15,23,42,0.85)", borderRadius: "10px", border: "1px solid rgba(148,163,184,0.2)" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Тип прокси</div>
                  <div style={{ fontWeight: "bold", fontSize: "16px" }}>{proxy.type.toUpperCase()}</div>
                </div>
              </div>
              
              {result.location?.timezone && (
                <div style={{ 
                  marginTop: "10px", 
                  padding: "10px", 
                  background: "rgba(30,64,175,0.2)",
                  borderRadius: "10px",
                  fontSize: "14px",
                  color: "#cbd5f5"
                }}>
                  <strong>Дополнительно:</strong> Часовой пояс: {result.location.timezone}
                  {result.location.coordinates && ` • Координаты: ${result.location.coordinates[0]}, ${result.location.coordinates[1]}`}
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: "10px", color: "#f87171" }}>
              <strong>Ошибка:</strong> {result.error || "Неизвестная ошибка"}
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#94a3b8" }}>
            История проверок:
          </h4>
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "8px",
            maxHeight: "150px",
            overflowY: "auto"
          }}>
            {history.map((item, index) => (
              <div key={index} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                background: index === 0 ? "rgba(30,41,59,0.75)" : "rgba(15,23,42,0.7)",
                borderRadius: "8px",
                borderLeft: `3px solid ${item.success ? "#52c41a" : "#ff4d4f"}`
              }}>
                <div>
                  <span style={{ 
                    color: item.success ? "#52c41a" : "#ff4d4f",
                    marginRight: "8px"
                  }}>
                    {item.success ? "✓" : "✗"}
                  </span>
                  <span style={{ fontWeight: "bold" }}>{item.ip || "N/A"}</span>
                  {item.location && (
                    <span style={{ marginLeft: "8px", color: "#94a3b8" }}>
                      {item.location.country}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {item.timestamp} • {item.responseTime}мс
                  {item.ping && ` • ${item.ping}мс`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx="true">{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ProxyChecker;
