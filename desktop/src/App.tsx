import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Config } from "./types";
import SetupPage from "./pages/SetupPage";
import MainPage from "./pages/MainPage";

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<Config | null>("load_config")
      .then((cfg) => setConfig(cfg))
      .catch(console.error)
      .finally(() => setLoading(false));

    // Hide to tray on close instead of quitting
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.onCloseRequested((event) => {
      event.preventDefault();
      win.hide();
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!config) {
    return <SetupPage onConfigured={setConfig} />;
  }

  return <MainPage config={config} onConfigChange={setConfig} />;
}
