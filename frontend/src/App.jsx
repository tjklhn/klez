import React, { useState, useEffect } from "react";
import AddAccountModal from "./components/AddAccountModal";
import AddProxyModal from "./components/AddProxyModal";
import ProxyChecker from "./components/ProxyChecker";
import MessagesTab from "./components/MessagesTab";
import AdModal from "./components/AdModal";
import ActiveAdsTab from "./components/ActiveAdsTab";

function App() {
  const [accounts, setAccounts] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showAddProxyModal, setShowAddProxyModal] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const [checkingAllProxies, setCheckingAllProxies] = useState(false);
  const [adImages, setAdImages] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoriesUpdatedAt, setCategoriesUpdatedAt] = useState(null);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [newAd, setNewAd] = useState({
    accountId: "",
    title: "",
    description: "",
    price: "",
    categoryLevel1: "",
    categoryLevel2: "",
    categoryLevel3: "",
    categoryId: "",
    categoryUrl: "",
    postalCode: ""
  });

  const formatAccountLabel = (account) => {
    const name = account.profileName || account.username || "Аккаунт";
    const email = account.profileEmail || "";
    return email ? `${name} (${email})` : name;
  };

  const cardStyle = {
    background: "linear-gradient(135deg, #0b1220 0%, #111827 100%)",
    borderRadius: "18px",
    border: "1px solid rgba(148,163,184,0.2)",
    boxShadow: "0 18px 40px rgba(15,23,42,0.35)"
  };
  const textMuted = "#94a3b8";
  const textPrimary = "#e2e8f0";
  const textTitle = "#f8fafc";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [accountsRes, proxiesRes, statsRes] = await Promise.all([
        fetch("http://localhost:5000/api/accounts").then(r => r.json()),
        fetch("http://localhost:5000/api/proxies").then(r => r.json()),
        fetch("http://localhost:5000/api/stats").then(r => r.json())
      ]);

      setAccounts(accountsRes);
      setProxies(proxiesRes);
      setStats(statsRes);
    } catch (error) {
      console.error("Ошибка загрузки данных:", error);
    }
  };

  const handleAddAccount = (newAccount) => {
    setAccounts([newAccount, ...accounts]);
    loadData(); // Перезагружаем статистику
  };

  const handleAddProxy = (newProxy) => {
    setProxies([newProxy, ...proxies]);
    loadData(); // Перезагружаем статистику
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm("Удалить аккаунт?")) return;

    try {
      const response = await fetch(`http://localhost:5000/api/accounts/${id}`, {
        method: "DELETE"
      });

      const result = await response.json();
      if (result.success) {
        setAccounts(accounts.filter(acc => acc.id !== id));
        alert("Аккаунт удален");
      }
    } catch (error) {
      alert("Ошибка при удалении");
    }
  };

  const handleDeleteProxy = async (id) => {
    if (!window.confirm("Удалить прокси?")) return;

    try {
      const response = await fetch(`http://localhost:5000/api/proxies/${id}`, {
        method: "DELETE"
      });

      const result = await response.json();
      if (result.success) {
        setProxies(proxies.filter(proxy => proxy.id !== id));
        alert("Прокси удален");
        loadData();
      }
    } catch (error) {
      alert("Ошибка при удалении прокси");
    }
  };

  const handleProxyCheckComplete = (proxyId, result) => {
    // Обновляем статус прокси в списке
    setProxies(prev => prev.map(proxy => {
      if (proxy.id === proxyId) {
        return {
          ...proxy,
          status: result.success ? "active" : "failed",
          lastChecked: new Date().toISOString(),
          checkResult: result
        };
      }
      return proxy;
    }));

    // Обновляем статистику
    loadData();
  };

  const checkAllProxies = async () => {
    setCheckingAllProxies(true);
    try {
      const response = await fetch("http://localhost:5000/api/proxies/check-all", {
        method: "POST"
      });

      const result = await response.json();
      if (result.success) {
        // Обновляем список прокси с новыми данными
        loadData();
        alert("Все прокси проверены!");
      }
    } catch (error) {
      alert("Ошибка при проверке прокси");
    } finally {
      setCheckingAllProxies(false);
    }
  };

  const loadCategories = async (forceRefresh = false) => {
    setLoadingCategories(true);
    try {
      const response = await fetch(`http://localhost:5000/api/categories${forceRefresh ? "?refresh=true" : ""}`);
      const data = await response.json();
      const items = Array.isArray(data?.categories) ? data.categories : [];
      setCategories(items);
      setCategoriesUpdatedAt(data?.updatedAt || null);
    } catch (error) {
      console.error("Ошибка загрузки категорий:", error);
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (showAdModal) {
      setNewAd((prev) => ({
        ...prev,
        categoryLevel1: "",
        categoryLevel2: "",
        categoryLevel3: "",
        categoryId: "",
        categoryUrl: ""
      }));
      loadCategories(false);
    }
  }, [showAdModal]);

  const handleCreateAd = async () => {
    if (!newAd.accountId) {
      alert("Выберите аккаунт");
      return;
    }
    if (!newAd.title.trim() || !newAd.description.trim() || !newAd.price.trim()) {
      alert("Заполните все обязательные поля");
      return;
    }
    if (!newAd.categoryId && !newAd.categoryUrl) {
      alert("Выберите категорию");
      return;
    }
    if (newAd.categoryLevel1 && !newAd.categoryId && !newAd.categoryUrl) {
      alert("Категория без ID, обновите список категорий.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("accountId", newAd.accountId);
      formData.append("title", newAd.title);
      formData.append("description", newAd.description);
      formData.append("price", newAd.price);
      if (newAd.postalCode) formData.append("postalCode", newAd.postalCode);
      if (newAd.categoryId) formData.append("categoryId", newAd.categoryId);
      if (newAd.categoryUrl) formData.append("categoryUrl", newAd.categoryUrl);
      adImages.forEach((file) => {
        formData.append("images", file);
      });

      const response = await fetch("http://localhost:5000/api/ads/create", {
        method: "POST",
        body: formData
      });

      const result = await response.json();
      if (result.success) {
        alert(result.message || "Объявление отправлено на публикацию!");
        setShowAdModal(false);
        setNewAd({
          accountId: "",
          title: "",
          description: "",
          price: "",
          categoryLevel1: "",
          categoryLevel2: "",
          categoryLevel3: "",
          categoryId: "",
          categoryUrl: "",
          postalCode: ""
        });
        setAdImages([]);
      } else {
        alert("Ошибка: " + (result.error || "Не удалось опубликовать объявление"));
      }
    } catch (error) {
      alert("Ошибка при создании объявления");
    }
  };

  const renderConnectionStatus = (proxy) => {
    const connection = proxy?.checkResult?.connectionCheck;

    if (!connection) {
      return (
        <span style={{ fontSize: "12px", color: textMuted }}>
          Соединение не проверялось
        </span>
      );
    }

    if (connection.ok) {
      return (
        <span style={{ fontSize: "12px", color: "#52c41a" }}>
          CONNECT OK ({connection.connectTime}мс{connection.statusCode ? `, ${connection.statusCode}` : ""})
        </span>
      );
    }

    return (
      <span style={{ fontSize: "12px", color: "#f87171" }}>
        CONNECT fail{connection.statusCode ? ` (${connection.statusCode})` : ""}: {connection.error || "Ошибка"}
      </span>
    );
  };

  const DashboardTab = () => (
    <div>
      <h2 style={{ color: textTitle }}>📊 Дашборд</h2>
      {stats && (
        <div style={{ display: "flex", gap: "20px", marginTop: "20px", flexWrap: "wrap" }}>
          <div style={{
            padding: "20px",
            background: "linear-gradient(135deg, rgba(30,64,175,0.35) 0%, rgba(15,23,42,0.9) 100%)",
            borderRadius: "16px",
            border: "1px solid rgba(59,130,246,0.35)",
            flex: 1,
            minWidth: "200px",
            color: textPrimary,
            boxShadow: "0 16px 28px rgba(15,23,42,0.35)"
          }}>
            <h3 style={{ color: textTitle }}>Аккаунты</h3>
            <p style={{ fontSize: "32px", fontWeight: "bold", margin: "10px 0" }}>{stats.accounts.total}</p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: textMuted }}>
              <span style={{ color: "#52c41a" }}>✓ {stats.accounts.active}</span>
              <span style={{ color: "#faad14" }}>⏳ {stats.accounts.checking}</span>
              <span style={{ color: "#ff4d4f" }}>✗ {stats.accounts.failed}</span>
            </div>
          </div>
          <div style={{
            padding: "20px",
            background: "linear-gradient(135deg, rgba(34,197,94,0.3) 0%, rgba(15,23,42,0.9) 100%)",
            borderRadius: "16px",
            border: "1px solid rgba(34,197,94,0.35)",
            flex: 1,
            minWidth: "200px",
            color: textPrimary,
            boxShadow: "0 16px 28px rgba(15,23,42,0.35)"
          }}>
            <h3 style={{ color: textTitle }}>Прокси</h3>
            <p style={{ fontSize: "32px", fontWeight: "bold", margin: "10px 0" }}>{stats.proxies.total}</p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: textMuted }}>
              <span style={{ color: "#52c41a" }}>✓ {stats.proxies.active} активны</span>
              <span style={{ color: "#ff4d4f" }}>✗ {stats.proxies.failed} не работают</span>
            </div>
          </div>
          <div style={{
            padding: "20px",
            background: "linear-gradient(135deg, rgba(249,115,22,0.3) 0%, rgba(15,23,42,0.9) 100%)",
            borderRadius: "16px",
            border: "1px solid rgba(249,115,22,0.35)",
            flex: 1,
            minWidth: "200px",
            color: textPrimary,
            boxShadow: "0 16px 28px rgba(15,23,42,0.35)"
          }}>
            <h3 style={{ color: textTitle }}>Сообщения</h3>
            <p style={{ fontSize: "32px", fontWeight: "bold", margin: "10px 0" }}>{stats.messages.total}</p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: textMuted }}>
              <span style={{ color: "#1890ff" }}>📨 {stats.messages.today} сегодня</span>
              <span style={{ color: "#52c41a" }}>🔔 {stats.messages.unread} новых</span>
            </div>
          </div>
        </div>
      )}

      <div style={{
        marginTop: "40px",
        padding: "30px",
        ...cardStyle
      }}>
        <h3 style={{ color: textTitle }}>Быстрые действия</h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "18px",
          marginTop: "20px"
        }}>
          {[
            {
              title: "Добавить аккаунт",
              subtitle: "Новые пользователи",
              icon: "＋",
              color: "#8b5cf6",
              onClick: () => setShowAddAccountModal(true)
            },
            {
              title: "Добавить прокси",
              subtitle: "Подключить IP",
              icon: "🔗",
              color: "#38bdf8",
              onClick: () => setShowAddProxyModal(true)
            },
            {
              title: checkingAllProxies ? "Проверка..." : "Проверить все",
              subtitle: "Прокси-сервера",
              icon: "🔄",
              color: "#22c55e",
              onClick: checkAllProxies,
              disabled: checkingAllProxies
            },
            {
              title: "Проверить сообщения",
              subtitle: "Входящие",
              icon: "💬",
              color: "#a855f7",
              onClick: () => setActiveTab("messages")
            },
            {
              title: "Создать объявление",
              subtitle: "Публикация",
              icon: "📝",
              color: "#f59e0b",
              onClick: () => setShowAdModal(true)
            },
            {
              title: "Активные объявления",
              subtitle: "Текущие",
              icon: "🧾",
              color: "#14b8a6",
              onClick: () => setActiveTab("active-ads")
            }
          ].map((action) => (
            <button
              key={action.title}
              onClick={action.onClick}
              disabled={action.disabled}
              style={{
                padding: "18px",
                borderRadius: "16px",
                border: "1px solid rgba(148,163,184,0.2)",
                background: "linear-gradient(135deg, #0b1220 0%, #111827 100%)",
                color: "white",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "10px",
                cursor: action.disabled ? "not-allowed" : "pointer",
                minHeight: "110px",
                boxShadow: "0 12px 24px rgba(15,23,42,0.25)"
              }}
            >
              <span style={{
                width: "44px",
                height: "44px",
                borderRadius: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: action.color,
                fontSize: "20px",
                color: "white",
                boxShadow: `0 10px 18px ${action.color}55`
              }}>
                {action.icon}
              </span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: "600", fontSize: "16px" }}>{action.title}</div>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>{action.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Статус прокси на дашборде */}
      <div style={{
        marginTop: "40px",
        padding: "20px",
        ...cardStyle
      }}>
        <h3 style={{ color: textTitle }}>Статус прокси</h3>
        <div style={{ marginTop: "15px" }}>
          {proxies.slice(0, 3).map(proxy => (
            <div key={proxy.id} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 15px",
              background: "rgba(15,23,42,0.85)",
              borderRadius: "12px",
              marginBottom: "8px",
              gap: "12px",
              border: "1px solid rgba(148,163,184,0.2)",
              color: textPrimary
            }}>
              <div>
                <strong>{proxy.name}</strong>
                <span style={{ marginLeft: "10px", color: textMuted, fontSize: "14px" }}>
                  {proxy.host}:{proxy.port}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{
                    padding: "4px 12px",
                    borderRadius: "999px",
                    background: proxy.status === "active" ? "#52c41a" : 
                              proxy.status === "failed" ? "#ff4d4f" : "#faad14",
                    color: "white",
                    fontSize: "12px"
                  }}>
                  {proxy.status === "active" ? "✓ Работает" : 
                     proxy.status === "failed" ? "✗ Не работает" : "⏳ Проверка"}
                  </span>
                  {proxy.checkResult?.location?.country && (
                    <span style={{ fontSize: "12px", color: textMuted }}>
                      {proxy.checkResult.location.country}
                    </span>
                  )}
                </div>
                {renderConnectionStatus(proxy)}
              </div>
            </div>
          ))}
          {proxies.length > 3 && (
            <button 
              onClick={() => setActiveTab("proxies")}
              style={{
                width: "100%",
                padding: "10px",
                background: "none",
                border: "1px dashed rgba(148,163,184,0.35)",
                borderRadius: "12px",
                cursor: "pointer",
                color: "#7dd3fc",
                marginTop: "10px"
              }}
            >
              Показать все прокси ({proxies.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const AccountsTab = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, color: textTitle }}>👥 Аккаунты</h2>
        <button 
          className="primary-button"
          onClick={() => setShowAddAccountModal(true)}
          style={{
            padding: "10px 20px",
            color: "white",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <span>+</span>
          Добавить аккаунт
        </button>
      </div>

      <div style={{
        ...cardStyle,
        overflow: "hidden"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", color: textPrimary }}>
          <thead style={{ background: "rgba(15,23,42,0.9)" }}>
            <tr>
              <th style={{ padding: "16px", textAlign: "left" }}>Имя пользователя</th>
              <th style={{ padding: "16px", textAlign: "left" }}>Статус</th>
              <th style={{ padding: "16px", textAlign: "left" }}>Прокси</th>
              <th style={{ padding: "16px", textAlign: "left" }}>Добавлен</th>
              <th style={{ padding: "16px", textAlign: "left" }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(account => (
              <tr key={account.id} style={{ borderTop: "1px solid rgba(148,163,184,0.2)" }}>
                <td style={{ padding: "16px" }}>{formatAccountLabel(account)}</td>
                <td style={{ padding: "16px" }}>
                  <span style={{
                    padding: "4px 12px",
                    borderRadius: "999px",
                    background: 
                      account.status === "active" ? "#52c41a" :
                      account.status === "checking" ? "#faad14" : "#ff4d4f",
                    color: "white",
                    fontSize: "12px"
                  }}>
                    {account.status}
                  </span>
                </td>
                <td style={{ padding: "16px" }}>{account.proxy || "Нет"}</td>
                <td style={{ padding: "16px" }}>{account.added}</td>
                <td style={{ padding: "16px" }}>
                  <button 
                    className="danger-button"
                    onClick={() => handleDeleteAccount(account.id)}
                    style={{
                      padding: "6px 12px",
                      color: "white",
                      border: "none",
                      borderRadius: "12px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const ProxiesTab = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, color: textTitle }}>🔗 Прокси серверы</h2>
        <div style={{ display: "flex", gap: "12px" }}>
          <button 
            className="primary-button"
            onClick={checkAllProxies}
            disabled={checkingAllProxies}
            style={{
              padding: "10px 20px",
              color: "white",
              border: "none",
              cursor: checkingAllProxies ? "not-allowed" : "pointer",
              minWidth: "180px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              justifyContent: "center"
            }}
          >
            <span>🔄</span>
            {checkingAllProxies ? "Проверка..." : "Проверить все"}
          </button>
          <button 
            className="primary-button"
            onClick={() => setShowAddProxyModal(true)}
            style={{
              padding: "10px 20px",
              color: "white",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              minWidth: "180px",
              justifyContent: "center"
            }}
          >
            <span>+</span>
            Добавить прокси
          </button>
        </div>
      </div>

      <div style={{
        ...cardStyle,
        padding: "20px",
        marginBottom: "20px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: textTitle }}>Статистика прокси</h3>
          <div style={{ display: "flex", gap: "15px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#52c41a" }}>
                {proxies.filter(p => p.status === "active").length}
              </div>
              <div style={{ fontSize: "12px", color: textMuted }}>Работают</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ff4d4f" }}>
                {proxies.filter(p => p.status === "failed").length}
              </div>
              <div style={{ fontSize: "12px", color: textMuted }}>Не работают</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#faad14" }}>
                {proxies.filter(p => p.status === "unknown" || p.status === "checking").length}
              </div>
              <div style={{ fontSize: "12px", color: textMuted }}>Не проверены</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {proxies.map(proxy => (
          <div key={proxy.id} style={{ position: "relative" }}>
            <ProxyChecker 
              proxy={proxy}
              onCheckComplete={(result) => handleProxyCheckComplete(proxy.id, result)}
              onDelete={() => handleDeleteProxy(proxy.id)}
            />
            <div style={{ marginTop: "10px" }}>
              {renderConnectionStatus(proxy)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, #111827 0%, #0b1220 45%, #070b14 100%)",
      fontFamily: "Inter, 'Segoe UI', sans-serif",
      color: textPrimary
    }}>
      {/* Header */}
      <div style={{
        background: "rgba(15,23,42,0.8)",
        padding: "0 24px",
        boxShadow: "0 8px 30px rgba(15,23,42,0.4)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(148,163,184,0.2)"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          maxWidth: "1200px",
          margin: "0 auto",
          height: "64px"
        }}>
          <h1 style={{ margin: 0, color: "#e2e8f0" }}>Kleinanzeigen Manager</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ 
              color: "#22c55e",
              display: "flex",
              alignItems: "center",
              gap: "5px"
            }}>
              <div style={{
                width: "8px",
                height: "8px",
                background: "#22c55e",
                borderRadius: "50%"
              }} />
              Система работает
            </span>
            <button 
              className="info-button"
              onClick={loadData}
              style={{
                padding: "6px 12px",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              Обновить
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{
        background: "rgba(15,23,42,0.85)",
        marginTop: "1px",
        borderBottom: "1px solid rgba(148,163,184,0.2)"
      }}>
        <div style={{
          display: "flex",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 24px"
        }}>
          <button
            onClick={() => setActiveTab("dashboard")}
            style={{
              padding: "16px 24px",
              background: "transparent",
              color: activeTab === "dashboard" ? "#7dd3fc" : textPrimary,
              border: "none",
              borderBottom: activeTab === "dashboard" ? "2px solid #7dd3fc" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            📊 Дашборд
          </button>
          <button
            onClick={() => setActiveTab("accounts")}
            style={{
              padding: "16px 24px",
              background: "transparent",
              color: activeTab === "accounts" ? "#7dd3fc" : textPrimary,
              border: "none",
              borderBottom: activeTab === "accounts" ? "2px solid #7dd3fc" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            👥 Аккаунты
          </button>
          <button
            onClick={() => setActiveTab("proxies")}
            style={{
              padding: "16px 24px",
              background: "transparent",
              color: activeTab === "proxies" ? "#7dd3fc" : textPrimary,
              border: "none",
              borderBottom: activeTab === "proxies" ? "2px solid #7dd3fc" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            🔗 Прокси
          </button>
          <button
            onClick={() => setActiveTab("messages")}
            style={{
              padding: "16px 24px",
              background: "transparent",
              color: activeTab === "messages" ? "#7dd3fc" : textPrimary,
              border: "none",
              borderBottom: activeTab === "messages" ? "2px solid #7dd3fc" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            💬 Сообщения
          </button>
          <button
            onClick={() => setActiveTab("active-ads")}
            style={{
              padding: "16px 24px",
              background: "transparent",
              color: activeTab === "active-ads" ? "#7dd3fc" : textPrimary,
              border: "none",
              borderBottom: activeTab === "active-ads" ? "2px solid #7dd3fc" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            🧾 Активные объявления
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: "1200px",
        margin: "24px auto",
        padding: "0 24px"
      }}>
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "accounts" && <AccountsTab />}
        {activeTab === "proxies" && <ProxiesTab />}
        {activeTab === "messages" && <MessagesTab />}
        {activeTab === "active-ads" && <ActiveAdsTab />}

        {/* Footer */}
        <div style={{
          marginTop: "40px",
          padding: "20px",
          background: "linear-gradient(135deg, rgba(30,64,175,0.25) 0%, rgba(15,23,42,0.9) 100%)",
          borderRadius: "18px",
          fontSize: "14px",
          border: "1px solid rgba(59,130,246,0.3)",
          color: textPrimary
        }}>
          <h3 style={{ color: textTitle }}>📚 Информация о проекте</h3>
          <p><strong>Мультиаккаунт менеджер для Kleinanzeigen</strong> с полным функционалом:</p>
          <ul style={{ margin: "10px 0", paddingLeft: "20px" }}>
            <li>✅ Реальная проверка прокси (CONNECT, локация, пинг, статус)</li>
            <li>✅ Добавление аккаунтов через файлы cookies</li>
            <li>✅ Управление прокси-серверами</li>
            <li>✅ Создание и публикация объявлений</li>
            <li>✅ Работа с сообщениями (чат)</li>
            <li>✅ Статистика и мониторинг</li>
          </ul>
          <p><strong>Технологии:</strong> React, Express.js, REST API, GeoIP, Proxy Checking</p>
          <div style={{ marginTop: "15px", display: "flex", gap: "15px", flexWrap: "wrap" }}>
            <a 
              href="http://localhost:5000" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ 
                padding: "8px 16px",
                background: "#1e40af",
                color: "white",
                textDecoration: "none",
                borderRadius: "12px",
                fontSize: "13px"
              }}
            >
              Backend API
            </a>
            <a 
              href="http://localhost:5000/api/proxies" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ 
                padding: "8px 16px",
                background: "#4f46e5",
                color: "white",
                textDecoration: "none",
                borderRadius: "12px",
                fontSize: "13px"
              }}
            >
              API Прокси
            </a>
            <a 
              href="http://localhost:5000/health" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ 
                padding: "8px 16px",
                background: "#16a34a",
                color: "white",
                textDecoration: "none",
                borderRadius: "12px",
                fontSize: "13px"
              }}
            >
              Health Check
            </a>
          </div>
        </div>
      </div>

      {/* Модальные окна */}
      {showAddAccountModal && (
        <AddAccountModal
          isOpen={showAddAccountModal}
          onClose={() => setShowAddAccountModal(false)}
          onSuccess={handleAddAccount}
          proxies={proxies}
        />
      )}

      {showAddProxyModal && (
        <AddProxyModal
          isOpen={showAddProxyModal}
          onClose={() => setShowAddProxyModal(false)}
          onSuccess={handleAddProxy}
        />
      )}

      {showAdModal && (
        <AdModal
          isOpen={showAdModal}
          onClose={() => setShowAdModal(false)}
          onSubmit={handleCreateAd}
          accounts={accounts}
          categories={categories}
          categoriesUpdatedAt={categoriesUpdatedAt}
          onRefreshCategories={loadCategories}
          loadingCategories={loadingCategories}
          newAd={newAd}
          setNewAd={setNewAd}
          adImages={adImages}
          setAdImages={setAdImages}
        />
      )}
    </div>
  );
}

export default App;
