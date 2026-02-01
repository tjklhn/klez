import React, { useEffect, useState } from "react";

const AddAccountModal = ({ isOpen, onClose, onSuccess, proxies }) => {
  const [loading, setLoading] = useState(false);
  const [selectedProxy, setSelectedProxy] = useState("");
  const [file, setFile] = useState(null);
  const [cookieText, setCookieText] = useState("");
  const [uploadMode, setUploadMode] = useState("file"); // "file" или "text"
  const [availableProxies, setAvailableProxies] = useState([]);

  useEffect(() => {
    setAvailableProxies(proxies || []);
  }, [proxies]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadProxies = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/proxies");
        const data = await response.json();
        if (!cancelled) {
          setAvailableProxies(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!cancelled) {
          setAvailableProxies(proxies || []);
        }
      }
    };

    loadProxies();

    return () => {
      cancelled = true;
    };
  }, [isOpen, proxies]);

  useEffect(() => {
    if (!selectedProxy) return;
    const stillExists = availableProxies?.some((proxy) => String(proxy.id) === String(selectedProxy));
    if (!stillExists) {
      setSelectedProxy("");
    }
  }, [availableProxies, selectedProxy]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (uploadMode === "file" && !file) {
      alert("Пожалуйста, выберите файл");
      return;
    }
    if (uploadMode === "text" && !cookieText.trim()) {
      alert("Пожалуйста, введите куки");
      return;
    }

    setLoading(true);

    try {
      let formData = new FormData();
      
      if (uploadMode === "file") {
        formData.append("cookieFile", file);
      } else {
        // Создаем файл из текста
        const blob = new Blob([cookieText], { type: "text/plain" });
        formData.append("cookieFile", blob, "cookies.txt");
      }
      
      if (selectedProxy) {
        formData.append("proxyId", selectedProxy);
      }

      const response = await fetch("http://localhost:5000/api/accounts/upload", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        alert(result.message);
        onSuccess(result.account);
        onClose();
      } else {
        alert("Ошибка: " + (result.error || "Неизвестная ошибка"));
      }
    } catch (error) {
      alert("Ошибка при загрузке: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const labelStyle = {
    display: "block",
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
        width: "500px",
        maxWidth: "90%",
        maxHeight: "90%",
        overflow: "auto",
        border: "1px solid rgba(148,163,184,0.2)",
        boxShadow: "0 30px 60px rgba(15,23,42,0.45)",
        color: "#e2e8f0"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ margin: 0 }}>Добавить аккаунт</h2>
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

        <div style={{ marginBottom: "20px", color: "#e2e8f0" }}>
          <label style={{ marginRight: "15px" }}>
            <input 
              type="radio" 
              value="file"
              checked={uploadMode === "file"}
              onChange={(e) => setUploadMode(e.target.value)}
            />
            Загрузить файл
          </label>
          <label>
            <input 
              type="radio" 
              value="text"
              checked={uploadMode === "text"}
              onChange={(e) => setUploadMode(e.target.value)}
            />
            Вставить текст
          </label>
        </div>

        <form onSubmit={handleSubmit}>
          {uploadMode === "file" ? (
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>
                Файл с куки:
              </label>
              <input
                type="file"
                accept=".txt,.json,.cookies"
                onChange={handleFileChange}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px dashed rgba(148,163,184,0.4)",
                  borderRadius: "12px",
                  backgroundColor: "rgba(15,23,42,0.7)",
                  color: "#e2e8f0"
                }}
              />
              {file && (
                <p style={{ marginTop: "10px", color: "#94a3b8" }}>
                  Выбран файл: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>
                Текст куки:
              </label>
              <textarea
                value={cookieText}
                onChange={(e) => setCookieText(e.target.value)}
                placeholder="Вставьте содержимое файла куки здесь..."
                style={{
                  width: "100%",
                  height: "200px",
                  padding: "10px",
                  border: "1px solid rgba(148,163,184,0.3)",
                  borderRadius: "12px",
                  backgroundColor: "#0f172a",
                  color: "#e2e8f0",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  resize: "vertical"
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>
              Выберите прокси:
            </label>
            <select
              value={selectedProxy}
              onChange={(e) => setSelectedProxy(e.target.value)}
              style={inputStyle}
            >
              <option value="">Без прокси</option>
              {availableProxies?.map((proxy) => (
                <option key={proxy.id} value={proxy.id}>
                  {proxy.name} ({proxy.host}:{proxy.port})
                </option>
              ))}
            </select>
          </div>

          <div style={{ 
            display: "flex", 
            gap: "10px", 
            justifyContent: "flex-end",
            marginTop: "30px" 
          }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 20px",
              border: "none",
              cursor: "pointer"
            }}
            className="secondary-button"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 20px",
              color: "white",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer"
            }}
            className="primary-button"
          >
            {loading ? "Добавление..." : "Добавить аккаунт"}
          </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAccountModal;
