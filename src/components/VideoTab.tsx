import { useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Loader2,
  Download,
  Trash2,
  ImagePlus,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Clock,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import {
  AvatarImage,
  addAvatarFromFile,
  getAvatars,
  getBuiltInAvatars,
  removeAvatar,
  isKaggleAvailable,
  startKaggleVideo,
  pollKaggle,
  getPendingKaggleJob,
  clearPendingKaggleJob,
} from '../services/videoService.js';

interface VideoTabProps {
  /** Guion que llega desde una tarjeta de Noticias (opcional). */
  initialScript?: string;
  initialTitle?: string;
}

type Stage = 'idle' | 'sending' | 'queued' | 'running' | 'done' | 'error';

const STAGE_TEXT: Record<Stage, string> = {
  idle: '',
  sending: 'Enviando tu guion...',
  queued: 'En fila, esperando una GPU libre',
  running: 'Grabando: voz, gestos y subtitulos',
  done: 'Tu video esta listo',
  error: 'Algo salio mal',
};

export function VideoTab({ initialScript = '', initialTitle = '' }: VideoTabProps) {
  const [script, setScript] = useState(initialScript);
  const [avatars, setAvatars] = useState<AvatarImage[]>(getAvatars());
  const [selectedAvatar, setSelectedAvatar] = useState<string>(getAvatars()[0]?.id || '');
  const [stage, setStage] = useState<Stage>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [log, setLog] = useState('');
  const [ready, setReady] = useState<boolean | null>(null);
  const pollTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialScript) setScript(initialScript);
  }, [initialScript]);

  // Fotos precargadas + subidas
  useEffect(() => {
    getBuiltInAvatars().then((builtIn) => {
      if (builtIn.length === 0) return;
      setAvatars((prev) => [...builtIn, ...prev.filter((a) => !a.builtIn)]);
      setSelectedAvatar((cur) => cur || builtIn[0].id);
    });
  }, []);

  // Motor listo y trabajo pendiente
  useEffect(() => {
    isKaggleAvailable().then((ok) => {
      setReady(ok);
      if (ok && getPendingKaggleJob()) {
        setStage('queued');
        startPolling();
      }
    });
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPolling = () => {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = null;
  };

  const startPolling = () => {
    stopPolling();
    const tick = async () => {
      const started = getPendingKaggleJob()?.startedAt;
      if (started) setElapsed(Math.max(0, Math.round((Date.now() - new Date(started).getTime()) / 60000)));
      try {
        const p = await pollKaggle();
        if (p.status === 'complete' && p.videoUrl) {
          stopPolling();
          clearPendingKaggleJob();
          setVideoUrl(p.videoUrl);
          setStage('done');
        } else if (p.status === 'error' || p.status === 'cancelled') {
          stopPolling();
          clearPendingKaggleJob();
          setStage('error');
          setError(p.message || 'El trabajo termino con error.');
          setLog(p.log || '');
        } else if (p.status === 'running') {
          setStage('running');
        } else {
          setStage('queued');
        }
      } catch {
        // sin red un momento; se reintenta en el siguiente tick
      }
    };
    tick();
    pollTimer.current = window.setInterval(tick, 30000);
  };

  const avatar = avatars.find((a) => a.id === selectedAvatar);
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const busy = stage === 'sending' || stage === 'queued' || stage === 'running';
  const canGenerate = !!ready && !!avatar && wordCount >= 10 && !busy;

  const autoTitle = (() => {
    if (initialTitle) return initialTitle;
    const first = script.trim().split(/[.!?\n]/)[0] || '';
    return first.split(/\s+/).slice(0, 7).join(' ') || 'Fabula News';
  })();

  const handleAddImages = async (files: FileList | null) => {
    if (!files) return;
    setError('');
    try {
      for (const f of Array.from(files)) {
        const a = await addAvatarFromFile(f);
        setAvatars((prev) => [...prev, a]);
        setSelectedAvatar(a.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleRemove = (id: string) => {
    if (id.startsWith('builtin-')) return;
    removeAvatar(id);
    const next = avatars.filter((a) => a.id !== id);
    setAvatars(next);
    if (selectedAvatar === id) setSelectedAvatar(next[0]?.id || '');
  };

  const handleGenerate = async () => {
    if (!avatar) return;
    setError('');
    setLog('');
    setVideoUrl(null);
    setElapsed(0);
    setStage('sending');
    try {
      await startKaggleVideo({ avatar, script: script.trim(), title: autoTitle, source: '' });
      setStage('queued');
      startPolling();
    } catch (e) {
      setStage('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    stopPolling();
    clearPendingKaggleJob();
    setStage('idle');
    setVideoUrl(null);
    setError('');
    setLog('');
    setElapsed(0);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-sky-400" />
            Hacer un video
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Pega el guion, elige tu foto y listo. La voz, los gestos y los subtitulos se hacen solos.
          </p>
        </div>
      </div>

      {/* Motor no configurado */}
      {ready === false && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-amber-100 text-sm flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Falta conectar la GPU gratuita</p>
            <p className="text-amber-200/80 mt-0.5">
              En AI Studio, en Secrets, agrega <code className="font-mono">KAGGLE_USERNAME</code> y{' '}
              <code className="font-mono">KAGGLE_KEY</code> (de tu kaggle.json) y vuelve a desplegar la app.
            </p>
          </div>
        </div>
      )}

      {/* Paso 1: guion */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs flex items-center justify-center">1</span>
            El guion
          </h3>
          <span className={`text-[11px] font-mono ${wordCount > 0 && wordCount < 10 ? 'text-amber-400' : 'text-neutral-500'}`}>
            {wordCount} palabras
          </span>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          disabled={busy}
          rows={8}
          placeholder="Pega aqui el guion tal como quieres que se lea. No se cambia ni una palabra."
          className="w-full px-4 py-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm leading-relaxed focus:outline-none focus:border-sky-500 disabled:opacity-60"
        />
        {script.trim() && (
          <p className="text-[11px] text-neutral-500">
            La tarjeta de entrada dira: <span className="text-neutral-300 font-medium">{autoTitle}</span>
          </p>
        )}
      </section>

      {/* Paso 2: foto */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs flex items-center justify-center">2</span>
            Tu foto
          </h3>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50"
          >
            <ImagePlus className="w-4 h-4" />
            Subir mas fotos
          </button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => handleAddImages(e.target.files)} />
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {avatars.map((a) => (
            <div key={a.id} className="relative group">
              <button
                onClick={() => !busy && setSelectedAvatar(a.id)}
                className={`w-full aspect-square rounded-xl overflow-hidden border-2 transition ${
                  selectedAvatar === a.id
                    ? 'border-sky-400 ring-2 ring-sky-400/30'
                    : 'border-neutral-800 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
              </button>
              {selectedAvatar === a.id && (
                <CheckCircle2 className="absolute bottom-1 right-1 w-4 h-4 text-sky-400 bg-neutral-950 rounded-full" />
              )}
              {!a.builtIn && !busy && (
                <button
                  onClick={() => handleRemove(a.id)}
                  className="absolute -top-1 -right-1 bg-neutral-900 border border-neutral-700 rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                  title="Quitar"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-neutral-500">Mejor de frente, boca cerrada y sin manos en la cara.</p>
      </section>

      {/* Paso 3: generar / progreso / resultado */}
      {stage === 'idle' || stage === 'error' ? (
        <>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full py-4 rounded-2xl text-base font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-950/40 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition"
          >
            <Sparkles className="w-5 h-5" />
            Generar video
          </button>
          {!canGenerate && ready && (
            <p className="text-[11px] text-neutral-500 text-center">
              {wordCount < 10 ? 'Pega un guion de al menos 10 palabras.' : !avatar ? 'Elige una foto.' : ''}
            </p>
          )}
        </>
      ) : null}

      {busy && (
        <div className="p-5 rounded-3xl bg-neutral-900 border border-sky-500/30 space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-sky-400 animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{STAGE_TEXT[stage]}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Tarda entre 10 y 15 minutos. Puedes cerrar la app; al volver aqui estara tu video.
              </p>
            </div>
            <span className="text-xs font-mono text-neutral-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {elapsed} min
            </span>
          </div>
          <div className="flex gap-1.5">
            {(['sending', 'queued', 'running', 'done'] as Stage[]).map((s, i) => {
              const order: Stage[] = ['sending', 'queued', 'running', 'done'];
              const active = order.indexOf(stage) >= i;
              return <div key={s} className={`h-1.5 flex-1 rounded-full ${active ? 'bg-sky-500' : 'bg-neutral-800'}`} />;
            })}
          </div>
          <button onClick={handleReset} className="text-[11px] text-neutral-500 hover:text-neutral-300 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />
            Cancelar y empezar de nuevo
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/50 text-red-200 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <p className="font-semibold">{STAGE_TEXT.error}</p>
            <p className="text-red-200/90 text-xs">{error}</p>
            {log && (
              <details className="text-[10px] text-red-300/70">
                <summary className="cursor-pointer">Ver detalle tecnico</summary>
                <pre className="whitespace-pre-wrap max-h-48 overflow-auto mt-1">{log}</pre>
              </details>
            )}
          </div>
        </div>
      )}

      {stage === 'done' && videoUrl && (
        <div className="p-5 rounded-3xl bg-neutral-900 border border-emerald-500/40 space-y-3">
          <p className="text-sm font-bold text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            {STAGE_TEXT.done}
          </p>
          <video controls playsInline src={videoUrl} className="w-full max-h-[560px] rounded-2xl bg-black" />
          <a
            href={videoUrl}
            download="fabula-news.mp4"
            className="w-full py-3 rounded-2xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Descargar para TikTok
          </a>
          <button onClick={handleReset} className="w-full text-xs text-neutral-400 hover:text-white py-1">
            Hacer otro video
          </button>
        </div>
      )}
    </div>
  );
}
