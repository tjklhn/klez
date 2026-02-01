const fs = require("fs");
const os = require("os");
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const proxyChain = require("proxy-chain");
const { parseCookies, normalizeCookie, buildProxyServer, buildProxyUrl } = require("./cookieUtils");
const { pickDeviceProfile } = require("./cookieValidator");

puppeteer.use(StealthPlugin());

const CREATE_AD_URL = "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const humanPause = (min = 120, max = 280) => sleep(Math.floor(min + Math.random() * (max - min)));
const createTempProfileDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "kl-profile-"));

const toDeviceProfile = (rawProfile) => {
  if (!rawProfile) {
    return pickDeviceProfile();
  }
  if (typeof rawProfile === "string") {
    try {
      return JSON.parse(rawProfile);
    } catch (error) {
      return pickDeviceProfile();
    }
  }
  return rawProfile;
};

const setValue = async (context, selector, value) => {
  await context.evaluate(
    ({ selector, value }) => {
      const element = document.querySelector(selector);
      if (!element) return;
      element.focus();
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, value }
  );
};

const isBlankValue = (value) => value === undefined || value === null || value === "";

const setValueIfExists = async (context, selector, value) => {
  if (isBlankValue(value)) return false;
  const element = await context.$(selector);
  if (!element) return false;
  await setValue(context, selector, value);
  return true;
};

const scrollIntoView = async (element) => {
  if (!element) return;
  await element.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  });
};

const safeClick = async (element) => {
  if (!element) return false;
  try {
    await scrollIntoView(element);
    await element.click({ delay: 60 });
    return true;
  } catch (error) {
    try {
      await element.evaluate((node) => node.click());
      return true;
    } catch (innerError) {
      return false;
    }
  }
};

const fillField = async (context, selectors, value) => {
  if (isBlankValue(value)) return false;
  for (const selector of selectors) {
    let element = null;
    try {
      element = await context.waitForSelector(selector, { visible: true, timeout: 2000 });
    } catch (error) {
      element = await context.$(selector);
    }
    if (element) {
      await scrollIntoView(element);
      try {
        await element.click({ clickCount: 3, delay: 40 });
      } catch (error) {
        await element.evaluate((node) => node.click());
      }
      try {
        await element.type(String(value), { delay: 40 + Math.floor(Math.random() * 40) });
      } catch (error) {
        await setValue(context, selector, value);
      }
      await humanPause();
      return true;
    }
  }
  return false;
};

const fillByLabel = async (context, labelTexts, value) => {
  if (isBlankValue(value)) return false;
  for (const labelText of labelTexts) {
    const labels = await context.$$(`xpath//label[contains(normalize-space(.), "${labelText}")]`);
    if (!labels.length) continue;
    for (const label of labels) {
      const forId = await label.evaluate((node) => node.getAttribute("for"));
      if (forId) {
        const selector = `#${forId}`;
        const exists = await context.$(selector);
        if (exists) {
          await scrollIntoView(exists);
          await exists.click({ clickCount: 3, delay: 40 });
          await setValue(context, selector, value);
          return true;
        }
      }
      const input = await label.$("input, textarea");
      if (input) {
        const selector = await input.evaluate((node) => node.tagName.toLowerCase() + (node.id ? `#${node.id}` : ""));
        await scrollIntoView(input);
        try {
          await input.click({ clickCount: 3, delay: 40 });
        } catch (error) {
          await input.evaluate((node) => node.click());
        }
        if (selector) {
          try {
            await input.type(String(value), { delay: 40 + Math.floor(Math.random() * 40) });
          } catch (error) {
            await setValue(context, selector, value);
          }
        } else {
          await input.type(value);
        }
        await humanPause();
        return true;
      }
    }
  }
  return false;
};

const clickByText = async (page, texts) => {
  for (const text of texts) {
    const directMatches = await page.$$(`xpath//button[contains(normalize-space(.), "${text}")] | //a[contains(normalize-space(.), "${text}")]`);
    if (directMatches.length > 0) {
      if (await safeClick(directMatches[0])) {
        return true;
      }
    }

    const spanMatches = await page.$$(`xpath//span[contains(normalize-space(.), "${text}")]/ancestor::*[self::button or self::a][1]`);
    if (spanMatches.length > 0) {
      if (await safeClick(spanMatches[0])) {
        return true;
      }
    }
  }
  return false;
};

