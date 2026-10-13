import { useState, useEffect } from 'react';
import { History, Copy, Check, Calendar, Search, Sparkles, Terminal, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { HistoryRecord, GeminiLogEntry } from '../services/types.js';
import { loadUserHistory } from '../services/configService.js';

export function HistoryTab() {
  const [activeSubTab, setActiveSubTab] = useState<'scripts' | 'technical'>('scripts');
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [technicalLogs, setTechnicalLogs] = useState<GeminiLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadUserHistory()
      .then((items) => {
        if (mounted) {
          setHistory(items);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error cargando historial:', err);
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/gemini-logs');
      if (res.ok) {
        const data = await res.json();
        setTechnicalLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Error al cargar logs técnicos:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'technical') {
      fetchLogs();
    }
  }, [activeSubTab]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignored
    }
  };

  const filtered = history.filter((item) =>
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.script.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Sub-tabs header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 rounded-3xl p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('scripts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
              activeSubTab === 'scripts'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-750'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Guiones usados ({history.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('technical')}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
              activeSubTab === 'technical'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-750'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Registro técnico Gemini ({technicalLogs.length})</span>
          </button>
        </div>

        {activeSubTab === 'scripts' ? (
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar en el historial..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-rose-500"
            />
          </div>
        ) : (
          <button
            onClick={fetchLogs}
            disabled={loadingLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
            <span>Actualizar registro</span>
          </button>
        )}
      </div>

      {/* Scripts Tab Content */}
      {activeSubTab === 'scripts' && (
        <>
          {loading ? (
            <div className="p-12 text-center text-neutral-400 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mx-auto" />
              <p className="text-xs">Cargando historial desde Firestore...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 border border-dashed border-neutral-800 rounded-3xl space-y-2">
              <History className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-neutral-300">
                {searchTerm ? 'No hay resultados para tu búsqueda' : 'Aún no has marcado noticias como usadas'}
              </h4>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Cuando generes guiones en la pestaña principal, haz clic en el botón "Ya la usé" para archivarlos aquí.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((item) => {
                const formattedDate = (() => {
                  try {
                    return new Intl.DateTimeFormat('es-MX', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'America/Mexico_City',
                    }).format(new Date(item.dateUsed));
                  } catch {
                    return item.dateUsed;
                  }
                })();

                return (
                  <div
                    key={item.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-md space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/30">
                          {item.format} • {item.wordCount} palabras
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                          <Calendar className="w-3 h-3 text-neutral-500" />
                          Usada: {formattedDate}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white tracking-tight">
                      {item.title}
                    </h3>

                    <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-850 text-neutral-200 text-xs leading-relaxed font-sans whitespace-pre-wrap">
                      {item.script}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <span className="text-neutral-500 font-mono text-[11px] truncate max-w-md">
                        {item.hashtags}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(item.caption, `cap_${item.id}`)}
                          className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-300 border border-neutral-700 flex items-center gap-1 text-xs"
                        >
                          {copiedId === `cap_${item.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>Caption</span>
                        </button>
                        <button
                          onClick={() => handleCopy(item.script, `scr_${item.id}`)}
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 text-xs shadow"
                        >
                          {copiedId === `scr_${item.id}` ? <Check className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                          <span>{copiedId === `scr_${item.id}` ? '¡Copiado!' : 'Copiar guion'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Technical Logs Tab Content */}
      {activeSubTab === 'technical' && (
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 text-xs text-neutral-400 space-y-1">
            <p className="font-semibold text-neutral-200 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-rose-400" />
              Auditoría y Registro de llamadas a Gemini API
            </p>
            <p className="text-neutral-400">
              Registra cada llamada: el paso editorial, el modelo utilizado, el tiempo de respuesta, el resultado y cualquier mensaje de error técnico. Límite estricto por llamada: 90 segundos con 1 reintento.
            </p>
          </div>

          {loadingLogs ? (
            <div className="p-12 text-center text-neutral-400 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mx-auto" />
              <p className="text-xs">Consultando llamadas registradas...</p>
            </div>
          ) : technicalLogs.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 border border-dashed border-neutral-800 rounded-3xl space-y-2">
              <Clock className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-neutral-300">No hay llamadas registradas aún</h4>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Las llamadas a Gemini aparecerán aquí en cuanto inicies una búsqueda o reescritura.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {technicalLogs.map((log) => {
                const formattedTime = (() => {
                  try {
                    return new Intl.DateTimeFormat('es-MX', {
                      timeStyle: 'medium',
                      timeZone: 'America/Mexico_City',
                    }).format(new Date(log.timestamp));
                  } catch {
                    return log.timestamp;
                  }
                })();

                return (
                  <div
                    key={log.id}
                    className={`border rounded-2xl p-4 transition-all ${
                      log.status === 'success'
                        ? 'bg-neutral-900/90 border-neutral-800'
                        : 'bg-rose-950/20 border-rose-800/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        {log.status === 'success' ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Éxito
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/50">
                            <AlertTriangle className="w-3 h-3" />
                            Error
                          </span>
                        )}
                        <span className="text-xs font-bold text-white">{log.step}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-neutral-400 font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                          {log.model}
                        </span>
                        <span>{(log.durationMs / 1000).toFixed(2)}s</span>
                        <span className="text-neutral-500">{formattedTime}</span>
                      </div>
                    </div>

                    {log.errorMessage && (
                      <div className="mt-2 p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-200 text-xs font-mono break-words leading-relaxed">
                        <span className="font-bold text-rose-400">Detalle del error: </span>
                        {log.errorMessage}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
