import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Config } from "../types";

interface Props {
  onConfigured: (config: Config) => void;
}

export default function SetupPage({ onConfigured }: Props) {
  const [serverUrl, setServerUrl] = useState("http://100.69.143.98:3005");
  const [apiToken, setApiToken] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<string>("get_hostname").then(setSourceName).catch(() => setSourceName("my-computer"));
  }, []);

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
    setSaving(true);
    const config: Config = {
      server_url: serverUrl,
      api_token: apiToken,
      source_name: sourceName,
      folders: [],
      excludes: ["node_modules", ".git", "__pycache__", "*.pyc", ".DS_Store", "target", "*.class"],
      auto_sync_minutes: 0,
      last_sync: null,
    };
    try {
      await invoke("save_config", { config });
      onConfigured(config);
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setSaving(false);
    }
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
              Create one in DataServer → Settings → API Tokens
            </p>
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

          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
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

          <div className="flex gap-3 pt-1">
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
      </div>
    </div>
  );
}