const clickSubmitButtonInContext = async (context) => {
  const primaryTexts = ["Anzeige aufgeben"];
  const fallbackTexts = [
    "Weiter",
    "Fortfahren",
    "Weiter zur Vorschau",
    "Weiter zur Veröffentlichung"
  ];

  const findVisibleClickable = async (text) => {
    const handle = await context.evaluateHandle((targetText) => {
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
      const target = normalize(targetText);
      const candidates = Array.from(
        document.querySelectorAll(
          'button, input[type="submit"], input[type="button"], [role="button"], a'
        )
      );
      const match = candidates.find((node) => {
        const label = normalize(
          node.innerText ||
            node.value ||
            node.getAttribute("aria-label") ||
            node.getAttribute("data-testid") ||
            node.getAttribute("data-test") ||
            node.getAttribute("title")
        );
        if (!label.includes(target)) return false;
        if (node.disabled) return false;
        if (node.getAttribute("aria-disabled") === "true") return false;
        if (node.classList.contains("disabled")) return false;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      return match || null;
    }, text);
    const element = handle.asElement();
    if (!element) {
      await handle.dispose();
      return null;
    }
    return element;
  };

  const clickWithTexts = async (texts) => {
    for (const text of texts) {
      const buttons = await context.$$(
        `xpath//button[contains(normalize-space(.), "${text}")] | //span[contains(normalize-space(.), "${text}")]/ancestor::button[1]`
      );
      for (const button of buttons) {
        await scrollIntoView(button);
        const isVisible = await button.evaluate((node) => {
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (!isVisible) {
          continue;
        }
        const isDisabled = await button.evaluate(
          (node) =>
            node.hasAttribute("disabled") ||
            node.getAttribute("aria-disabled") === "true" ||
            node.classList.contains("disabled")
        );
        if (isDisabled) {
          continue;
        }
        if (await safeClick(button)) {
          return true;
        }
      }
    }
    return false;
  };

  if (await clickWithTexts(primaryTexts)) {
    return true;
  }

  for (const text of primaryTexts) {
    const element = await findVisibleClickable(text);
    if (element) {
      await scrollIntoView(element);
      if (await safeClick(element)) {
        return true;
      }
    }
  }

  return await clickWithTexts(fallbackTexts);
};

const clickSubmitButton = async (page, contexts = []) => {
  const queue = [];
  const pushUnique = (ctx) => {
    if (!ctx || queue.includes(ctx)) return;
    queue.push(ctx);
  };
  contexts.forEach(pushUnique);
  pushUnique(page);
  page.frames().forEach(pushUnique);

  for (const context of queue) {
    if (await clickSubmitButtonInContext(context)) {
      return true;
    }
  }
  return false;
};

const waitForPublishState = async (page, timeout) => {
  try {
    const handle = await page.waitForFunction(
      () => {
        const bodyText = document.body?.innerText || "";
        const url = window.location.href;
        if (
          url.includes("p-anzeige-aufgeben-bestaetigung") ||
          url.includes("anzeige-aufgeben-bestaetigung") ||
          url.includes("anzeige-aufgeben-schritt3") ||
          url.includes("anzeige-aufgeben-schritt4") ||
          url.includes("anzeige-aufgeben-danke") ||
          url.includes("anzeige-aufgeben-abschliessen") ||
          url.includes("meine-anzeigen") ||
          bodyText.includes("Anzeige wird aufgegeben") ||
          bodyText.includes("Anzeige wurde erstellt") ||
          bodyText.includes("Anzeige ist online") ||
          bodyText.includes("Anzeige wurde erfolgreich") ||
          bodyText.includes("Anzeige wurde veröffentlicht") ||
          bodyText.includes("Vielen Dank") ||
          bodyText.includes("Danke")
        ) {
          return "success";
        }
        if (
          url.includes("vorschau") ||
          bodyText.includes("Vorschau") ||
          bodyText.includes("Vorschau der Anzeige")
        ) {
          return "preview";
        }
        const confirmationElement = document.querySelector(
          '[data-testid*="success"], [data-test*="success"], [data-testid*="confirmation"], [data-test*="confirmation"], [class*="success"], [class*="confirmation"]'
        );
        if (confirmationElement) {
          const text = (confirmationElement.textContent || "").trim();
          if (text) {
            return "success";
          }
        }
        if (url.includes("anzeige-aufgeben")) {
          return "form";
        }
        return false;
      },
      { timeout }
    );
    return await handle.jsonValue();
  } catch (error) {
    return null;
  }
};

const waitForPublishProgress = async (page, startUrl, timeout = 30000) => {
  try {
    await page.waitForFunction(
      (initialUrl) => {
        const url = window.location.href;
        if (url !== initialUrl) {
          return true;
        }
        const submitButtons = Array.from(
          document.querySelectorAll('button[type="submit"], input[type="submit"], button')
        ).filter((button) => {
          const text = button.innerText || button.value || "";
          return text.includes("Anzeige aufgeben");
        });
        if (!submitButtons.length) return true;
        return submitButtons.some((button) => {
          if (button.disabled) return true;
          if (button.getAttribute("aria-disabled") === "true") return true;
          if (button.classList.contains("disabled")) return true;
          const busy = button.getAttribute("aria-busy");
          return busy === "true";
        });
      },
      { timeout },
      startUrl
    );
    return true;
  } catch (error) {
    return false;
  }
};

const submitFormFallback = async (context) =>
  context.evaluate(() => {
    const form = document.querySelector("#adForm");
    if (!form) return false;
    form.submit();
    return true;
  });

const getPublishStateSnapshot = async (context) =>
  context.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const url = window.location.href;
    if (
      url.includes("p-anzeige-aufgeben-bestaetigung") ||
      url.includes("anzeige-aufgeben-bestaetigung") ||
      url.includes("anzeige-aufgeben-schritt3") ||
      url.includes("anzeige-aufgeben-schritt4") ||
      url.includes("anzeige-aufgeben-danke") ||
      url.includes("anzeige-aufgeben-abschliessen") ||
      url.includes("meine-anzeigen") ||
      bodyText.includes("Anzeige wird aufgegeben") ||
      bodyText.includes("Anzeige wurde erstellt") ||
      bodyText.includes("Anzeige ist online") ||
      bodyText.includes("Anzeige wurde erfolgreich") ||
      bodyText.includes("Anzeige wurde veröffentlicht") ||
      bodyText.includes("Vielen Dank") ||
      bodyText.includes("Danke")
    ) {
      return "success";
    }
    if (
      url.includes("vorschau") ||
      bodyText.includes("Vorschau") ||
      bodyText.includes("Vorschau der Anzeige")
    ) {
      return "preview";
    }
    const confirmationElement = document.querySelector(
      '[data-testid*="success"], [data-test*="success"], [data-testid*="confirmation"], [data-test*="confirmation"], [class*="success"], [class*="confirmation"]'
    );
    if (confirmationElement) {
      const text = (confirmationElement.textContent || "").trim();
      if (text) {
        return "success";
      }
    }
    if (url.includes("anzeige-aufgeben")) {
      return "form";
    }
    return null;
  });

const getPublishStateFromFrames = async (page) => {
  for (const frame of page.frames()) {
    try {
      const state = await getPublishStateSnapshot(frame);
      if (state) return state;
    } catch (error) {
      // ignore frame errors
    }
  }
  return null;
};

const inferPublishSuccess = async (page) =>
  page.evaluate(() => {
    const url = window.location.href;
    const bodyText = document.body?.innerText || "";
    const successHints = [
      "Anzeige wurde",
      "Anzeige ist online",
      "Vielen Dank",
      "Danke"
    ];

    const walkNodes = (root) => {
      const nodes = [];
      if (!root) return nodes;
      const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let current = treeWalker.currentNode;
      while (current) {
        nodes.push(current);
        const shadowRoot = current.shadowRoot;
        if (shadowRoot) {
          nodes.push(...walkNodes(shadowRoot));
        }
        current = treeWalker.nextNode();
      }
      return nodes;
    };

    const allNodes = walkNodes(document);
    const shadowText = allNodes
      .map((node) => node.textContent || "")
      .join(" ");
    const hasShadowSuccessText = successHints.some((hint) => shadowText.includes(hint));

    const hasAdLink = allNodes.some((node) => {
      if (!(node instanceof HTMLAnchorElement)) return false;
      const href = node.getAttribute("href") || "";
      return href.includes("/s-anzeige/") || href.includes("meine-anzeigen");
    });

    const hasSubmit = Array.from(
      document.querySelectorAll('button[type="submit"], input[type="submit"], button')
    ).some((button) => {
      const text = button.innerText || button.value || "";
      return text.includes("Anzeige aufgeben");
    });

    const hasSuccessText = successHints.some((hint) => bodyText.includes(hint));

    const isKnownForm = url.includes("anzeige-aufgeben");
    const isPreview = url.includes("vorschau");

    return {
      url,
      isKnownForm,
      isPreview,
      hasSubmit,
      hasSuccessText,
      hasShadowSuccessText,
      hasAdLink
    };
  });

const collectFormErrors = async (page) =>
  page.evaluate(() => {
    const selectors = [
      '[role="alert"]',
      '[data-testid*="error"]',
      '.error',
      '.error-message',
      '.form-error',
      '.validation-error'
    ];
    const nodes = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
    );
    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
    const texts = nodes
      .map((node) => normalize(node.textContent))
      .filter((text) => text.length > 0);
    const unique = Array.from(new Set(texts));
    return unique.slice(0, 6);
  });

const getAdFormContext = async (page, timeout = 20000) => {
  const candidateSelectors = [
    'input[name="title"]',
    'input[name="adTitle"]',
    'textarea[name="description"]',
    'textarea[name="adDescription"]',
    'input[name="price"]',
    'input[name="priceAmount"]',
    'input[id="micro-frontend-price"]'
  ];
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    for (const frame of page.frames()) {
      try {
        for (const selector of candidateSelectors) {
          const handle = await frame.$(selector);
          if (handle) {
            return frame;
          }
        }
      } catch (error) {
        // ignore frame lookup errors
      }
    }
    for (const selector of candidateSelectors) {
      const handle = await page.$(selector);
      if (handle) {
        return page;
      }
    }
    await sleep(400);
  }
  return null;
};

