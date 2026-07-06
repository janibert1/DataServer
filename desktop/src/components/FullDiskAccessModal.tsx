import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onGranted: () => void;
  onClose: () => void;
}

export default function FullDiskAccessModal({ onGranted, onClose }: Props) {
  const [checking, setChecking] = useState(false);
  const [stillDenied, setStillDenied] = useState(false);

  async function handleOpenSettings() {
    setStillDenied(false);
    try {
      await invoke("open_full_disk_access_settings");
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRecheck() {
    setChecking(true);
    setStillDenied(false);
    try {
      const granted = await invoke<boolean>("check_full_disk_access");
      if (granted) onGranted();
      else setStillDenied(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Grant Full Disk Access</h2>
        <p className="text-sm text-slate-300">
          macOS doesn't have a single "allow this app to see everything" popup — without
          Full Disk Access it prompts separately the first time the backup touches each
          protected folder (Desktop, Documents, Downloads, Mail, etc.), one dialog at a time.
        </p>
        <p className="text-sm text-slate-300">
          Grant Full Disk Access once instead, and none of those extra prompts will show up:
        </p>
        <ol className="text-sm text-slate-400 list-decimal list-inside space-y-1">
          <li>Click "Open System Settings" below</li>
          <li>Click the "+" button and add "DataServer Backup"</li>
          <li>Turn its toggle on</li>
          <li>Come back here and click "I've granted access"</li>
        </ol>

        {stillDenied && (
          <div className="px-3 py-2 rounded-lg text-sm bg-red-900/40 text-red-400">
            Still not detected. Make sure the toggle next to DataServer Backup is on — you
            may need to quit and reopen the app after granting it.
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleOpenSettings}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            Open System Settings
          </button>
          <button
            onClick={handleRecheck}
            disabled={checking}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {checking ? "Checking…" : "I've granted access"}
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Skip for now (you'll get individual prompts as folders are backed up)
        </button>
      </div>
    </div>
  );
}
