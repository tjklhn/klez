import React, { useState } from "react";

const AddProxyModal = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "http",
    host: "",
    port: "",
    username: "",
    password: ""
  });
  const [testResult, setTestResult] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const testProxy = async () => {
    if (!formData.host || !formData.port) {
      alert("Заполните адрес и порт прокси");
      return;
    }

    setLoading(true);
    setTestResult(null);

    try {
      const response = await fetch("http://localhost:5000/api/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({
        success: false,
        error: "Ошибка при тестировании прокси"
      });
    } finally {
      setLoading(false);
    }
  };

  const addProxy = async () => {
    if (!testResult || !testResult.success) {
      alert("Сначала протестируйте прокси");
      return;
    }

    onSuccess(testResult.proxy);
    onClose();
  };

  if (!isOpen) return null;

  const labelStyle = {
    display: "flex",
    alignItems: "center",
    minHeight: "44px",
    marginBottom: "8px",
    fontWeight: "600",
    color: "#e2e8f0"
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid rgba(148,163,184,0.3)",
    borderRadius: "12px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    height: "44px"
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(15,23,42,0.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }}>
      <div style={{
        background: "linear-gradient(135deg, #0b1220 0%, #111827 100%)",
        borderRadius: "18px",
        padding: "30px",
        width: "600px",
        maxWidth: "90%",
        maxHeight: "90%",
        overflow: "auto",
        border: "1px solid rgba(148,163,184,0.2)",
        boxShadow: "0 30px 60px rgba(15,23,42,0.45)",
        color: "#e2e8f0"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ margin: 0 }}>Добавить прокси</h2>
          <button 
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "20px",
              cursor: "pointer",
              color: "#94a3b8"
            }}
          >
            ✕
          </button>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          rowGap: "32px",
          marginBottom: "28px",
          maxWidth: "520px",
          marginInline: "auto",
          alignItems: "start"
        }}>
          <div>
            <label style={labelStyle}>
              Название прокси *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Например: Germany Proxy"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Тип прокси *
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleInputChange}
              style={inputStyle}
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks4">SOCKS4</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Адрес (IP или домен) *
            </label>
            <input
              type="text"
              name="host"
              value={formData.host}
              onChange={handleInputChange}
              placeholder="Например: 192.168.1.100 или proxy.example.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Порт *
            </label>
            <input
              type="number"
              name="port"
              value={formData.port}
              onChange={handleInputChange}
              placeholder="Например: 8080"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Имя пользователя (опционально)
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="Логин для прокси"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Пароль (опционально)
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Пароль для прокси"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ 
          display: "flex", 
          gap: "12px", 
          justifyContent: "center",
          marginBottom: "20px" 
        }}>
          <button
            className="primary-button"
            onClick={testProxy}
            disabled={loading || !formData.host || !formData.port}
            style={{
              padding: "12px 30px",
              color: "white",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              height: "44px",
              minWidth: "200px",
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
                Тестирование...
              </>
            ) : "Протестировать прокси"}
          </button>
        </div>

        {testResult && (
          <div style={{ 
            marginBottom: "20px", 
            padding: "15px",
            background: testResult.success ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            borderRadius: "12px",
            border: `1px solid ${testResult.success ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`
          }}>
            <h4 style={{ 
              margin: "0 0 10px 0",
              color: testResult.success ? "#22c55e" : "#f87171"
            }}>
              {testResult.success ? "✅ Прокси работает" : "❌ Прокси не работает"}
            </h4>
            
            {testResult.success ? (
              <div>
                <p><strong>Статус:</strong> Работает • Время ответа: {testResult.checkResult?.responseTime}мс</p>
                <p><strong>IP:</strong> {testResult.checkResult?.ip}</p>
                <p><strong>Локация:</strong> {testResult.checkResult?.location?.country}, {testResult.checkResult?.location?.city}</p>
                <p><strong>Провайдер:</strong> {testResult.checkResult?.isp}</p>
              </div>
            ) : (
              <p><strong>Ошибка:</strong> {testResult.error || testResult.checkResult?.error}</p>
            )}
          </div>
        )}

        <div style={{ 
          display: "flex", 
          gap: "12px", 
          justifyContent: "flex-end",
          marginTop: "30px" 
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 20px",
              border: "none",
              cursor: "pointer",
              height: "44px",
              minWidth: "200px"
            }}
            className="secondary-button"
          >
            Отмена
          </button>
          <button
            className="primary-button"
            onClick={addProxy}
            disabled={!testResult?.success}
            style={{
              padding: "10px 20px",
              color: "white",
              border: "none",
              cursor: testResult?.success ? "pointer" : "not-allowed",
              height: "44px",
              minWidth: "200px",
              justifyContent: "center"
            }}
          >
            Добавить прокси
          </button>
        </div>

        <style jsx="true">{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default AddProxyModal;
