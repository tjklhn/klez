const express = require("express");
const cors = require("cors");
const proxyChecker = require("./proxyChecker");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { listAccounts, insertAccount, deleteAccount, countAccountsByStatus, getAccountById } = require("./db");
const { publishAd } = require("./adPublisher");
const { validateCookies, pickDeviceProfile } = require("./cookieValidator");
const { fetchActiveAds } = require("./adsService");
const { upsertAd } = require("./adsStore");
const { getCategories, getCategoryChildren } = require("./categoryService");

const app = express();
const PORT = 5000;

const proxies = [];
const messages = [
  {
    id: 1,
    accountId: 1,
    accountName: "user_klein_1",
    sender: "Покупатель 1",
    message: "Здравствуйте! Подскажите, товар в наличии?",
    time: "10:30",
    date: "2024-01-30",
    unread: true,
    type: "incoming"
  },
  {
    id: 2,
    accountId: 2,
    accountName: "user_klein_2",
    sender: "Markus",
    message: "Здравствуйте! Возможна ли скидка при самовывозе?",
    time: "09:12",
    date: "2024-01-30",
    unread: false,
    type: "incoming"
  },
  {
    id: 3,
    accountId: 3,
    accountName: "user_klein_3",
    sender: "Michele",
    message: "Можно ли доставку в Берлин? Спасибо!",
    time: "22:47",
    date: "2024-01-29",
    unread: true,
    type: "incoming"
  }
];

const getProxyLabel = (proxyId) => {
  const proxy = proxies.find((item) => item.id === proxyId);
  return proxy ? `${proxy.name} (${proxy.host}:${proxy.port})` : "Нет";
};

const getAccountName = (accountId, fallback) => {
  const account = getAccountById(accountId);
  return account?.username || fallback || `user_${accountId}`;
};

