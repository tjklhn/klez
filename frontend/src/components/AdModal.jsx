import React, { useEffect, useState } from "react";

const AdModal = ({
  isOpen,
  onClose,
  onSubmit,
  accounts,
  categories,
  onRefreshCategories,
  loadingCategories,
  newAd,
  setNewAd,
  adImages,
  setAdImages,
  categoriesUpdatedAt
}) => {
  if (!isOpen) return null;

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid rgba(148,163,184,0.3)",
    borderRadius: "12px",
    background: "#0f172a",
    fontSize: "14px",
    color: "#e2e8f0"
  };

  const labelStyle = {
    display: "block",
    marginBottom: "8px",
    fontWeight: "600",
    color: "#e2e8f0"
  };

  const formatAccountLabel = (account) => {
    const name = account.profileName || account.username || "Аккаунт";
    const email = account.profileEmail || "";
    return email ? `${name} (${email})` : name;
  };

  const findNode = (nodes, value) => {
    if (!value) return null;
    for (const node of nodes) {
      if (String(node.id) === String(value) || String(node.url) === String(value)) return node;
      if (node.children?.length) {
        const found = findNode(node.children, value);
        if (found) return found;
      }
    }
    return null;
  };

  const [localCategories, setLocalCategories] = useState([]);

  useEffect(() => {
    setLocalCategories(categories || []);
  }, [categories]);

  useEffect(() => {
    if (isOpen) {
      setNewAd((prev) => ({
        ...prev,
        categoryLevel1: "",
        categoryLevel2: "",
        categoryLevel3: "",
        categoryId: "",
        categoryUrl: ""
      }));
    }
  }, [isOpen, setNewAd]);

  const level1Options = localCategories || [];
  const level1Selected = level1Options.find((item) =>
    String(item.id) === String(newAd.categoryLevel1) || String(item.url) === String(newAd.categoryLevel1)
  );
  const level2Options = level1Selected?.children || [];
  const level2Selected = level2Options.find((item) =>
    String(item.id) === String(newAd.categoryLevel2) || String(item.url) === String(newAd.categoryLevel2)
  );
  const level3Options = level2Selected?.children || [];
  const level3Selected = level3Options.find((item) =>
    String(item.id) === String(newAd.categoryLevel3) || String(item.url) === String(newAd.categoryLevel3)
  );

  const updateCategorySelection = (level, value) => {
    setNewAd((prev) => {
      const next = { ...prev };
      if (level === 1) {
        next.categoryLevel1 = value;
        next.categoryLevel2 = "";
        next.categoryLevel3 = "";
      }
      if (level === 2) {
        next.categoryLevel2 = value;
        next.categoryLevel3 = "";
      }
      if (level === 3) {
        next.categoryLevel3 = value;
      }

      const finalValue = next.categoryLevel3 || next.categoryLevel2 || next.categoryLevel1 || "";
      const selectedNode = finalValue ? findNode(level1Options, finalValue) : null;
      next.categoryId = selectedNode?.id ? String(selectedNode.id) : "";
      next.categoryUrl = selectedNode?.url || "";
      return next;
    });
  };

  const updateNodeChildren = (nodes, targetValue, children) =>
    nodes.map((node) => {
      const matches = String(node.id) === String(targetValue) || String(node.url) === String(targetValue);
      if (matches) {
        return { ...node, children };
      }
      if (node.children?.length) {
        return { ...node, children: updateNodeChildren(node.children, targetValue, children) };
      }
      return node;
    });

  const requestChildren = async (node) => {
    if (!node?.id && !node?.url) return;
    const targetValue = node.id || node.url;
    const query = node.url ? `url=${encodeURIComponent(node.url)}` : `id=${encodeURIComponent(node.id)}`;
    try {
      const response = await fetch(`http://localhost:5000/api/categories/children?${query}`);
      const data = await response.json();
      if (!Array.isArray(data?.children) || !data.children.length) return;
      setLocalCategories((prev) => updateNodeChildren(prev, targetValue, data.children));
    } catch (error) {
      // ignore
    }
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
        width: "720px",
        maxWidth: "92%",
        maxHeight: "92%",
        overflow: "auto",
        border: "1px solid rgba(148,163,184,0.2)",
        boxShadow: "0 30px 60px rgba(15,23,42,0.45)",
        color: "#e2e8f0"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h2 style={{ margin: 0 }}>Создать объявление</h2>
            <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: "14px" }}>
              Заполните поля и опубликуйте объявление в Kleinanzeigen
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "22px",
              cursor: "pointer",
              color: "#94a3b8"
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <label style={labelStyle}>
              Аккаунт:
            </label>
            <select
              value={newAd.accountId}
              onChange={(e) => setNewAd((prev) => ({ ...prev, accountId: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Выберите аккаунт</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountLabel(account)} ({account.proxy || "Без прокси"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              Название объявления:
            </label>
            <input
              type="text"
              value={newAd.title}
              onChange={(e) => setNewAd((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Введите название (10-65 символов)"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Описание:
            </label>
            <textarea
              value={newAd.description}
              onChange={(e) => setNewAd((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Введите описание (10-4000 символов)"
              rows="5"
              style={{
                ...inputStyle,
                minHeight: "140px",
                resize: "vertical",
                fontFamily: "inherit"
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Цена (EUR):
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                value={newAd.price}
                onChange={(e) => setNewAd((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="0.00"
                style={inputStyle}
              />
              <span style={{ color: "#94a3b8", fontWeight: "600" }}>€</span>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={labelStyle}>
                Категория:
              </label>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {categoriesUpdatedAt && (
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Обновлено: {new Date(categoriesUpdatedAt).toLocaleDateString()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRefreshCategories(true)}
                  disabled={loadingCategories}
                  className="secondary-button"
                  style={{
                    padding: "6px 12px",
                    border: "1px solid rgba(148,163,184,0.3)",
                    cursor: loadingCategories ? "not-allowed" : "pointer",
                    fontSize: "12px"
                  }}
                >
                  {loadingCategories ? "Обновление..." : "Обновить"}
                </button>
              </div>
            </div>

            <div style={{
              border: "1px solid rgba(148,163,184,0.3)",
              borderRadius: "12px",
              background: "rgba(15,23,42,0.7)",
              marginTop: "10px",
              overflow: "hidden"
            }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(148,163,184,0.2)" }}>
                <div style={{ fontWeight: "600", color: "#e2e8f0" }}>Select Category</div>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>Choose category for your ad</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", minHeight: "220px" }}>
                <div style={{ borderRight: "1px solid rgba(148,163,184,0.2)", padding: "12px" }}>
                  {level1Options.length ? (
                    level1Options.map((category) => {
                      const value = category.id || category.url || "";
                      const isActive = value && value === newAd.categoryLevel1;
                      return (
                        <button
                          key={category.id || category.url || category.name}
                          type="button"
                          onClick={() => {
                            if (!category.children?.length) {
                              requestChildren(category);
                            }
                            updateCategorySelection(1, value);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            marginBottom: "6px",
                            borderRadius: "10px",
                            border: "1px solid transparent",
                            background: isActive ? "rgba(59,130,246,0.2)" : "transparent",
                            color: "#e2e8f0",
                            cursor: "pointer"
                          }}
                        >
                          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{category.name}</span>
                            <span style={{ color: "#94a3b8" }}>›</span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div style={{ color: "#94a3b8", padding: "12px" }}>Категории не найдены</div>
                  )}
                </div>
                <div style={{ borderRight: "1px solid rgba(148,163,184,0.2)", padding: "12px" }}>
                  {level2Options.length ? (
                    level2Options.map((category) => {
                      const value = category.id || category.url || "";
                      const isActive = value && value === newAd.categoryLevel2;
                      return (
                        <button
                          key={category.id || category.url || category.name}
                          type="button"
                          onClick={() => {
                            if (!category.children?.length) {
                              requestChildren(category);
                            }
                            updateCategorySelection(2, value);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            marginBottom: "6px",
                            borderRadius: "10px",
                            border: "1px solid transparent",
                            background: isActive ? "rgba(59,130,246,0.2)" : "transparent",
                            color: "#e2e8f0",
                            cursor: "pointer"
                          }}
                        >
                          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{category.name}</span>
                            <span style={{ color: "#94a3b8" }}>›</span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div style={{ color: "#94a3b8", padding: "12px" }}>Select a category first</div>
                  )}
                </div>
                <div style={{ padding: "12px" }}>
                  {level3Options.length ? (
                    level3Options.map((category) => {
                      const value = category.id || category.url || "";
                      const isActive = value && value === newAd.categoryLevel3;
                      return (
                        <button
                          key={category.id || category.url || category.name}
                          type="button"
                          onClick={() => updateCategorySelection(3, value)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            marginBottom: "6px",
                            borderRadius: "10px",
                            border: "1px solid transparent",
                            background: isActive ? "rgba(59,130,246,0.2)" : "transparent",
                            color: "#e2e8f0",
                            cursor: "pointer"
                          }}
                        >
                          {category.name}
                        </button>
                      );
                    })
                  ) : (
                    <div style={{ color: "#94a3b8", padding: "12px" }}>Select subcategory</div>
                  )}
                </div>
              </div>
              <div style={{
                borderTop: "1px solid rgba(148,163,184,0.2)",
                padding: "10px 16px",
                color: "#94a3b8",
                fontSize: "12px",
                display: "flex",
                gap: "8px",
                flexWrap: "wrap"
              }}>
                <span style={{ background: "rgba(59,130,246,0.2)", padding: "4px 8px", borderRadius: "999px", color: "#e2e8f0" }}>
                  Selected
                </span>
                <span>{level1Selected?.name || "—"}</span>
                {level2Selected?.name && <span>› {level2Selected.name}</span>}
                {level3Selected?.name && (
                  <span>› {level3Selected.name}</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              PLZ (индекс):
            </label>
            <input
              type="text"
              value={newAd.postalCode}
              onChange={(e) => setNewAd((prev) => ({ ...prev, postalCode: e.target.value }))}
              placeholder="Введите почтовый индекс"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Изображения:
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setAdImages(Array.from(e.target.files || []))}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px dashed rgba(148,163,184,0.4)",
                borderRadius: "12px",
                background: "rgba(15,23,42,0.7)",
                color: "#e2e8f0"
              }}
            />
            {adImages.length > 0 && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#94a3b8" }}>
                Загружено файлов: {adImages.length}
              </div>
            )}
          </div>

          <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
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
              onClick={onSubmit}
              style={{
                padding: "10px 20px",
                color: "white",
                border: "none",
                cursor: "pointer"
              }}
              className="primary-button"
            >
              Создать объявление
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdModal;
