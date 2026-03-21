import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { BreadcrumbItem } from '../../types';

interface Props {
  items: BreadcrumbItem[];
}

export function FolderBreadcrumb({ items }: Props) {
  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto">
      <Link
        to="/drive/my-drive"
        className="flex items-center gap-1 text-slate-500 hover:text-slate-700 flex-shrink-0 transition-colors"
      >
        <Home className="w-4 h-4" />
        <span>My Drive</span>
      </Link>

      {items.map((item, i) => (
        <div key={item.id ?? i} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
          {i === items.length - 1 ? (
            <span className="font-medium text-slate-800 truncate max-w-48">{item.name}</span>
          ) : (
            <Link
              to={item.id ? `/drive/folder/${item.id}` : '/drive/my-drive'}
              className="text-slate-500 hover:text-slate-700 transition-colors truncate max-w-32"
            >
              {item.name}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
