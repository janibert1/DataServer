import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, File, Folder, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/axios';
import clsx from 'clsx';

interface SearchResult {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  mimeType?: string;
  folderId?: string | null;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    Promise.all([
      api.get('/files', { params: { search: debouncedQuery, limit: 5 } }),
      api.get('/folders', { params: { search: debouncedQuery } }),
    ])
      .then(([filesRes, foldersRes]) => {
        const fileResults: SearchResult[] = (filesRes.data.files ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          type: 'file' as const,
          path: f.path,
          mimeType: f.mimeType,
          folderId: f.folderId,
        }));
        const folderResults: SearchResult[] = (foldersRes.data.folders ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          type: 'folder' as const,
          path: f.path,
        }));
        setResults([...folderResults.slice(0, 3), ...fileResults.slice(0, 5)]);
        setIsOpen(true);
        setActiveIndex(-1);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [debouncedQuery]);

  const selectResult = useCallback((result: SearchResult) => {
    setQuery('');
    setIsOpen(false);
    if (result.type === 'folder') {
      navigate(`/drive/folder/${result.id}`);
    } else if (result.folderId) {
      navigate(`/drive/folder/${result.folderId}?preview=${result.id}`);
    } else {
      navigate(`/drive/my-drive?preview=${result.id}`);
    }
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectResult(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-full max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search files and folders…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          className="w-full pl-9 pr-9 py-2 text-sm bg-slate-100 rounded-lg border border-transparent focus:outline-none focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100 placeholder-slate-400 transition-all"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setIsOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-dropdown border border-slate-100 overflow-hidden z-50 animate-slide-down">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-slate-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">No results found for "{query}"</div>
          ) : (
            <ul>
              {results.map((result, i) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors',
                      i === activeIndex && 'bg-brand-50'
                    )}
                    onClick={() => selectResult(result)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      result.type === 'folder' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                    )}>
                      {result.type === 'folder'
                        ? <Folder className="w-4 h-4" />
                        : <File className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{result.name}</p>
                      <p className="text-xs text-slate-400 truncate">{result.path}</p>
                    </div>
                    <span className="ml-auto text-xs text-slate-400 flex-shrink-0">
                      {result.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
