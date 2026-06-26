import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Config, SyncProgress, SyncResult, SyncState } from "../types";
import FolderRow from "../components/FolderRow";
import SyncLog from "../components/SyncLog";
import SettingsModal from "../components/SettingsModal";
import SmartFilters from "../components/SmartFilters";

interface Props {
  config: Config;
  onConfigChange: (config: Config) => void;
}

export default function MainPage({ config, onConfigChange }: Props) {
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterTab, setFilterTab] = useState<"smart" | "custom">("smart");
  const [newExclude, setNewExclude] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const autoSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupSyncDone = useRef(false);

  useEffect(() => {
    invoke("test_connection", { serverUrl: config.server_url, apiToken: config.api_token })
      .then(() => setConnected(true))
      .catch(() => setConnected(false));

    // Sync on startup (once, after a short delay)
    if (config.sync_on_startup && !startupSyncDone.current) {
      startupSyncDone.current = true;
      const t = setTimeout(() => handleSync(), 2000);
      return () => clearTimeout(t);
    }
  }, [config.server_url, config.api_token]);

  // Auto-sync interval
  useEffect(() => {
    if (autoSyncRef.current) clearInterval(autoSyncRef.current);
    if (config.auto_sync_minutes > 0) {
      autoSyncRef.current = setInterval(handleSync, config.auto_sync_minutes * 60 * 1000);
    }
    return () => { if (autoSyncRef.current) clearInterval(autoSyncRef.current); };
  }, [config.auto_sync_minutes]);

  async function handleSync() {
    if (syncState === "syncing") return;
    setSyncState("syncing");
    setProgress(null);
    setResult(null);

    const unlisten: UnlistenFn = await listen<SyncProgress>("sync-progress", (event) => {
      setProgress(event.payload);
      const f = event.payload.current_file.split("/").pop() ?? event.payload.current_file;
      setLog((l) => [...l, `↑ ${f}`]);
    });

    try {
      const enabledFolders = config.folders.filter((f) => f.enabled).map((f) => f.path);
      if (enabledFolders.length === 0) {
        setSyncState("idle");
        unlisten();
        return;
      }
      const res = await invoke<SyncResult>("sync_now", {
        serverUrl: config.server_url,
        apiToken: config.api_token,
        sourceName: config.source_name,
        folders: enabledFolders,
        excludes: config.excludes,
        maxFileSizeMb: config.max_file_size_mb ?? 0,
        smartExcludes: config.smart_excludes ?? [],
      });
      setResult(res);
      setSyncState("done");
      const now = new Date().toISOString();
      const updated = { ...config, last_sync: now };
      await invoke("save_config", { config: updated });
      onConfigChange(updated);
      if (res.errors === 0) setLog((l) => [...l, `✓ Done: ${res.uploaded} uploaded, ${res.skipped} skipped`]);
      else setLog((l) => [...l, `⚠ Done: ${res.uploaded} uploaded, ${res.errors} errors`]);
    } catch (e) {
      setSyncState("error");
      setLog((l) => [...l, `✗ Error: ${String(e)}`]);
    } finally {
      unlisten();
    }
  }

  async function handleAddFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected;
    if (config.folders.some((f) => f.path === path)) return;
    const updated = { ...config, folders: [...config.folders, { path, enabled: true }] };
    await invoke("save_config", { config: updated });
    onConfigChange(updated);
  }

  async function handleAddHomeFolder() {
    const home = await invoke<string>("get_home_dir");
    if (!home || config.folders.some((f) => f.path === home)) return;
    const updated = { ...config, folders: [...config.folders, { path: home, enabled: true }] };
    await invoke("save_config", { config: updated });
    onConfigChange(updated);
  }

  async function handleToggleFolder(idx: number) {
    const folders = config.folders.map((f, i) => i === idx ? { ...f, enabled: !f.enabled } : f);
    const updated = { ...config, folders };
    await invoke("save_config", { config: updated });
    onConfigChange(updated);
  }

  async function handleRemoveFolder(idx: number) {
    const folders = config.folders.filter((_, i) => i !== idx);
    const updated = { ...config, folders };
    await invoke("save_config", { config: updated });
    onConfigChange(updated);
  }

  async function handleAddExclude() {
    const pat = newExclude.trim();
    if (!pat || config.excludes.includes(pat)) return;
    const updated = { ...config, excludes: [...config.excludes, pat] };
    await invoke("save_config", { config: updated });
    onConfigChange(updated);
    setNewExclude("");
  }

  async function handleRemoveExclude(idx: number) {
    const excludes = config.excludes.filter((_, i) => i !== idx);
    const updated = { ...config, excludes };
    await invoke("save_config", { config: updated });
    onConfigChange(updated);
  }

  async function handleSmartExcludesChange(categories: string[]) {
    const updated = { ...config, smart_excludes: categories };
    await invoke("save_config", { config: updated });
    onConfigChange(updated);
  }

  const maxSizeMb = config.max_file_size_mb ?? 0;
  const smartExcludes = config.smart_excludes ?? [];

  return (
    <div className="flex flex-col h-screen bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
          <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <span className="font-semibold text-white text-sm flex-1">DataServer Backup</span>

        <div className="flex items-center gap-1.5 text-xs">
          <span className={`w-2 h-2 rounded-full ${connected === true ? "bg-green-500" : connected === false ? "bg-red-500" : "bg-slate-500"}`} />
          <span className="text-slate-400">{connected === true ? "Connected" : connected === false ? "Offline" : "…"}</span>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Settings"
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          onClick={handleSync}
          disabled={syncState === "syncing" || config.folders.filter((f) => f.enabled).length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          {syncState === "syncing" ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Syncing…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync Now
            </>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Folders */}
        <div className="flex-1 flex flex-col p-5 overflow-y-auto border-r border-slate-700/50 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Backup Folders</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddHomeFolder}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                title="Add your entire home folder"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                + Home
              </button>
              <button
                onClick={handleAddFolder}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Folder
              </button>
            </div>
          </div>

          {config.folders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">No folders added yet</p>
              <p className="text-slate-600 text-xs mt-1">Click "+ Home" to back up everything, or "Add Folder" to pick specific folders</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.folders.map((folder, idx) => (
                <FolderRow
                  key={folder.path}
                  folder={folder}
                  onToggle={() => handleToggleFolder(idx)}
                  onRemove={() => handleRemoveFolder(idx)}
                />
              ))}
            </div>
          )}

          {/* Filters section */}
          <div className="mt-6">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${showFilters ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Filters &amp; Excludes
              {smartExcludes.length > 0 && (
                <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {smartExcludes.length} active
                </span>
              )}
            </button>

            {showFilters && (
              <div className="mt-3">
                {/* Tab pills */}
                <div className="flex gap-1 mb-3">
                  <button
                    onClick={() => setFilterTab("smart")}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      filterTab === "smart"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Smart Filters
                  </button>
                  <button
                    onClick={() => setFilterTab("custom")}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      filterTab === "custom"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Custom Patterns {config.excludes.length > 0 && `(${config.excludes.length})`}
                  </button>
                </div>

                {filterTab === "smart" && (
                  <SmartFilters
                    activeCategories={smartExcludes}
                    onChange={handleSmartExcludesChange}
                  />
                )}

                {filterTab === "custom" && (
                  <div className="space-y-2">
                    {config.excludes.map((pat, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700">
                        <span className="flex-1 text-xs font-mono text-slate-300">{pat}</span>
                        <button onClick={() => handleRemoveExclude(idx)} className="text-slate-500 hover:text-red-400 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newExclude}
                        onChange={(e) => setNewExclude(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddExclude()}
                        placeholder="e.g. *.log or ~/Downloads"
                        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                      />
                      <button onClick={handleAddExclude} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors">
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right — Sync status */}
        <div className="w-72 flex-shrink-0 p-5 overflow-y-auto">
          <h2 className="text-sm font-semibold text-white mb-1">Sync Status</h2>
          <p className="text-xs text-slate-500 mb-4">
            {maxSizeMb > 0 ? `Max file size: ${maxSizeMb} MB` : "No file size limit"}
          </p>
          <SyncLog
            state={syncState}
            progress={progress}
            result={result}
            log={log}
            lastSync={config.last_sync}
          />
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          config={config}
          onSave={(updated) => { onConfigChange(updated); setShowSettings(false); }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
