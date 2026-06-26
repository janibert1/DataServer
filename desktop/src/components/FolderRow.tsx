import { FolderConfig } from "../types";

interface Props {
  folder: FolderConfig;
  onToggle: () => void;
  onRemove: () => void;
}

export default function FolderRow({ folder, onToggle, onRemove }: Props) {
  const name = folder.path.split("/").filter(Boolean).pop() ?? folder.path;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 rounded-xl border border-slate-700 group">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center">
        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{name}</div>
        <div className="text-xs text-slate-500 truncate">{folder.path}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors focus:outline-none ${
          folder.enabled ? "bg-blue-600" : "bg-slate-600"
        }`}
        title={folder.enabled ? "Disable" : "Enable"}
      >
        <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${
          folder.enabled ? "translate-x-4" : "translate-x-0.5"
        }`} />
      </button>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
        title="Remove"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
