import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SmartExcludeCategory } from "../types";

interface Props {
  activeCategories: string[];
  onChange: (categories: string[]) => void;
}

export default function SmartFilters({ activeCategories, onChange }: Props) {
  const [categories, setCategories] = useState<SmartExcludeCategory[]>([]);

  useEffect(() => {
    invoke<SmartExcludeCategory[]>("get_smart_exclude_categories")
      .then(setCategories)
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    if (activeCategories.includes(id)) {
      onChange(activeCategories.filter((c) => c !== id));
    } else {
      onChange([...activeCategories, id]);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {categories.map((cat) => {
        const active = activeCategories.includes(cat.id);
        return (
          <div
            key={cat.id}
            onClick={() => toggle(cat.id)}
            className={`rounded-lg border p-3 cursor-pointer transition-colors ${
              active
                ? "border-blue-500/50 bg-blue-900/20"
                : "border-slate-700 bg-slate-800 hover:border-slate-600"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{cat.icon}</span>
                <span className="text-xs font-medium text-slate-200">{cat.label}</span>
              </div>
              {/* Toggle pill */}
              <div
                className={`w-8 h-4 rounded-full flex items-center transition-colors flex-shrink-0 ${
                  active ? "bg-blue-600" : "bg-slate-600"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${
                    active ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
            </div>
            <p className="text-slate-500 text-xs leading-snug">{cat.description}</p>
          </div>
        );
      })}
    </div>
  );
}