const fillMissingRequiredFields = async (context) =>
  context.evaluate(() => {
    const isVisible = (node) => {
      if (!node) return false;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const getLabel = (node) => {
      if (!node) return "";
      const aria = node.getAttribute("aria-label");
      if (aria) return aria.trim();
      if (node.id) {
        const label = document.querySelector(`label[for="${node.id}"]`);
        if (label) return (label.textContent || "").trim();
      }
      const parentLabel = node.closest("label");
      if (parentLabel) return (parentLabel.textContent || "").trim();
      return node.name || node.id || node.getAttribute("placeholder") || "";
    };

    const filled = [];

    const requiredSelects = Array.from(document.querySelectorAll("select[required], select[aria-required='true']"));
    requiredSelects.forEach((select) => {
      if (!isVisible(select)) return;
      if (select.value) return;
      const option = Array.from(select.options).find(
        (opt) => opt.value && !opt.disabled
      );
      if (!option) return;
      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      filled.push(getLabel(select));
    });

    const requiredCheckboxes = Array.from(
      document.querySelectorAll("input[type='checkbox'][required], input[type='checkbox'][aria-required='true']")
    );
    requiredCheckboxes.forEach((checkbox) => {
      if (!isVisible(checkbox)) return;
      if (checkbox.checked) return;
      checkbox.click();
      filled.push(getLabel(checkbox));
    });

    const radioGroups = new Map();
    const radios = Array.from(document.querySelectorAll("input[type='radio']"));
    radios.forEach((radio) => {
      if (!radio.name) return;
      const required = radio.required || radio.getAttribute("aria-required") === "true";
      if (!required) return;
      if (!radioGroups.has(radio.name)) {
        radioGroups.set(radio.name, []);
      }
      radioGroups.get(radio.name).push(radio);
    });
    radioGroups.forEach((group) => {
      const visibleGroup = group.filter(isVisible);
      if (!visibleGroup.length) return;
      const checked = visibleGroup.some((radio) => radio.checked);
      if (checked) return;
      const candidate = visibleGroup.find((radio) => !radio.disabled);
      if (!candidate) return;
      candidate.click();
      filled.push(getLabel(candidate));
    });

    return filled.filter((label) => label.length > 0);
  });

const clickCategoryWeiter = async (page) => {
  await page.waitForSelector("body", { timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  const clicked = await clickByText(page, ["Weiter"]);
  if (!clicked) return false;
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }),
      page.waitForFunction(
        () => window.location.href.includes("anzeige-aufgeben-schritt2"),
        { timeout: 20000 }
      )
    ]);
  } catch (error) {
    // continue even if we cannot confirm navigation
  }
  return true;
};

