import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Config } from "../types";

interface Props {
  config: Config;
  onSave: (config: Config) => void;
  onClose: () => void;
}

export default function SettingsModal({ config, onSave, onClose }: Props) {
  const [serverUrl, setServerUrl] = useState(config.server_url);
  const [apiToken, setApiToken] = useState(config.api_token);
  const [sourceName, setSourceName] = useState(config.source_name);
  const [autoSync, setAutoSync] = useState(config.auto_sync_minutes);
  const [syncOnStartup, setSyncOnStartup] = useState(config.sync_on_startup ?? true);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(config.max_file_size_mb ?? 500);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [autostartMsg, setAutostartMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      await invoke("test_connection", { serverUrl, apiToken });
      setTestMsg({ ok: true, msg: "Connected" });
    } catch (e) {
      setTestMsg({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleEnableAutostart() {
    try {
      await invoke("setup_autostart");
      setAutostartMsg({ ok: true, msg: "Autostart enabled — app will launch on login" });
    } catch (e) {
      setAutostartMsg({ ok: false, msg: String(e) });
    }
  }

  async function handleSave() {
    setSaving(true);
    const updated: Config = {
      ...config,
      server_url: serverUrl,
      api_token: apiToken,
      source_name: sourceName,
      auto_sync_minutes: autoSync,
      sync_on_startup: syncOnStartup,
      max_file_size_mb: maxFileSizeMb,
    };
    try {
      await invoke("save_config", { config: updated });
      onSave(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Server URL</label>
            <input type="url" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">API Token</label>
            <div className="relative">
              <input type={showToken ? "text" : "password"} value={apiToken} onChange={(e) => setApiToken(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d={showToken ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" : "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} />
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Machine Name</label>
            <input type="text" value={sourceName} onChange={(e) => setSourceName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Auto-sync</label>
            <select value={autoSync} onChange={(e) => setAutoSync(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
              <option value={0}>Off</option>
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
            </select>
          </div>

          {/* Sync on startup toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-slate-300">Sync on startup</p>
              <p className="text-xs text-slate-500">Automatically sync when the app opens</p>
            </div>
            <button
              onClick={() => setSyncOnStartup(!syncOnStartup)}
              className={`w-10 h-5 rounded-full flex items-center transition-colors ${syncOnStartup ? "bg-blue-600" : "bg-slate-600"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${syncOnStartup ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Max file size */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Max file size <span className="text-slate-500 font-normal">(0 = no limit)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={maxFileSizeMb}
                onChange={(e) => setMaxFileSizeMb(Number(e.target.value))}
                className="w-28 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <span className="text-slate-400 text-sm">MB</span>
            </div>
          </div>

          {/* Autostart */}
          <div className="border-t border-slate-700 pt-4">
            <p className="text-sm font-medium text-slate-300 mb-1">Autostart with system</p>
            <p className="text-xs text-slate-500 mb-2">Install a desktop entry so the app launches on login (Linux)</p>
            <button
              onClick={handleEnableAutostart}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
            >
              Enable Autostart
            </button>
            {autostartMsg && (
              <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${autostartMsg.ok ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
                {autostartMsg.msg}
              </div>
            )}
          </div>

          {testMsg && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${testMsg.ok ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
              {testMsg.msg}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={handleTest} disabled={testing}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
            {testing ? "Testing…" : "Test"}
          </button>
          <button onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
