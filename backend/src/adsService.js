const fs = require("fs");
const os = require("os");
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const proxyChain = require("proxy-chain");
const { parseCookies, normalizeCookie, buildProxyServer, buildProxyUrl } = require("./cookieUtils");
const { pickDeviceProfile } = require("./cookieValidator");
const { listAds } = require("./adsStore");

puppeteer.use(StealthPlugin());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const humanPause = (min = 120, max = 240) => sleep(Math.floor(min + Math.random() * (max - min)));
const createTempProfileDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "kl-profile-"));

const getDeviceProfile = (account) => {
  if (!account?.deviceProfile) return pickDeviceProfile();
  try {
    return typeof account.deviceProfile === "string"
      ? JSON.parse(account.deviceProfile)
      : account.deviceProfile;
  } catch (error) {
    return pickDeviceProfile();
  }
};

const fetchAccountAds = async ({ account, proxy, accountLabel }) => {
  const deviceProfile = getDeviceProfile(account);
  const cookies = parseCookies(account.cookie).map(normalizeCookie);
  if (!cookies.length) return [];

  const proxyServer = buildProxyServer(proxy);
  const proxyUrl = buildProxyUrl(proxy);
  const needsProxyChain = Boolean(
    proxyUrl && ((proxy?.type || "").toLowerCase().startsWith("socks") || proxy?.username || proxy?.password)
  );
  let anonymizedProxyUrl;

  const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--lang=de-DE"];
  if (proxyServer) {
    if (needsProxyChain) {
      anonymizedProxyUrl = await proxyChain.anonymizeProxy(proxyUrl);
      launchArgs.push(`--proxy-server=${anonymizedProxyUrl}`);
    } else {
      launchArgs.push(`--proxy-server=${proxyServer}`);
    }
  }

  const profileDir = createTempProfileDir();
  const browser = await puppeteer.launch({
    headless: "new",
    args: launchArgs,
    userDataDir: profileDir
  });

  try {
    const page = await browser.newPage();
    if (!anonymizedProxyUrl && (proxy?.username || proxy?.password)) {
      await page.authenticate({
        username: proxy.username || "",
        password: proxy.password || ""
      });
    }

    await page.setUserAgent(deviceProfile.userAgent);
    await page.setViewport(deviceProfile.viewport);
    await page.setExtraHTTPHeaders({ "Accept-Language": deviceProfile.locale });
    await page.emulateTimezone(deviceProfile.timezone);
    await page.evaluateOnNewDocument((platform) => {
      Object.defineProperty(navigator, "platform", {
        get: () => platform
      });
    }, deviceProfile.platform);

    await page.goto("https://www.kleinanzeigen.de/", { waitUntil: "domcontentloaded" });
    await humanPause();
    await page.setCookie(...cookies);
    await humanPause();
    await page.goto("https://www.kleinanzeigen.de/m-meine-anzeigen.html", { waitUntil: "domcontentloaded" });
    await humanPause(180, 360);

    const ads = await page.evaluate(() => {
      const findMeineAnzeigenSection = () => {
        const heading = Array.from(document.querySelectorAll("h1, h2, h3"))
          .find((node) => /Meine Anzeigen/i.test(node.textContent || ""));
        if (!heading) return null;
        return heading.closest("section") || heading.parentElement;
      };

      const parsePrice = (node) => {
        if (!node) return "";
        return node.textContent.trim();
      };

      const section = findMeineAnzeigenSection();
      const scope = section || document;
      const links = Array.from(scope.querySelectorAll("a[href*='/s-anzeige/']"));
      const containers = links.map((link) => link.closest("article, li, div")).filter(Boolean);
      const uniqueContainers = Array.from(new Set(containers));

      return uniqueContainers.map((card) => {
        const titleEl = card.querySelector("h2, h3") || card.querySelector("a[href*='/s-anzeige/']");
        const priceEl =
          card.querySelector(".price") ||
          card.querySelector("[class*='price']") ||
          card.querySelector("[data-testid*='price']");
        const statusCandidates = Array.from(card.querySelectorAll("span, div"))
          .map((node) => node.textContent.trim())
          .filter(Boolean);
        const statusRaw = statusCandidates.find((text) => /reserviert|gelösch|deleted|entfernt/i.test(text)) || "";
        let status = "Aktiv";
        if (/reserviert/i.test(statusRaw)) {
          status = "Reserviert";
        }
        if (/gelösch|deleted|entfernt/i.test(statusRaw)) {
          status = "Gelöscht";
        }
        const imageEl =
          card.querySelector("img") ||
          card.querySelector("[style*='background-image']");
        let image = "";
        if (imageEl?.tagName?.toLowerCase() === "img") {
          image = imageEl.getAttribute("src") || "";
        } else if (imageEl) {
          const style = imageEl.getAttribute("style") || "";
          const match = style.match(/url\\([\"']?([^\"')]+)[\"']?\\)/);
          image = match ? match[1] : "";
        }
        const rawTitle = titleEl ? titleEl.textContent.trim() : "";
        const title = rawTitle.replace(/^(Reserviert|Gelösch[^\\s]*|Gelöscht)\\s*[•-]?\\s*/i, "").trim();
        return {
          title,
          price: parsePrice(priceEl),
          image,
          status
        };
      }).filter((item) => item.title && !/Meine Anzeigen|Profil von/i.test(item.title));
    });

    return ads.map((item) => ({
      ...item,
      accountId: account.id,
      accountLabel
    }));
  } catch (error) {
    return [];
  } finally {
    await browser.close();
    if (anonymizedProxyUrl) {
      await proxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
    }
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
};

const fetchActiveAds = async ({ accounts, proxies }) => {
  const storedAds = listAds();
  const results = [];
  for (const account of accounts) {
    if (!account.cookie) continue;
    const proxy = account.proxyId
      ? proxies.find((item) => item.id === account.proxyId)
      : null;
    const profileName = account.profileName || account.username || "Аккаунт";
    const profileEmail = account.profileEmail || "";
    const accountLabel = profileEmail ? `${profileName} (${profileEmail})` : profileName;
    const ads = await fetchAccountAds({ account, proxy, accountLabel });
    const storedForAccount = storedAds.filter((item) => item.accountId === account.id);
    const merged = [...ads];
    for (const stored of storedForAccount) {
      const match = ads.find((item) => item.title === stored.title && String(item.price || "") === String(stored.price || ""));
      if (match) {
        continue;
      }
      merged.push({
        title: stored.title,
        price: stored.price || "",
        image: stored.image || "",
        status: "Gelöscht",
        accountId: account.id,
        accountLabel
      });
    }
    results.push(...merged);
  }
  return results;
};

module.exports = {
  fetchActiveAds
};
