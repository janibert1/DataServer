import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Config } from "../types";

interface Props {
  onConfigured: (config: Config) => void;
}

type BrowserAuthStatus = "idle" | "waiting" | "error";

const DEVICE_AUTH_TIMEOUT_MS = 10 * 60 * 1000; // matches backend device-code TTL (10 min)

function randomDeviceCode(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function SetupPage({ onConfigured }: Props) {
  const [serverUrl, setServerUrl] = useState("http://100.69.143.98:3005");
  const [apiToken, setApiToken] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [browserAuth, setBrowserAuth] = useState<{ status: BrowserAuthStatus; msg?: string }>({ status: "idle" });
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    invoke<string>("get_hostname").then(setSourceName).catch(() => setSourceName("my-computer"));
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, []);

  async function saveAndContinue(token: string, name: string) {
    setSaving(true);
    const config: Config = {
      server_url: serverUrl,
      api_token: token,
      source_name: name,
      folders: [],
      excludes: [],
      auto_sync_minutes: 0,
      last_sync: null,
      sync_on_startup: true,
      max_file_size_mb: 500,
      smart_excludes: ["package_caches", "build_artifacts", "caches_temp"],
    };
    try {
      await invoke("save_config", { config });
      // Silently set up autostart
      invoke("setup_autostart").catch(() => {});
      onConfigured(config);
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await invoke("test_connection", { serverUrl, apiToken });
      setTestResult({ ok: true, msg: "Connected successfully" });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleGetStarted() {
    if (!serverUrl || !apiToken || !sourceName) return;
    await saveAndContinue(apiToken, sourceName);
  }

  async function handleBrowserSignIn() {
    const trimmedUrl = serverUrl.trim().replace(/\/$/, "");
    if (!trimmedUrl) {
      setBrowserAuth({ status: "error", msg: "Enter a server URL first." });
      return;
    }
    if (pollRef.current !== null) window.clearInterval(pollRef.current);

    const code = randomDeviceCode();
    setBrowserAuth({ status: "waiting" });

    try {
      await openUrl(`${trimmedUrl}/device-auth?code=${code}`);
    } catch (e) {
      setBrowserAuth({ status: "error", msg: `Could not open browser: ${String(e)}` });
      return;
    }

    const startedAt = Date.now();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - startedAt > DEVICE_AUTH_TIMEOUT_MS) {
        if (pollRef.current !== null) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setBrowserAuth({ status: "error", msg: "Timed out waiting for approval. Try again." });
        return;
      }
      try {
        const result = await invoke<{ status: string; token?: string }>("poll_device_auth", {
          serverUrl: trimmedUrl,
          code,
        });
        if (result.status === "complete" && result.token) {
          if (pollRef.current !== null) window.clearInterval(pollRef.current);
          pollRef.current = null;
          const token = result.token;
          setApiToken(token);
          setBrowserAuth({ status: "idle" });
          await saveAndContinue(token, sourceName || "my-computer");
        }
        // "pending" — keep polling silently
      } catch {
        // Transient network hiccup while polling; keep trying until timeout.
      }
    }, 2500);
  }

  const canStart = serverUrl.trim() && apiToken.trim() && sourceName.trim();

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">DataServer Backup</h1>
          <p className="text-slate-400 mt-1">Connect to your DataServer instance</p>
        </div>

        {/* Form */}
        <div className="bg-slate-800 rounded-2xl p-6 space-y-4 border border-slate-700">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Server URL</label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://100.69.143.98:3005"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">This machine's name</label>
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="jan-fedora"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Primary: browser sign-in */}
          <div>
            <button
              onClick={handleBrowserSignIn}
              disabled={browserAuth.status === "waiting" || saving || !serverUrl.trim()}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {browserAuth.status === "waiting" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Waiting for approval in browser…
                </>
              ) : (
                "Sign in with Browser"
              )}
            </button>
            {browserAuth.status === "waiting" && (
              <p className="mt-2 text-xs text-slate-400">
                Approve this device in the browser window that just opened, then come back here.
              </p>
            )}
            {browserAuth.status === "error" && (
              <p className="mt-2 text-xs text-red-400">{browserAuth.msg}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">or</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {!showManual ? (
            <button
              onClick={() => setShowManual(true)}
              className="w-full text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Paste an API token manually
            </button>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">API Token</label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="ds_..."
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 pr-10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showToken ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Create one in DataServer → Security → API Tokens
              </p>

              {testResult && (
                <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  testResult.ok ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"
                }`}>
                  {testResult.ok ? (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {testResult.msg}
                </div>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  onClick={handleTest}
                  disabled={testing || !serverUrl || !apiToken}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                >
                  {testing ? "Testing…" : "Test Connection"}
                </button>
                <button
                  onClick={handleGetStarted}
                  disabled={!canStart || saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                >
                  {saving ? "Saving…" : "Get Started →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