const openCategorySelection = async (page) => {
  const selectors = [
    "#pstad-lnk-chngeCtgry",
    "#categorySection a",
    "a[href*='p-kategorie-aendern']"
  ];
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (!element) continue;
    if (await safeClick(element)) {
      try {
        await Promise.race([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }),
          page.waitForFunction(
            () => window.location.href.includes("p-kategorie-aendern"),
            { timeout: 15000 }
          )
        ]);
      } catch (error) {
        // continue even if navigation cannot be confirmed
      }
      return true;
    }
  }
  return clickByText(page, ["Wähle deine Kategorie", "Kategorie wählen"]);
};

const ensureRequiredFields = async (context) =>
  context.evaluate(() => {
    const getValue = (selectors) => {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (!node) continue;
        const rawValue = node.value ?? node.getAttribute("value") ?? "";
        const value = String(rawValue).trim();
        if (value) return value;
      }
      return "";
    };

    const getValueByLabel = (labels) => {
      const labelNodes = Array.from(document.querySelectorAll("label"));
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
      for (const labelText of labels) {
        const label = labelNodes.find((node) =>
          normalize(node.textContent).includes(labelText)
        );
        if (!label) continue;
        const forId = label.getAttribute("for");
        if (forId) {
          const target = document.getElementById(forId);
          if (target && "value" in target) {
            const value = (target.value || "").trim();
            if (value) return value;
          }
        }
        const input = label.querySelector("input, textarea, select");
        if (input && "value" in input) {
          const value = (input.value || "").trim();
          if (value) return value;
        }
      }
      return "";
    };

    const title = getValue([
      'input[name="title"]',
      'input[name="adTitle"]',
      'input[id*="title"]',
      'input[id*="adTitle"]',
      'input[placeholder*="Titel"]',
      'input[aria-label*="Titel"]',
      'input[data-testid*="title"]'
    ]) || getValueByLabel(["Titel", "Title"]);
    const description = getValue([
      'textarea[name="description"]',
      'textarea[name="adDescription"]',
      'textarea[id*="description"]',
      'textarea[id*="adDescription"]',
      'textarea[placeholder*="Beschreibung"]',
      'textarea[aria-label*="Beschreibung"]',
      'textarea[data-testid*="description"]'
    ]) || getValueByLabel(["Beschreibung", "Description"]);
    const price = getValue([
      'input[name="price"]',
      'input[name="priceAmount"]',
      'input[name="priceInCents"]',
      'input[id*="priceAmount"]',
      'input[id="micro-frontend-price"]',
      'input[id*="price"]',
      'input[placeholder*="Preis"]',
      'input[aria-label*="Preis"]',
      'input[data-testid*="price"]'
    ]) || getValueByLabel(["Preis", "Price"]);
    const category = getValue([
      'input[name="categoryId"]',
      'select[name="categoryId"]',
      'input[id*="category"]',
      'select[id*="category"]',
      'input[data-testid*="category"]',
      'select[data-testid*="category"]'
    ]) || getValueByLabel(["Kategorie", "Category"]);

    const categorySummary = Array.from(
      document.querySelectorAll(
        '[data-testid*="category"], [data-test*="category"], [class*="category"], a[href*="kategorie-aendern"]'
      )
    )
      .map((node) => (node.textContent || "").trim())
      .find((text) => text.length > 0);

    return {
      titleFilled: Boolean(title),
      descriptionFilled: Boolean(description),
      priceFilled: Boolean(price),
      categorySelected: Boolean(category) || Boolean(categorySummary)
    };
  });

