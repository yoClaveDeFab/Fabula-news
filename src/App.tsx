import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, logoutUser, testConnection } from './services/firebase.js';
import { AppConfig, NewsScriptItem, SearchJob } from './services/types.js';
import {
  loadAppConfig,
  addToHistory,
  recordProcessedUrls,
  getRecentProcessedUrls,
  recordScriptOpening,
  getRecentScriptOpenings,
} from './services/configService.js';
import { Navbar } from './components/Navbar.js';
import { ProgressIndicator } from './components/ProgressIndicator.js';
import { NewsCard } from './components/NewsCard.js';
import { HistoryTab } from './components/HistoryTab.js';
import { ConfigTab } from './components/ConfigTab.js';
import { LoginScreen } from './components/LoginScreen.js';
import { Sparkles, AlertCircle } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [allowedEmail, setAllowedEmail] = useState<string>('bfabiola.castillo@gmail.com');
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  // App tabs & config
  const [activeTab, setActiveTab] = useState<'news' | 'history' | 'config'>('news');
  const [config, setConfig] = useState<AppConfig | null>(null);

  // News search state
  const [cards, setCards] = useState<NewsScriptItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStep, setSearchStep] = useState<string>('idle');
  const [searchMessage, setSearchMessage] = useState<string>('');
  const [searchPercent, setSearchPercent] = useState<number>(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [rewritingId, setRewritingId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Historial de noticias vistas y rotación temática para garantizar novedad y variedad
  const [seenTitles, setSeenTitles] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('fabula_seen_titles');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [searchRunIndex, setSearchRunIndex] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('fabula_run_index') || '0');
    } catch {
      return 0;
    }
  });

  // Local Mexico City Time String
  const [mexicoTimeStr, setMexicoTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      try {
        const str = new Intl.DateTimeFormat('es-MX', {
          timeZone: 'America/Mexico_City',
          dateStyle: 'full',
          timeStyle: 'medium',
        }).format(new Date());
        setMexicoTimeStr(str);
      } catch {
        setMexicoTimeStr('');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch auth config (ALLOWED_EMAIL)
  useEffect(() => {
    fetch('/api/auth-config')
      .then((r) => r.json())
      .then((d) => {
        if (d.allowedEmail) setAllowedEmail(d.allowedEmail);
      })
      .catch((err) => console.error('Error cargando auth-config:', err));
  }, []);

  // Test Firestore connection on boot
  useEffect(() => {
    testConnection();
  }, []);

  // Auth observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser && currentUser.email) {
        const userEmailLower = currentUser.email.toLowerCase().trim();
        const allowedLower = allowedEmail.toLowerCase().trim();

        if (userEmailLower !== allowedLower) {
          setIsUnauthorized(true);
          return;
        }

        setIsUnauthorized(false);
        // Load initial config from Firestore
        try {
          const cfg = await loadAppConfig();
          setConfig(cfg);
        } catch (err) {
          console.error('Error cargando config inicial:', err);
        }
      } else {
        setIsUnauthorized(false);
        setConfig(null);
      }
    });

    return () => unsubscribe();
  }, [allowedEmail]);

  // Handler: Cancel / Reset Search
  const handleCancelSearch = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    const currentId = activeJobId || localStorage.getItem('fabula_active_job_id');
    if (currentId) {
      fetch(`/api/search-jobs/${currentId}/cancel`, { method: 'POST' }).catch(() => {});
    }
    setIsSearching(false);
    setActiveJobId(null);
    setSearchStep('idle');
    setSearchMessage('');
    setSearchPercent(0);
    setSearchError(null);
    localStorage.removeItem('fabula_active_job_id');
  };

  // Polling controller for background search jobs
  const startPollingJob = (jobId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setActiveJobId(jobId);
    setIsSearching(true);
    setSearchError(null);

    let consecutiveFailures = 0;
    let lastChangeTime = Date.now();
    let lastPercent = -1;

    const checkJob = async () => {
      try {
        const res = await fetch(`/api/search-jobs/${jobId}`);
        if (res.status === 404) {
          // El trabajo ya no existe en memoria del servidor (ej. reinicio de instancia o servicio)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsSearching(false);
          setActiveJobId(null);
          setSearchStep('idle');
          setSearchMessage('');
          setSearchPercent(0);
          localStorage.removeItem('fabula_active_job_id');
          return;
        }

        if (!res.ok) {
          consecutiveFailures++;
          if (consecutiveFailures >= 4) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsSearching(false);
            setActiveJobId(null);
            setSearchStep('idle');
            localStorage.removeItem('fabula_active_job_id');
            setSearchError('El servidor se actualizó. Haz clic en "Buscar noticias" para iniciar la búsqueda.');
          }
          return;
        }

        consecutiveFailures = 0;
        const data = await res.json();
        const job: SearchJob = data.job;
        if (!job) return;

        if (typeof job.percent === 'number' && job.percent !== lastPercent) {
          lastPercent = job.percent;
          lastChangeTime = Date.now();
        }

        // Watchdog en cliente: si un trabajo se queda sin cambios por más de 25 segundos, liberar la UI
        if (job.status === 'running' && Date.now() - lastChangeTime > 25000) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsSearching(false);
          setActiveJobId(null);
          setSearchStep('idle');
          localStorage.removeItem('fabula_active_job_id');
          setSearchError('La conexión con algunas fuentes demoró más de lo habitual. Puedes volver a presionar "Buscar noticias" para reintentar.');
          return;
        }

        setSearchStep(job.step);
        setSearchMessage(job.message);
        if (typeof job.percent === 'number') {
          setSearchPercent(job.percent);
        }

        // RESULTADOS PARCIALES INMEDIATOS: muestra cada tarjeta en cuanto su guion esté listo
        if (Array.isArray(job.partialCards) && job.partialCards.length > 0) {
          setCards(job.partialCards);
          setSeenTitles((prev) => {
            const combined = Array.from(new Set([...prev, ...job.partialCards.map((c) => c.title)]));
            try {
              localStorage.setItem('fabula_seen_titles', JSON.stringify(combined.slice(-100)));
            } catch {}
            return combined;
          });
        }

        if (job.status === 'completed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsSearching(false);
          setActiveJobId(null);
          setSearchPercent(100);
          setSearchStep('completed');
          localStorage.removeItem('fabula_active_job_id');

          // Guardar URLs procesadas y aperturas en Firestore
          const urlsToRecord: string[] = [];
          for (const c of job.partialCards) {
            if (c.firstWords) {
              recordScriptOpening(c.firstWords);
            }
            if (Array.isArray(c.sources)) {
              for (const s of c.sources) {
                if (s.url) urlsToRecord.push(s.url);
              }
            }
          }
          if (urlsToRecord.length > 0) {
            recordProcessedUrls(urlsToRecord);
          }
        } else if (job.status === 'error') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsSearching(false);
          setActiveJobId(null);
          setSearchStep('error');
          setSearchError(job.error || job.message || 'Error en el proceso de búsqueda.');
          localStorage.removeItem('fabula_active_job_id');
        }
      } catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= 4) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsSearching(false);
          setActiveJobId(null);
          localStorage.removeItem('fabula_active_job_id');
        }
        console.warn('Error consultando estado del trabajo:', err);
      }
    };

    checkJob();
    pollIntervalRef.current = setInterval(checkJob, 2000);
  };

  // Restaurar trabajo si el usuario recarga, cierra la app o apaga la pantalla
  useEffect(() => {
    const savedJobId = localStorage.getItem('fabula_active_job_id');
    if (savedJobId) {
      startPollingJob(savedJobId);
    } else {
      fetch('/api/search-jobs/latest')
        .then((r) => r.json())
        .then((data) => {
          if (data.job) {
            const job: SearchJob = data.job;
            if (job.status === 'running') {
              startPollingJob(job.id);
            } else if (job.status === 'completed' && Array.isArray(job.partialCards) && job.partialCards.length > 0) {
              setCards(job.partialCards);
            }
          }
        })
        .catch(() => {});
    }

    const onVisibilityOrFocus = () => {
      const activeId = localStorage.getItem('fabula_active_job_id');
      if (activeId) {
        startPollingJob(activeId);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, []);

  // Handler: Search News (Segundo plano)
  const handleSearchNews = async () => {
    if (!config || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchStep('reading_feeds');
    setSearchMessage('Iniciando trabajo en segundo plano en el servidor...');
    setSearchPercent(5);

    try {
      const processedUrls = await getRecentProcessedUrls();
      const recentOpenings = await getRecentScriptOpenings();
      const combinedSeenTitles = Array.from(new Set([...seenTitles, ...cards.map((c) => c.title)]));
      const currentRun = searchRunIndex;
      const nextRun = currentRun + 1;
      setSearchRunIndex(nextRun);
      try {
        localStorage.setItem('fabula_run_index', String(nextRun));
      } catch {}

      const response = await fetch('/api/search-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          processedUrls,
          recentOpenings,
          seenTitles: combinedSeenTitles,
          searchRunIndex: currentRun,
          userId: user?.uid,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Error');
        throw new Error(`Error en servidor (${response.status}): ${errorText}`);
      }

      const { jobId } = await response.json();
      localStorage.setItem('fabula_active_job_id', jobId);
      startPollingJob(jobId);
    } catch (err: unknown) {
      console.error('Error iniciando búsqueda en segundo plano:', err);
      setIsSearching(false);
      setSearchStep('error');
      setSearchError(err instanceof Error ? err.message : String(err));
      localStorage.removeItem('fabula_active_job_id');
    }
  };

  // Handler: Rewrite Single Card
  const handleRewriteCard = async (card: NewsScriptItem) => {
    if (!config || rewritingId) return;
    setRewritingId(card.id);

    try {
      const recentOpenings = await getRecentScriptOpenings();
      const response = await fetch('/api/rewrite-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card,
          config,
          recentOpenings,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Error');
        throw new Error(`Error en servidor (${response.status}): ${errorText}`);
      }

      if (!response.body) throw new Error('Respuesta vacía.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const eventMatch = block.match(/^event:\s*(\w+)/m);
          const dataMatch = block.match(/^data:\s*(.+)$/m);
          if (eventMatch && dataMatch) {
            const eventName = eventMatch[1];
            const payload = JSON.parse(dataMatch[1]);
            if (eventName === 'result' && payload.card) {
              setCards((prev) =>
                prev.map((c) => (c.id === card.id ? payload.card : c))
              );
              if (payload.card.firstWords) {
                recordScriptOpening(payload.card.firstWords);
              }
            } else if (eventName === 'error') {
              alert(`Error al reescribir: ${payload.message}`);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error reescribiendo tarjeta:', err);
      alert('Error al reescribir el guion: ' + String(err));
    } finally {
      setRewritingId(null);
    }
  };

  // Handler: Mark News as Used
  const handleMarkUsed = async (card: NewsScriptItem) => {
    try {
      await addToHistory(card);
      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, used: true } : c))
      );
    } catch (err) {
      console.error('Error guardando en historial:', err);
      alert('Error guardando en historial: ' + String(err));
    }
  };

  // Auth loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 text-neutral-400 space-y-3">
        <div className="w-10 h-10 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
        <p className="text-xs font-medium tracking-wide">Cargando Fabula News...</p>
      </div>
    );
  }

  // Not logged in or unauthorized email
  if (!user || isUnauthorized) {
    return (
      <LoginScreen
        allowedEmail={allowedEmail}
        userEmail={user?.email}
        isUnauthorized={isUnauthorized}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-rose-500/30 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={logoutUser}
        newsCount={cards.length}
        mexicoTimeStr={mexicoTimeStr}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8 space-y-8">
        {/* PESTAÑA NOTICIAS */}
        {activeTab === 'news' && (
          <div className="space-y-8">
            {/* Search Trigger Banner */}
            <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="max-w-2xl space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>3 guiones listos para copiar y pegar en HeyGen</span>
                </div>

                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                  Noticias de tecnología verificadas
                </h1>

                <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                  Lectura directa de feeds RSS, filtro estricto de 48 horas en código, complemento con Gemini, ficha de hechos, redacción en español oral mexicano y evaluación de veracidad.
                </p>

                <div className="pt-2 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleSearchNews}
                    disabled={isSearching}
                    className="w-full sm:w-auto py-4 px-8 rounded-2xl font-black text-base bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-xl shadow-rose-950/50 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                    <span>{isSearching ? 'Buscando y verificando...' : 'Buscar noticias'}</span>
                  </button>

                  {isSearching && (
                    <button
                      onClick={handleCancelSearch}
                      className="py-4 px-5 rounded-2xl font-semibold text-sm bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 hover:border-red-500/50 hover:text-red-300 transition-all flex items-center gap-2"
                    >
                      <span>Cancelar o reiniciar</span>
                    </button>
                  )}

                  {!isSearching && seenTitles.length > 0 && (
                    <button
                      onClick={() => {
                        setSeenTitles([]);
                        localStorage.removeItem('fabula_seen_titles');
                      }}
                      className="text-xs text-neutral-400 hover:text-neutral-200 underline decoration-dotted transition"
                      title="Permite que vuelvan a aparecer noticias consultadas previamente si así lo deseas"
                    >
                      Restablecer filtro ({seenTitles.length} vistas)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Error Message if Search Failed */}
            {searchError && (
              <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/60 text-red-200 text-xs flex items-start gap-3 shadow-lg">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="block font-bold">Error durante el proceso:</strong>
                  <p>{searchError}</p>
                </div>
              </div>
            )}

            {/* Progress Indicator */}
            {isSearching && (
              <ProgressIndicator
                currentStep={searchStep}
                message={searchMessage}
                progressPercent={searchPercent}
                onCancel={handleCancelSearch}
              />
            )}

            {/* 3 News Cards Section */}
            {cards.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    3 Guiones generados
                  </h2>
                  <span className="text-xs text-neutral-400">
                    Pégalos en HeyGen para generar tu avatar
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {cards.map((card, idx) => (
                    <NewsCard
                      key={card.id || idx}
                      cardNumber={idx + 1}
                      card={card}
                      onRewrite={handleRewriteCard}
                      onMarkUsed={handleMarkUsed}
                      isRewriting={rewritingId === card.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state when no cards generated yet */}
            {cards.length === 0 && !isSearching && !searchError && (
              <div className="p-12 text-center text-neutral-500 border border-dashed border-neutral-800 rounded-3xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-neutral-600">
                  <Sparkles className="w-6 h-6 text-rose-500/70" />
                </div>
                <h3 className="text-sm font-bold text-neutral-300">
                  Listo para buscar noticias
                </h3>
                <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
                  Presiona el botón <strong className="text-neutral-400">"Buscar noticias"</strong> para leer los feeds, calificar candidatos, verificar hechos y redactar tus 3 guiones de hoy.
                </p>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA HISTORIAL */}
        {activeTab === 'history' && <HistoryTab />}

        {/* PESTAÑA CONFIGURACIÓN */}
        {activeTab === 'config' && config && (
          <ConfigTab config={config} onConfigUpdated={(newCfg) => setConfig(newCfg)} />
        )}
      </main>
    </div>
  );
}