const hydrateMessages = () =>
  messages.map((message) => ({
    ...message,
    accountName: getAccountName(message.accountId, message.accountName)
  }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

const adUploadDir = path.join(__dirname, "..", "data", "ad-uploads");
if (!fs.existsSync(adUploadDir)) {
  fs.mkdirSync(adUploadDir, { recursive: true });
}

const adUpload = multer({
  dest: adUploadDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 }
});

// Middleware
const corsOptions = {
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// Маршруты
app.get("/", (req, res) => {
  res.json({ 
    message: "✅ Kleinanzeigen Backend работает!",
    endpoints: [
      "/api/accounts - список аккаунтов",
      "/api/proxies - список прокси",
      "/health - статус сервиса"
    ]
  });
});

app.get("/api/accounts", (req, res) => {
  const accounts = listAccounts();
  res.json(accounts.map(({ cookie, deviceProfile, ...account }) => ({
    ...account,
    proxy: getProxyLabel(account.proxyId)
  })));
});

app.get("/api/ads/active", async (req, res) => {
  try {
    const accounts = listAccounts();
    const ads = await fetchActiveAds({ accounts, proxies });
    res.json({ ads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/proxies", (req, res) => {
  res.json(proxies);
});

app.get("/api/categories", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const data = await getCategories({ forceRefresh });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/categories/children", async (req, res) => {
  try {
    const id = req.query.id ? String(req.query.id) : "";
    const url = req.query.url ? String(req.query.url) : "";
    const children = await getCategoryChildren({ id, url });
    res.json({ children });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "kleinanzeigen-backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0"
  });
});

app.get("/api/stats", (req, res) => {
  const activeAccounts = countAccountsByStatus("active");
  const checkingAccounts = countAccountsByStatus("checking");
  const failedAccounts = countAccountsByStatus("invalid");
  const activeProxies = proxies.filter((proxy) => proxy.status === "active").length;
  const failedProxies = proxies.filter((proxy) => proxy.status === "failed").length;

  res.json({
    accounts: {
      total: activeAccounts + checkingAccounts + failedAccounts,
      active: activeAccounts,
      checking: checkingAccounts,
      failed: failedAccounts
    },
    proxies: {
      total: proxies.length,
      active: activeProxies,
      failed: failedProxies
    },
    messages: {
      total: messages.length,
      today: messages.filter((msg) => msg.date === new Date().toISOString().slice(0, 10)).length,
      unread: messages.filter((msg) => msg.unread).length
    }
  });
});

app.get("/api/messages", (req, res) => {
  res.json(hydrateMessages());
});

app.get("/api/messages/sync", (req, res) => {
  res.json({
    success: true,
    syncedAt: new Date().toISOString(),
    messages: hydrateMessages()
  });
});

app.put("/api/messages/:id/read", (req, res) => {
  const messageId = Number(req.params.id);
  const message = messages.find((msg) => msg.id === messageId);
  if (!message) {
    res.status(404).json({ success: false, error: "Сообщение не найдено" });
    return;
  }
  message.unread = false;
  res.json({ success: true });
});

app.post("/api/messages/send", (req, res) => {
  const { accountId, text } = req.body || {};
  if (!accountId || !text) {
    res.status(400).json({ success: false, error: "Укажите accountId и текст" });
    return;
  }

  const newMessage = {
    id: Date.now(),
    accountId,
    accountName: getAccountName(accountId),
    sender: "Вы",
    message: text,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    date: new Date().toISOString().slice(0, 10),
    unread: false,
    type: "outgoing"
  };

  messages.unshift(newMessage);

  setTimeout(() => {
    const replyMessage = {
      id: Date.now() + 1,
      accountId,
      accountName: getAccountName(accountId),
      sender: "Покупатель",
      message: "Спасибо за информацию!",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: new Date().toISOString().slice(0, 10),
      unread: true,
      type: "incoming"
    };

    messages.unshift(replyMessage);

    res.json({
      success: true,
      message: newMessage,
      reply: replyMessage
    });
  }, 800);
});

// Маршрут для загрузки куки (симуляция)
app.post("/api/accounts/upload", upload.single("cookieFile"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "Ожидается файл с куками" });
      return;
    }

    const rawCookieText = req.file.buffer.toString("utf8");
    const proxyId = req.body?.proxyId ? Number(req.body.proxyId) : null;
    const deviceProfile = pickDeviceProfile();
    const selectedProxy = proxyId ? proxies.find((item) => item.id === proxyId) : null;

    if (proxyId && !selectedProxy) {
      res.status(400).json({ success: false, error: "Выбранный прокси не найден" });
      return;
    }

    let validation = await validateCookies(rawCookieText, {
      deviceProfile,
      proxy: selectedProxy
    });

    if (!validation.valid && selectedProxy && /ERR_TUNNEL_CONNECTION_FAILED/i.test(validation.reason || "")) {
      validation = await validateCookies(rawCookieText, { deviceProfile });
    }

    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.reason || "Куки невалидны"
      });
      return;
    }

    const newAccount = {
      username: `klein_${Date.now().toString().slice(-6)}`,
      profileName: validation.profileName || "",
      profileEmail: validation.profileEmail || "",
      status: "active",
      added: new Date().toISOString().slice(0, 10),
      proxyId,
      cookie: rawCookieText,
      deviceProfile: JSON.stringify(validation.deviceProfile),
      lastCheck: new Date().toISOString(),
      error: null
    };

    const accountId = insertAccount(newAccount);

    res.json({
      success: true,
      message: "Куки валидны, аккаунт сохранен",
      account: {
        id: accountId,
        username: newAccount.username,
        profileName: newAccount.profileName,
        profileEmail: newAccount.profileEmail,
        status: newAccount.status,
        added: newAccount.added,
        proxyId,
        proxy: getProxyLabel(proxyId),
        lastCheck: newAccount.lastCheck
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Маршрут для создания объявления (синхронизация с Kleinanzeigen)
app.post("/api/ads/create", adUpload.array("images", 20), async (req, res) => {
  const uploadedFiles = req.files || [];
  const cleanupFiles = () => {
    uploadedFiles.forEach((file) => {
      fs.unlink(file.path, () => {});
    });
  };

  try {
    const {
      accountId,
      title,
      description,
      price,
      currency,
      postalCode,
      categoryId,
      categoryUrl
    } = req.body || {};

    if (!accountId) {
      res.status(400).json({ success: false, error: "Выберите аккаунт" });
      cleanupFiles();
      return;
    }

    if (!title || !description || !price) {
      res.status(400).json({ success: false, error: "Заполните обязательные поля объявления" });
      cleanupFiles();
      return;
    }

    const account = getAccountById(Number(accountId));
    if (!account) {
      res.status(404).json({ success: false, error: "Аккаунт не найден" });
      cleanupFiles();
      return;
    }

    const selectedProxy = account.proxyId
      ? proxies.find((item) => item.id === account.proxyId)
      : null;

    if (account.proxyId && !selectedProxy) {
      res.status(400).json({ success: false, error: "Прокси аккаунта не найден" });
      cleanupFiles();
      return;
    }

    const result = await publishAd({
      account,
      proxy: selectedProxy,
      ad: {
        title,
        description,
        price,
        currency,
        postalCode,
        categoryId,
        categoryUrl
      },
      imagePaths: uploadedFiles.map((file) => file.path)
    });

    if (result.success) {
      upsertAd({
        accountId: account.id,
        title,
        price,
        image: "",
        status: "Aktiv",
        createdAt: new Date().toISOString()
      });
    }

    cleanupFiles();
    res.json(result);
  } catch (error) {
    cleanupFiles();
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/proxies", async (req, res) => {
  try {
    const { name, type, host, port, username, password } = req.body || {};

    if (!name || !host || !port || !type) {
      res.status(400).json({ success: false, error: "Заполните обязательные поля" });
      return;
    }

    const proxyConfig = {
      type,
      host,
      port: Number(port),
      username: username || undefined,
      password: password || undefined
    };

    const checkResult = await proxyChecker.checkProxy(proxyConfig);
    if (!checkResult.success) {
      res.json({ success: false, error: checkResult.error, checkResult });
      return;
    }

    const newProxy = {
      id: Date.now(),
      name,
      ...proxyConfig,
      status: "active",
      lastChecked: new Date().toISOString(),
      checkResult
    };

    proxies.unshift(newProxy);

    res.json({
      success: true,
      proxy: newProxy,
      checkResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/proxies/:id/check", async (req, res) => {
  const proxyId = Number(req.params.id);
  const proxy = proxies.find((item) => item.id === proxyId);

  if (!proxy) {
    res.status(404).json({ success: false, error: "Прокси не найден" });
    return;
  }

  try {
    const checkResult = await proxyChecker.checkProxy(proxy);
    const status = checkResult.success ? "active" : "failed";

    proxy.status = status;
    proxy.lastChecked = new Date().toISOString();
    proxy.checkResult = checkResult;

    res.json({
      ...checkResult,
      proxyId: proxy.id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/proxies/check-all", async (req, res) => {
  try {
    const results = await proxyChecker.checkMultipleProxies(proxies);

    results.forEach((result) => {
      const proxy = proxies.find((item) => item.id === result.proxyId);
      if (proxy) {
        proxy.status = result.success ? "active" : "failed";
        proxy.lastChecked = new Date().toISOString();
        proxy.checkResult = result;
      }
    });

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/accounts/:id", (req, res) => {
  const accountId = Number(req.params.id);
  const deleted = deleteAccount(accountId);
  if (!deleted) {
    res.status(404).json({ success: false, error: "Аккаунт не найден" });
    return;
  }
  res.json({ success: true });
});

app.delete("/api/proxies/:id", (req, res) => {
  const proxyId = Number(req.params.id);
  const index = proxies.findIndex((proxy) => proxy.id === proxyId);

  if (index === -1) {
    res.status(404).json({ success: false, error: "Прокси не найден" });
    return;
  }

  proxies.splice(index, 1);
  res.json({ success: true });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Backend запущен на порту ${PORT}`);
  console.log(`🌍 Откройте http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`👥 Аккаунты: http://localhost:${PORT}/api/accounts`);
  console.log(`🔗 Прокси: http://localhost:${PORT}/api/proxies`);
});