const mergeRequiredStates = (primary, secondary) => ({
  titleFilled: Boolean(primary?.titleFilled || secondary?.titleFilled),
  descriptionFilled: Boolean(primary?.descriptionFilled || secondary?.descriptionFilled),
  priceFilled: Boolean(primary?.priceFilled || secondary?.priceFilled),
  categorySelected: Boolean(primary?.categorySelected || secondary?.categorySelected)
});

const getPriceValue = async (context) =>
  context.evaluate(() => {
    const selectors = [
      'input[name="price"]',
      'input[name="priceAmount"]',
      'input[name="priceInCents"]',
      'input[id*="priceAmount"]',
      'input[id="micro-frontend-price"]',
      'input[id*="price"]',
      'input[placeholder*="Preis"]',
      'input[aria-label*="Preis"]',
      'input[data-testid*="price"]'
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const rawValue = node.value ?? node.getAttribute("value") ?? "";
      const value = String(rawValue).trim();
      if (value) return value;
    }
    return "";
  });

const fillPriceField = async (context, value) => {
  if (isBlankValue(value)) return false;
  const selectors = [
    'input[name="price"]',
    'input[name="priceAmount"]',
    'input[name="priceInCents"]',
    'input[id*="priceAmount"]',
    'input[id="micro-frontend-price"]',
    'input[id*="price"]',
    'input[placeholder*="Preis"]',
    'input[aria-label*="Preis"]',
    'input[data-testid*="price"]'
  ];
  for (const selector of selectors) {
    let element = null;
    try {
      element = await context.waitForSelector(selector, { visible: true, timeout: 2000 });
    } catch (error) {
      element = await context.$(selector);
    }
    if (!element) continue;
    await scrollIntoView(element);
    try {
      await element.click({ clickCount: 3, delay: 40 });
    } catch (error) {
      await element.evaluate((node) => node.click());
    }
    try {
      await element.type(String(value), { delay: 40 + Math.floor(Math.random() * 40) });
    } catch (error) {
      await setValue(context, selector, value);
    }
    await element.evaluate((node) => node.blur());
    await humanPause(80, 160);
    const currentValue = await getPriceValue(context);
    if (currentValue) {
      return true;
    }
  }
  return false;
};

const selectOption = async (context, selectors, value) => {
  if (isBlankValue(value)) return false;
  for (const selector of selectors) {
    const element = await context.$(selector);
    if (element) {
      await context.select(selector, value);
      return true;
    }
  }
  return false;
};

const directBuyContainerSelectors = [
  "[data-testid*='direct-buy']",
  "[data-testid*='direkt']",
  "[data-testid*='direct']",
  "[class*='direct-buy']",
  "[class*='direkt']"
];

