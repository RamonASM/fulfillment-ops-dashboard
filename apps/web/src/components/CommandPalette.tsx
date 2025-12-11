import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Home,
  Users,
  Bell,
  FileText,
  Settings,
  Upload,
  Package,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Command,
} from 'lucide-react';
import { api } from '@/api/client';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  category: 'navigation' | 'clients' | 'actions' | 'search';
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Fetch clients for search
  const { data: clientsData } = useQuery({
    queryKey: ['clients-search'],
    queryFn: () => api.get<{ data: Array<{ id: string; name: string; code: string }> }>('/clients'),
    enabled: isOpen,
    staleTime: 60000,
  });

  const clients = clientsData?.data || [];

  // Define all commands
  const commands = useMemo<CommandItem[]>(() => {
    const navCommands: CommandItem[] = [
      {
        id: 'nav-home',
        label: 'Go to Dashboard',
        description: 'View main dashboard',
        icon: <Home className="w-4 h-4" />,
        category: 'navigation',
        action: () => { navigate('/'); onClose(); },
        keywords: ['home', 'dashboard', 'main'],
      },
      {
        id: 'nav-clients',
        label: 'Go to Clients',
        description: 'View all clients',
        icon: <Users className="w-4 h-4" />,
        category: 'navigation',
        action: () => { navigate('/clients'); onClose(); },
        keywords: ['clients', 'accounts', 'customers'],
      },
      {
        id: 'nav-alerts',
        label: 'Go to Alerts',
        description: 'View all alerts',
        icon: <Bell className="w-4 h-4" />,
        category: 'navigation',
        action: () => { navigate('/alerts'); onClose(); },
        keywords: ['alerts', 'notifications', 'warnings'],
      },
      {
        id: 'nav-reports',
        label: 'Go to Reports',
        description: 'View reports',
        icon: <FileText className="w-4 h-4" />,
        category: 'navigation',
        action: () => { navigate('/reports'); onClose(); },
        keywords: ['reports', 'analytics', 'export'],
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        description: 'Manage settings',
        icon: <Settings className="w-4 h-4" />,
        category: 'navigation',
        action: () => { navigate('/settings'); onClose(); },
        keywords: ['settings', 'preferences', 'config'],
      },
    ];

    const actionCommands: CommandItem[] = [
      {
        id: 'action-import',
        label: 'Import Data',
        description: 'Upload CSV or Excel file',
        icon: <Upload className="w-4 h-4" />,
        category: 'actions',
        action: () => { navigate('/imports'); onClose(); },
        keywords: ['import', 'upload', 'csv', 'excel'],
      },
      {
        id: 'action-risky',
        label: 'View Risky Products',
        description: 'See products at elevated risk',
        icon: <AlertTriangle className="w-4 h-4" />,
        category: 'actions',
        action: () => { navigate('/'); onClose(); }, // Scrolls to risk section
        keywords: ['risk', 'risky', 'danger', 'critical'],
      },
      {
        id: 'action-ai',
        label: 'Ask AI Assistant',
        description: 'Get AI-powered insights',
        icon: <Sparkles className="w-4 h-4" />,
        category: 'actions',
        action: () => { navigate('/'); onClose(); },
        keywords: ['ai', 'assistant', 'help', 'insights'],
      },
    ];

    const clientCommands: CommandItem[] = clients.map((client) => ({
      id: `client-${client.id}`,
      label: client.name,
      description: client.code,
      icon: <Package className="w-4 h-4" />,
      category: 'clients',
      action: () => { navigate(`/clients/${client.id}`); onClose(); },
      keywords: [client.name.toLowerCase(), client.code.toLowerCase()],
    }));

    return [...navCommands, ...actionCommands, ...clientCommands];
  }, [navigate, onClose, clients]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands.filter((cmd) => cmd.category !== 'clients').slice(0, 8);
    }

    const lowerQuery = query.toLowerCase();
    return commands
      .filter((cmd) => {
        const searchText = [
          cmd.label,
          cmd.description,
          ...(cmd.keywords || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(lowerQuery);
      })
      .slice(0, 10);
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, filteredCommands, selectedIndex, onClose]
  );

  // Set up keyboard listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    clients: 'Clients',
    actions: 'Actions',
    search: 'Search Results',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search commands, clients, actions..."
            className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No results found for "{query}"
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, items]) => (
              <div key={category}>
                <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {categoryLabels[category] || category}
                </div>
                {items.map((item) => {
                  const globalIndex = filteredCommands.indexOf(item);
                  const isSelected = globalIndex === selectedIndex;

                  return (
                    <button
                      key={item.id}
                      data-index={globalIndex}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-primary text-white'
                          : 'text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <span className={isSelected ? 'text-white' : 'text-gray-400'}>
                        {item.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{item.label}</div>
                        {item.description && (
                          <div
                            className={`text-sm truncate ${
                              isSelected ? 'text-white/70' : 'text-gray-500'
                            }`}
                          >
                            {item.description}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <ArrowRight className="w-4 h-4 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded">↵</kbd>
              to select
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <span>K to open</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to manage command palette state
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}

export default CommandPalette;
