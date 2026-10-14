import { useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Loader2,
  Download,
  Trash2,
  ImagePlus,
  AlertTriangle,
  Play,
  Link2,
  Check,
} from 'lucide-react';
import {
  AvatarImage,
  addAvatarFromFile,
  generateVideo,
  getAvatars,
  getBuiltInAvatars,
  getColabUrl,
  removeAvatar,
  setColabUrl,
} from '../services/videoService.js';

/**
 * Pestaña "Video": pegar guion, elegir (o subir) imagen y generar.
 * Pensada para guiones trabajados fuera de la app.
 */
export function VideoTab() {
  const [script, setScript] = useState('');
  const [colabUrl, setColabUrlState] = useState(getColabUrl());
  const [urlSaved, setUrlSaved] = useState(false);
  const [avatars, setAvatars] = useState<AvatarImage[]>(getAvatars());
  const [selectedAvatar, setSelectedAvatar] = useState<string>(getAvatars()[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBuiltInAvatars().then((builtIn) => {
      if (builtIn.length === 0) return;
      setAvatars((prev) => [...builtIn, ...prev.filter((a) => !a.builtIn)]);
      setSelectedAvatar((cur) => cur || builtIn[0].id);
    });
  }, []);

  const avatar = avatars.find((a) => a.id === selectedAvatar);
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const canGenerate = !!colabUrl && !!avatar && wordCount >= 10 && !busy;

  const handleSaveUrl = () => {
    setColabUrl(colabUrl);
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2000);
  };

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

  // Titulo automatico: primeras palabras del guion, sin punto final
  const autoTitle = (() => {
    const first = script.trim().split(/[.!?\n]/)[0] || '';
    const words = first.split(/\s+/).slice(0, 7).join(' ');
    return words || 'Fabula News';
  })();

  const handleGenerate = async () => {
    if (!avatar) return;
    setError('');
    setVideoUrl(null);
    setBusy(true);
    try {
      const url = await generateVideo({ avatar, script: script.trim(), title: autoTitle, source: '' }, setStatus);
      setVideoUrl(url);
      setStatus('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Clapperboard className="w-5 h-5 text-sky-400" />
        <h2 className="text-lg font-extrabold text-white">Generar video desde un guion</h2>
      </div>

      {/* 1. Guion */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">1. Pega el guion</span>
          <span className="text-[11px] font-mono text-neutral-500">{wordCount} palabras</span>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={9}
          placeholder="Pega aqui el guion completo tal como se va a leer..."
          className="w-full px-4 py-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm leading-relaxed focus:outline-none focus:border-sky-500"
        />
        {script.trim() && (
          <p className="text-[11px] text-neutral-500">
            Tarjeta de titulo: <span className="text-neutral-300">{autoTitle}</span>
          </p>
        )}
      </section>

      {/* 2. Imagen */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            2. Elige la imagen ({avatars.length})
          </span>
          <button
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300"
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
                onClick={() => setSelectedAvatar(a.id)}
                className={`w-full aspect-square rounded-xl overflow-hidden border-2 transition ${
                  selectedAvatar === a.id ? 'border-sky-400 ring-2 ring-sky-400/30' : 'border-neutral-800 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
              </button>
              {!a.builtIn && (
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
        <p className="text-[11px] text-neutral-500">
          Funciona mejor con fotos de frente, boca cerrada y sin manos en la cara.
        </p>
      </section>

      {/* 3. Colab */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">3. Link de Colab</span>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <Link2 className="w-4 h-4 text-neutral-500 shrink-0" />
            <input
              value={colabUrl}
              onChange={(e) => setColabUrlState(e.target.value)}
              placeholder="https://xxxxx.gradio.live"
              className="w-full py-2.5 bg-transparent text-neutral-200 text-sm font-mono focus:outline-none"
            />
          </div>
          <button
            onClick={handleSaveUrl}
            className="px-4 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 flex items-center gap-1.5"
          >
            {urlSaved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
            {urlSaved ? 'Guardado' : 'Guardar'}
          </button>
        </div>
        <p className="text-[11px] text-neutral-500">
          Se guarda en este navegador. Cambia cada vez que reinicias el notebook de Colab.
        </p>
      </section>

      {/* 4. Generar */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="w-full py-4 rounded-2xl text-base font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-950/40 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
        {busy ? status || 'Trabajando...' : 'Generar video'}
      </button>
      {!canGenerate && !busy && (
        <p className="text-[11px] text-neutral-500 text-center">
          {wordCount < 10 ? 'Pega un guion de al menos 10 palabras. ' : ''}
          {!avatar ? 'Elige una imagen. ' : ''}
          {!colabUrl ? 'Pega y guarda el link de Colab.' : ''}
        </p>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {videoUrl && (
        <div className="space-y-2">
          <video controls src={videoUrl} className="w-full max-h-[560px] rounded-2xl bg-black" />
          <a
            href={videoUrl}
            download="fabula-news.mp4"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-2xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Descargar MP4 para TikTok
          </a>
        </div>
      )}
    </div>
  );
}