const getDirectBuyRoot = async (context) => {
  const selectors = [
    ...directBuyContainerSelectors,
    "form",
    "section",
    "[data-testid*='form']",
    "[data-testid*='post-ad']",
    "[data-testid*='postad']",
    "[class*='post-ad']",
    "[class*='postad']"
  ];
  for (const selector of selectors) {
    try {
      const handle = await context.$(selector);
      if (handle) return handle;
    } catch (error) {
      // ignore
    }
  }
  return null;
};

const selectDirectBuyNo = async (context, { retries = 3 } = {}) => {
  const clickIfPossible = async (handle) => {
    if (!handle) return false;
    try {
      await handle.click({ delay: 20 });
      return true;
    } catch (error) {
      return false;
    }
  };

  const selectorCandidates = [
    ...directBuyContainerSelectors.map((selector) => `${selector} input[type='radio']`),
    ...directBuyContainerSelectors.map((selector) => `${selector} input[type='checkbox']`),
    ...directBuyContainerSelectors.map((selector) => `${selector} [role='radio']`),
    "input[type='radio'][aria-label*='Direkt kaufen']",
    "input[type='checkbox'][aria-label*='Direkt kaufen']",
    "[role='radio'][aria-label*='Direkt kaufen']"
  ];

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    console.log(`[publishAd] Direkt kaufen opt-out attempt ${attempt}/${retries}`);
    try {
      const scopedRoot = await getDirectBuyRoot(context);
      if (scopedRoot) {
        console.log("[publishAd] Direkt kaufen search scoped to form container");
      }
      const searchContext = scopedRoot || context;

      const selectorStart = Date.now();
      try {
        await searchContext.waitForSelector(selectorCandidates.join(", "), { timeout: 4000 });
        console.log(`[publishAd] Direkt kaufen selector wait ${Date.now() - selectorStart}ms`);
      } catch (waitError) {
        console.log(`[publishAd] Direkt kaufen block not detected yet (${Date.now() - selectorStart}ms)`);
      }

      const selectorMatches = await searchContext.$$(selectorCandidates.join(", "));
      for (const handle of selectorMatches) {
        const clicked = await clickIfPossible(handle);
        if (clicked) return true;
      }
    } catch (error) {
      console.log(`[publishAd] Direkt kaufen opt-out attempt failed: ${error.message}`);
    }
    await humanPause(200, 400);
  }

  console.log("[publishAd] Direkt kaufen opt-out not applied");
  return false;
};

const uploadImages = async (page, imagePaths) => {
  if (!imagePaths || imagePaths.length === 0) return false;
  const input = await page.$('input[type="file"]');
  if (!input) {
    return false;
  }
  await input.uploadFile(...imagePaths);
  return true;
};

