import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Bell,
  ShoppingCart,
  FileBarChart,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  Command,
  MessageSquare,
  HelpCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { clsx } from "clsx";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, shortcut: "G then H" },
  { name: "Clients", href: "/clients", icon: Building2, shortcut: "G then C" },
  { name: "Alerts", href: "/alerts", icon: Bell, shortcut: "G then A" },
  { name: "Orders", href: "/orders", icon: ShoppingCart, shortcut: "G then O" },
  {
    name: "Reports",
    href: "/reports",
    icon: FileBarChart,
    shortcut: "G then R",
  },
  {
    name: "Feedback",
    href: "/feedback",
    icon: MessageSquare,
    shortcut: "G then F",
  },
  { name: "Help", href: "/help", icon: HelpCircle, shortcut: "G then ?" },
  { name: "Settings", href: "/settings", icon: Settings, shortcut: "G then S" },
];

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [gPressed, setGPressed] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const commandPalette = useCommandPalette();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Navigation shortcuts: G then X
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Handle '/' to focus search
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        commandPalette.open();
        return;
      }

      // Handle 'G' key for navigation
      if (e.key.toLowerCase() === "g" && !e.ctrlKey && !e.metaKey) {
        setGPressed(true);
        timeout = setTimeout(() => setGPressed(false), 1500);
        return;
      }

      if (gPressed) {
        setGPressed(false);
        clearTimeout(timeout);

        const routes: Record<string, string> = {
          h: "/",
          a: "/alerts",
          c: "/clients",
          o: "/orders",
          r: "/reports",
          f: "/feedback",
          "?": "/help",
          s: "/settings",
        };

        const route = routes[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          navigate(route);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeout);
    };
  }, [gPressed, navigate, commandPalette]);

  return (
    <div className="min-h-screen bg-background">
      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        onClose={commandPalette.close}
      />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <span className="text-white font-semibold">Inventory IQ</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === "/"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "group flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white",
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </div>
                <span className="hidden group-hover:inline-flex text-xs text-gray-500">
                  {item.shortcut}
                </span>
              </NavLink>
            ))}
          </nav>

          {/* Keyboard shortcut hint */}
          <div className="px-4 py-2 border-t border-gray-800">
            <button
              onClick={commandPalette.open}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Command className="w-4 h-4" />
              <span>Command Palette</span>
              <kbd className="ml-auto px-1.5 py-0.5 text-xs bg-gray-800 rounded">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* User section */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || "User"}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {user?.role?.replace("_", " ") || "Account Manager"}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-border">
          <div className="flex items-center justify-between h-full px-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-gray-500 hover:text-gray-700"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Search - Opens Command Palette */}
              <button
                onClick={commandPalette.open}
                className="hidden sm:flex items-center gap-2 w-64 px-3 py-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Search className="w-4 h-4" />
                <span>Search...</span>
                <kbd className="ml-auto px-1.5 py-0.5 text-xs text-gray-400 bg-gray-200 rounded">
                  ⌘K
                </kbd>
              </button>
            </div>

            <div className="flex items-center gap-4">
              {/* Quick actions */}
              <button
                onClick={() => navigate("/imports")}
                className="btn-primary btn-sm hidden sm:flex"
              >
                Import Data
              </button>

              {/* Notifications */}
              <button
                onClick={() => navigate("/alerts")}
                className="relative p-2 text-gray-500 hover:text-gray-700"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 md:p-6">
          <Outlet />
        </main>

        {/* G key indicator */}
        {gPressed && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg z-50 animate-fade-in">
            Press: <kbd className="px-1 bg-gray-700 rounded mx-1">H</kbd> Home,{" "}
            <kbd className="px-1 bg-gray-700 rounded mx-1">A</kbd> Alerts,{" "}
            <kbd className="px-1 bg-gray-700 rounded mx-1">C</kbd> Clients,{" "}
            <kbd className="px-1 bg-gray-700 rounded mx-1">O</kbd> Orders,{" "}
            <kbd className="px-1 bg-gray-700 rounded mx-1">R</kbd> Reports,{" "}
            <kbd className="px-1 bg-gray-700 rounded mx-1">F</kbd> Feedback,{" "}
            <kbd className="px-1 bg-gray-700 rounded mx-1">S</kbd> Settings
          </div>
        )}
      </div>
    </div>
  );
}
