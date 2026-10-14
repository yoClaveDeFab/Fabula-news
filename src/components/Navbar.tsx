import { Newspaper, History, Settings, LogOut, Clapperboard } from 'lucide-react';
import { User } from 'firebase/auth';

interface NavbarProps {
  activeTab: 'news' | 'video' | 'history' | 'config';
  setActiveTab: (tab: 'news' | 'video' | 'history' | 'config') => void;
  user: User | null;
  onLogout: () => void;
  newsCount?: number;
  mexicoTimeStr: string;
}

export function Navbar({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  newsCount = 0,
  mexicoTimeStr,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 bg-neutral-900/95 backdrop-blur border-b border-neutral-800">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Logo & Branding */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-950/40 text-white font-black text-lg">
              F
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">Fabula News</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  TikTok
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 hidden sm:block truncate max-w-xs">
                {mexicoTimeStr || 'Hora de México'}
              </p>
            </div>
          </div>

          {/* User profile / Logout */}
          {user && (
            <div className="flex items-center gap-2">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-medium text-neutral-200 truncate max-w-[160px]">
                  {user.displayName || user.email}
                </span>
                <span className="text-[10px] text-neutral-400 truncate max-w-[160px]">
                  {user.email}
                </span>
              </div>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Usuario'}
                  className="w-8 h-8 rounded-full border border-neutral-700 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-300">
                  {user.email?.[0]?.toUpperCase()}
                </div>
              )}
              <button
                onClick={onLogout}
                title="Cerrar sesión"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1.5 mt-3 pt-2 border-t border-neutral-800/60">
          <button
            onClick={() => setActiveTab('news')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'news'
                ? 'bg-neutral-800 text-rose-400 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
            }`}
          >
            <Newspaper className="w-4 h-4" />
            <span>Noticias</span>
            {newsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                {newsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('video')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'video'
                ? 'bg-neutral-800 text-sky-400 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
            }`}
          >
            <Clapperboard className="w-4 h-4" />
            <span>Video</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-neutral-800 text-amber-400 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historial</span>
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'config'
                ? 'bg-neutral-800 text-neutral-100 shadow-sm border border-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Configuración</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