const publishAd = async ({ account, proxy, ad, imagePaths }) => {
  const deviceProfile = toDeviceProfile(account.deviceProfile);
  const cookies = parseCookies(account.cookie).map(normalizeCookie);

  if (!cookies.length) {
    return { success: false, error: "Cookie файл пустой" };
  }

  const attemptPublish = async ({ useProxy }) => {
    const proxyServer = useProxy ? buildProxyServer(proxy) : null;
    const proxyUrl = useProxy ? buildProxyUrl(proxy) : null;
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
    const defaultTimeout = 600000;
    const protocolTimeout = 600000;
    const browser = await puppeteer.launch({
      headless: "new",
      args: launchArgs,
      userDataDir: profileDir,
      protocolTimeout
    });

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(defaultTimeout);
      page.setDefaultNavigationTimeout(defaultTimeout);
      if (useProxy && !anonymizedProxyUrl && (proxy?.username || proxy?.password)) {
        await page.authenticate({
          username: proxy.username || "",
          password: proxy.password || ""
        });
      }

      await page.setUserAgent(deviceProfile.userAgent);
      await page.setViewport(deviceProfile.viewport);
      await page.setExtraHTTPHeaders({
        "Accept-Language": deviceProfile.locale
      });
      await page.emulateTimezone(deviceProfile.timezone);
      await page.evaluateOnNewDocument((platform) => {
        Object.defineProperty(navigator, "platform", {
          get: () => platform
        });
      }, deviceProfile.platform);
      const context = browser.defaultBrowserContext();
      await context.overridePermissions("https://www.kleinanzeigen.de", ["geolocation"]);
      if (deviceProfile.geolocation) {
        await page.setGeolocation(deviceProfile.geolocation);
      }

      const gotoHomeStart = Date.now();
      await page.goto("https://www.kleinanzeigen.de/", { waitUntil: "domcontentloaded" });
      console.log(`[publishAd] goto homepage in ${Date.now() - gotoHomeStart}ms`);
      await humanPause(200, 480);
      await page.setCookie(...cookies);
      await humanPause(120, 260);

      const gotoCreateStart = Date.now();
      await page.goto(CREATE_AD_URL, { waitUntil: "domcontentloaded" });
      console.log(`[publishAd] goto create page in ${Date.now() - gotoCreateStart}ms`);
      await humanPause(200, 500);

      const currentUrl = page.url();
      if (currentUrl.includes("m-einloggen")) {
        return {
          success: false,
          error: "Kleinanzeigen перенаправил на страницу логина. Проверьте актуальность cookies.",
          url: currentUrl
        };
      }

      const formContext = await getAdFormContext(page);
      if (!formContext) {
        return {
          success: false,
          error: "Не удалось найти форму создания объявления на странице.",
          url: page.url()
        };
      }

      if (ad.categoryUrl) {
        await openCategorySelection(page);
        await humanPause(200, 400);
        await page.goto(ad.categoryUrl, { waitUntil: "domcontentloaded" });
        await humanPause(200, 400);
        await clickCategoryWeiter(page);
        await humanPause(200, 400);
      } else if (ad.categoryId) {
        const categorySet = await setValueIfExists(formContext, "#categoryIdField", ad.categoryId);
        if (categorySet) {
          await humanPause(120, 220);
        }
      }

      const titleFilled = await fillField(formContext, [
        'input[name="title"]',
        'input[name="adTitle"]',
        'input[id*="title"]',
        'input[placeholder*="Titel"]',
        'input[placeholder*="Title"]',
        'input[aria-label*="Titel"]',
        'input[aria-label*="Title"]',
        'input[data-testid*="title"]'
      ], ad.title);

      const descriptionFilled = await fillField(formContext, [
        'textarea[name="description"]',
        'textarea[name="adDescription"]',
        'textarea[id*="description"]',
        'textarea[placeholder*="Beschreibung"]',
        'textarea[placeholder*="Description"]',
        'textarea[aria-label*="Beschreibung"]',
        'textarea[aria-label*="Description"]',
        'textarea[data-testid*="description"]'
      ], ad.description);

      const titleFallback = titleFilled ? true : await fillByLabel(formContext, ["Titel", "Title"], ad.title);
      const descriptionFallback = descriptionFilled
        ? true
        : await fillByLabel(formContext, ["Beschreibung", "Description"], ad.description);

      await humanPause(120, 240);
      const priceFilled = await fillPriceField(formContext, ad.price);
      let priceFallback = priceFilled ? true : await fillByLabel(formContext, ["Preis", "Price"], ad.price);
      if (!priceFallback && ad.price) {
        const microFrontendFilled = await setValueIfExists(formContext, "#micro-frontend-price", ad.price);
        if (microFrontendFilled) {
          await humanPause(80, 160);
          priceFallback = true;
        }
      }
      if (priceFallback && ad.price) {
        const priceValue = await getPriceValue(formContext);
        if (!priceValue) {
          const microFrontendFilled = await setValueIfExists(formContext, "#micro-frontend-price", ad.price);
          if (microFrontendFilled) {
            await humanPause(80, 160);
          }
        }
      }

      await humanPause(120, 240);
      const postalFilled = await fillField(formContext, [
        'input[name="zipcode"]',
        'input[name="plz"]',
        'input[name*="zip"]',
        'input[id*="zip"]',
        'input[id*="plz"]',
        'input[placeholder*="PLZ"]',
        'input[placeholder*="Postleitzahl"]',
        'input[aria-label*="PLZ"]',
        'input[aria-label*="Postleitzahl"]',
        'input[data-testid*="zip"]'
      ], ad.postalCode);
      const postalFallback = postalFilled ? true : await fillByLabel(formContext, ["PLZ", "Postleitzahl"], ad.postalCode);

      await selectOption(formContext, [
        'select[name="categoryId"]',
        'select[id*="category"]'
      ], ad.categoryId);

      const autoFilledRequired = await fillMissingRequiredFields(formContext);
      if (autoFilledRequired.length) {
        await humanPause(120, 220);
      }

      let requiredState = await ensureRequiredFields(formContext);
      if (formContext !== page) {
        const pageRequiredState = await ensureRequiredFields(page);
        requiredState = mergeRequiredStates(requiredState, pageRequiredState);
      }

      const missingFields = [];
      if (!titleFallback || !requiredState.titleFilled) missingFields.push("Titel");
      if (!descriptionFallback || !requiredState.descriptionFilled) missingFields.push("Beschreibung");
      if (!priceFallback || !requiredState.priceFilled) missingFields.push("Preis");
      if (!requiredState.categorySelected) missingFields.push("Kategorie");
      if (!postalFallback && ad.postalCode) missingFields.push("PLZ");
      if (missingFields.length > 0) {
        const autoDetails = autoFilledRequired.length
          ? ` (автозаполнение: ${autoFilledRequired.join(", ")})`
          : "";
        return {
          success: false,
          error: `Не удалось заполнить обязательные поля объявления: ${missingFields.join(", ")}${autoDetails}`
        };
      }

      await humanPause(300, 500);
      const directBuyContainerSelector = directBuyContainerSelectors.join(", ");
      const directBuyWaitStart = Date.now();
      try {
        await page.waitForSelector(directBuyContainerSelector, { timeout: 5000 });
        console.log(`[publishAd] Direkt kaufen container detected in ${Date.now() - directBuyWaitStart}ms`);
      } catch (error) {
        console.log(`[publishAd] Direkt kaufen container not detected (${Date.now() - directBuyWaitStart}ms)`);
      }

      console.log("[publishAd] Rebinding form context before Direkt kaufen selection");
      let contextForDirectBuy = formContext;
      try {
        const directBuyContext = await getAdFormContext(page);
        if (directBuyContext) {
          contextForDirectBuy = directBuyContext;
        }
      } catch (error) {
        console.log(`[publishAd] Failed to rebind form context: ${error.message}`);
      }

      let directBuySelected = false;
      try {
        directBuySelected = await selectDirectBuyNo(contextForDirectBuy);
      } catch (error) {
        console.log(`[publishAd] Direkt kaufen selection failed in context: ${error.message}`);
      }
      if (!directBuySelected) {
        console.log("[publishAd] Retrying Direkt kaufen selection on page context");
        directBuySelected = await selectDirectBuyNo(page);
      }
      if (directBuySelected) {
        await humanPause(120, 220);
      }

      await uploadImages(page, imagePaths);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(500);
      const waitForSubmitEnabled = async (context) => {
        try {
          await context.waitForFunction(
            () => {
              const candidates = Array.from(
                document.querySelectorAll('button[type="submit"], input[type="submit"], button')
              );
              return candidates.some((button) => {
                const text = button.innerText || button.value || "";
                if (!text.includes("Anzeige aufgeben")) return false;
                if (button.disabled) return false;
                if (button.getAttribute("aria-disabled") === "true") return false;
                return true;
              });
            },
            { timeout: 15000 }
          );
          return true;
        } catch (error) {
          return false;
        }
      };
      const submitReady = await waitForSubmitEnabled(formContext);
      if (!submitReady && formContext !== page) {
        await waitForSubmitEnabled(page);
      }
      await sleep(1000);
      const initialUrl = page.url();
      const submitClicked = await clickSubmitButton(page, [formContext]);

      if (!submitClicked) {
        return {
          success: false,
          error: "Не удалось найти кнопку публикации на Kleinanzeigen"
        };
      }

      let publishState = await waitForPublishState(page, defaultTimeout);
      if (publishState === "preview") {
        await sleep(800);
        await clickSubmitButton(page, [formContext]);
        publishState = await waitForPublishState(page, defaultTimeout);
      }
      if (publishState !== "success") {
        const fallbackSubmitted = await submitFormFallback(formContext);
        if (fallbackSubmitted) {
          await waitForPublishProgress(page, initialUrl, 30000);
          publishState = await waitForPublishState(page, defaultTimeout);
        }
      }
      if (publishState !== "success") {
        const frameState = await getPublishStateFromFrames(page);
        if (frameState) {
          publishState = frameState;
        }
      }

      if (publishState !== "success") {
        const progressDetected = await waitForPublishProgress(page, initialUrl, 30000);
        const errors = await collectFormErrors(page);
        const errorDetails = errors.length ? `: ${errors.join("; ")}` : "";
        const stateDetails = publishState === "form" ? " (страница осталась на форме)" : "";
        const inferred = await inferPublishSuccess(page);
        const canTreatAsSuccess = !errors.length &&
          !inferred.isKnownForm &&
          !inferred.isPreview &&
          (!inferred.hasSubmit ||
            inferred.hasSuccessText ||
            inferred.hasShadowSuccessText ||
            inferred.hasAdLink ||
            progressDetected);
        if (canTreatAsSuccess) {
          return {
            success: true,
            message: "Объявление отправлено на публикацию",
            url: inferred.url
          };
        }
        return {
          success: false,
          error: `Публикация не подтверждена${stateDetails}${errorDetails}`,
          url: page.url()
        };
      }

      return {
        success: true,
        message: "Объявление отправлено на публикацию",
        url: page.url()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      await browser.close();
      if (anonymizedProxyUrl) {
        await proxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
      }
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  };

  const primaryResult = await attemptPublish({ useProxy: true });
  if (!primaryResult.success && /ERR_TUNNEL_CONNECTION_FAILED/i.test(primaryResult.error || "")) {
    return await attemptPublish({ useProxy: false });
  }
  return primaryResult;
};

module.exports = {
  publishAd
};
