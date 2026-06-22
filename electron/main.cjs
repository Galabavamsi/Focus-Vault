const { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const isDev = process.env.FOCUSVAULT_DEV === "1";
const DIST_DIR = path.join(__dirname, "..", "dist");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "focusvault",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function registerLocalProtocol() {
  protocol.handle("focusvault", (request) => {
    const url = new URL(request.url);
    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(DIST_DIR, normalizedPath);

    if (!filePath.startsWith(DIST_DIR)) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "FocusVault",
    backgroundColor: "#08110f",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "public", "app-icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    window.loadURL("http://127.0.0.1:5173");
  } else {
    window.loadURL("focusvault://app/index.html");
  }
}

function providerSettingsPath() {
  return path.join(app.getPath("userData"), "ai-provider-settings.json");
}

function readProviderSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(providerSettingsPath(), "utf8"));
    const apiKey = raw.encryptedApiKey
      ? safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(raw.encryptedApiKey, "base64"))
        : Buffer.from(raw.encryptedApiKey, "base64").toString("utf8")
      : "";
    return { ...raw, apiKey };
  } catch {
    return {
      provider: "deepseek",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "",
    };
  }
}

function publicProviderSettings() {
  const settings = readProviderSettings();
  return {
    provider: settings.provider,
    name: settings.name,
    baseUrl: settings.baseUrl,
    model: settings.model,
    hasApiKey: Boolean(settings.apiKey),
  };
}

function saveProviderSettings(settings) {
  const apiKey = String(settings.apiKey || "");
  const encryptedApiKey = apiKey
    ? safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(apiKey).toString("base64")
      : Buffer.from(apiKey, "utf8").toString("base64")
    : "";

  const payload = {
    provider: settings.provider || "deepseek",
    name: settings.name || "DeepSeek",
    baseUrl: settings.baseUrl || "https://api.deepseek.com",
    model: settings.model || "deepseek-chat",
    encryptedApiKey,
  };

  fs.mkdirSync(path.dirname(providerSettingsPath()), { recursive: true });
  fs.writeFileSync(providerSettingsPath(), JSON.stringify(payload, null, 2));
  return publicProviderSettings();
}

function registerAiIpc() {
  ipcMain.handle("ai:get-settings", () => publicProviderSettings());
  ipcMain.handle("ai:save-settings", (_event, settings) => saveProviderSettings(settings));
  ipcMain.handle("ai:chat", async (_event, payload) => callOpenAiCompatible(payload));
}

async function callOpenAiCompatible(payload) {
  const settings = readProviderSettings();
  if (!settings.apiKey) {
    throw new Error("Add an API key in AI settings first.");
  }

  if (!["deepseek", "openai", "custom"].includes(settings.provider)) {
    throw new Error("This provider slot is saved, but chat calls currently support DeepSeek/OpenAI-compatible APIs.");
  }

  const baseUrl = String(settings.baseUrl || "").replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: payload.messages,
      temperature: payload.temperature ?? 0.2,
      response_format: payload.responseFormat,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI request failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const json = await response.json();
  return {
    content: json.choices?.[0]?.message?.content || "",
    raw: json,
  };
}

app.whenReady().then(() => {
  app.setAppUserModelId("FocusVault.Personal");
  registerLocalProtocol();
  registerAiIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
