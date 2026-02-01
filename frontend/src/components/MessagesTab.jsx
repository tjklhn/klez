import React, { useState, useEffect } from "react";

const MessagesTab = () => {
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncNotice, setSyncNotice] = useState("");
  const apiBase = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/$/, "");
  const apiUrl = (path) => `${apiBase}${path}`;

  useEffect(() => {
    loadMessages({ withSync: true, showNotice: false });
  }, []);

  const loadMessages = async ({ withSync = false, showNotice = false } = {}) => {
    if (withSync) {
      setSyncing(true);
    }
    try {
      const existingIds = new Set(messages.map((message) => message.id));
      if (showNotice) {
        setSyncNotice("");
      }
      const primaryUrl = withSync
        ? apiUrl("/api/messages/sync")
        : apiUrl("/api/messages");
      const response = await fetch(primaryUrl);
      if (!response.ok) {
        throw new Error(`Ответ сервера: ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Ответ сервера не в формате JSON");
      }
      const data = await response.json();
      if (withSync) {
        const nextMessages = data.messages || [];
        setMessages(nextMessages);
        setLastSyncedAt(data.syncedAt || new Date().toISOString());
        if (showNotice) {
          const newCount = nextMessages.filter((message) => !existingIds.has(message.id)).length;
          setSyncNotice(
            newCount > 0
              ? `Найдено ${newCount} новых сообщений`
              : "Обновлено - новых сообщений не найдено"
          );
        }
      } else {
        setMessages(data);
      }
    } catch (error) {
      console.error("Ошибка загрузки сообщений:", error);
      if (withSync) {
        try {
          const fallbackResponse = await fetch(apiUrl("/api/messages"));
          if (!fallbackResponse.ok) {
            throw new Error(`Ответ сервера: ${fallbackResponse.status}`);
          }
          const fallbackData = await fallbackResponse.json();
          setMessages(fallbackData);
        } catch (fallbackError) {
          console.error("Ошибка загрузки сообщений (fallback):", fallbackError);
        }
      }
    } finally {
      if (withSync) {
        setSyncing(false);
      }
    }
  };

  const markAsRead = async (messageId) => {
    try {
      await fetch(apiUrl(`/api/messages/${messageId}/read`), {
        method: "PUT"
      });
      
      setMessages(messages.map(msg => 
        msg.id === messageId ? { ...msg, unread: false } : msg
      ));
      
      if (selectedMessage?.id === messageId) {
        setSelectedMessage({ ...selectedMessage, unread: false });
      }
    } catch (error) {
      console.error("Ошибка:", error);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedMessage) return;
    
    setSending(true);
    try {
      const response = await fetch(apiUrl("/api/messages/send"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: selectedMessage.accountId,
          text: replyText
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setMessages([result.message, result.reply, ...messages]);
        setReplyText("");
        alert("Ответ отправлен!");
      }
    } catch (error) {
      console.error("Ошибка отправки:", error);
      alert("Ошибка при отправке");
    } finally {
      setSending(false);
    }
  };

  const getTimeAgo = (date, time) => {
    const now = new Date();
    const messageDate = new Date(date + "T" + time);
    const diffHours = Math.floor((now - messageDate) / (1000 * 60 * 60));
    
    if (diffHours < 24) {
      return time;
    } else if (diffHours < 48) {
      return "Вчера";
    } else {
      return date;
    }
  };

  return (
    <div style={{ display: "flex", gap: "20px", height: "600px" }}>
      {/* Список сообщений */}
      <div style={{ 
        flex: 1, 
        background: "linear-gradient(135deg, #0b1220 0%, #111827 100%)",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 18px 40px rgba(15,23,42,0.35)",
        border: "1px solid rgba(148,163,184,0.2)",
        color: "#e2e8f0"
      }}>
        <div style={{ 
          padding: "20px", 
          borderBottom: "1px solid rgba(148,163,184,0.2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <h3 style={{ margin: 0 }}>Диалоги</h3>
            {lastSyncedAt && (
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                Синхронизация: {new Date(lastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ 
              padding: "4px 12px", 
              background: "#1e40af", 
              color: "white",
              borderRadius: "10px",
              fontSize: "12px"
            }}>
              {messages.filter(m => m.unread).length} новых
            </span>
            {syncNotice && (
              <span style={{
                padding: "4px 12px",
                background: "rgba(15, 23, 42, 0.8)",
                borderRadius: "10px",
                fontSize: "12px",
                color: "#e2e8f0",
                border: "1px solid rgba(148,163,184,0.3)"
              }}>
                {syncNotice}
              </span>
            )}
            <button
              onClick={() => loadMessages({ withSync: true, showNotice: true })}
              disabled={syncing}
              style={{
                padding: "6px 12px",
                background: syncing ? "#1f2937" : "#111827",
                color: syncing ? "#94a3b8" : "#e2e8f0",
                border: "1px solid rgba(148,163,184,0.3)",
                borderRadius: "10px",
                cursor: syncing ? "not-allowed" : "pointer",
                fontSize: "12px"
              }}
            >
              {syncing ? "Синхронизация..." : "⟳ Обновить"}
            </button>
          </div>
        </div>
        
        <div style={{ overflow: "auto", height: "540px" }}>
          {messages.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>
              Нет сообщений
            </div>
          ) : (
            messages.map(message => (
              <div
                key={message.id}
                onClick={() => {
                  setSelectedMessage(message);
                  if (message.unread) {
                    markAsRead(message.id);
                  }
                }}
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid rgba(148,163,184,0.15)",
                  cursor: "pointer",
                  background: selectedMessage?.id === message.id
                    ? "rgba(59,130,246,0.2)"
                    : message.unread
                      ? "rgba(34,197,94,0.15)"
                      : "rgba(15,23,42,0.6)",
                  display: "flex",
                  alignItems: "center",
                  gap: "15px"
                }}
              >
                <div style={{ 
                  width: "40px", 
                  height: "40px", 
                  borderRadius: "50%",
                  background: message.unread ? "#22c55e" : "#2563eb",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px"
                }}>
                  {message.sender.charAt(0)}
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <strong style={{ whiteSpace: "nowrap" }}>{message.sender}</strong>
                      <span style={{
                        padding: "2px 8px",
                        background: "rgba(124, 58, 237, 0.2)",
                        color: "#c4b5fd",
                        borderRadius: "999px",
                        fontSize: "11px",
                        border: "1px solid rgba(124, 58, 237, 0.35)"
                      }}>
                        {message.accountName || `Аккаунт ${message.accountId}`}
                      </span>
                    </div>
                    <span style={{ 
                      fontSize: "12px", 
                      color: "#94a3b8",
                      whiteSpace: "nowrap"
                    }}>
                      {getTimeAgo(message.date, message.time)}
                    </span>
                  </div>
                  <div style={{ 
                    color: "#cbd5f5",
                    fontSize: "14px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                    {message.message}
                  </div>
                  <div style={{ 
                    fontSize: "12px", 
                    color: "#7dd3fc",
                    marginTop: "4px"
                  }}>
                    {message.unread && (
                      <span style={{ 
                        marginLeft: "0px",
                        padding: "2px 6px",
                        background: "#22c55e",
                        color: "white",
                        borderRadius: "8px",
                        fontSize: "10px"
                      }}>
                        новое
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Окно чата */}
      <div style={{ 
        flex: 2, 
        background: "linear-gradient(135deg, #0b1220 0%, #111827 100%)",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 18px 40px rgba(15,23,42,0.35)",
        border: "1px solid rgba(148,163,184,0.2)",
        display: "flex",
        flexDirection: "column",
        color: "#e2e8f0"
      }}>
        {selectedMessage ? (
          <>
            <div style={{ 
              padding: "20px", 
              borderBottom: "1px solid rgba(148,163,184,0.2)",
              background: "rgba(15,23,42,0.7)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selectedMessage.sender}</h3>
                  <div style={{ color: "#94a3b8", fontSize: "14px" }}>
                    Аккаунт: {selectedMessage.accountName}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMessage(null)}
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
            </div>
            
            <div style={{ 
              flex: 1, 
              padding: "20px",
              overflow: "auto",
              background: "rgba(15,23,42,0.6)"
            }}>
              <div style={{ 
                marginBottom: "20px",
                padding: "15px",
                background: "rgba(15,23,42,0.85)",
                borderRadius: "12px",
                borderLeft: "4px solid #38bdf8"
              }}>
                <div style={{ 
                  fontSize: "14px", 
                  color: "#94a3b8",
                  marginBottom: "8px"
                }}>
                  <strong>{selectedMessage.sender}</strong>
                  <span style={{ marginLeft: "10px", color: "#94a3b8" }}>
                    {selectedMessage.date} {selectedMessage.time}
                  </span>
                </div>
                <div style={{ fontSize: "16px" }}>
                  {selectedMessage.message}
                </div>
              </div>
            </div>
            
            <div style={{ 
              padding: "20px", 
              borderTop: "1px solid rgba(148,163,184,0.2)",
              background: "rgba(15,23,42,0.75)"
            }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Введите ответ..."
                  style={{
                    flex: 1,
                    padding: "12px",
                    border: "1px solid rgba(148,163,184,0.3)",
                    borderRadius: "10px",
                    resize: "vertical",
                    minHeight: "60px",
                    background: "#0f172a",
                    color: "#e2e8f0"
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  style={{
                    padding: "12px 24px",
                    background: sending ? "#16a34a" : "#22c55e",
                    color: "white",
                    border: "none",
                    borderRadius: "12px",
                    cursor: sending ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  {sending ? "Отправка..." : "Отправить"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ 
            flex: 1, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "#94a3b8"
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "20px" }}>💬</div>
              <h3>Выберите сообщение</h3>
              <p>Выберите сообщение из списка слева для просмотра и ответа</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesTab;
