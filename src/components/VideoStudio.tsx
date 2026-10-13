import { useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Settings2,
  Loader2,
  Download,
  Trash2,
  ImagePlus,
  Check,
  AlertTriangle,
  Play,
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

interface VideoStudioProps {
  script: string;
  cardId: string;
  title: string;
  sourceName: string;
}

type Phase = 'idle' | 'video' | 'done' | 'error';

export function VideoStudio({ script, cardId, title, sourceName }: VideoStudioProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [colabUrl, setColabUrlState] = useState(getColabUrl());
  const [avatars, setAvatars] = useState<AvatarImage[]>(getAvatars());
  const [selectedAvatar, setSelectedAvatar] = useState<string>(getAvatars()[0]?.id || '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  // Carga las imagenes precargadas del personaje y las pone antes de las subidas
  useEffect(() => {
    getBuiltInAvatars().then((builtIn) => {
      if (builtIn.length === 0) return;
      setAvatars((prev) => [...builtIn, ...prev.filter((a) => !a.builtIn)]);
      setSelectedAvatar((cur) => cur || builtIn[0].id);
    });
  }, []);

  const busy = phase === 'video';
  const avatar = avatars.find((a) => a.id === selectedAvatar);
  const needsSetup = !colabUrl || !avatar;

  const handleSaveConfig = () => {
    setColabUrl(colabUrl);
    setConfigOpen(false);
  };

  const handleAddImages = async (files: FileList | null) => {
    if (!files) return;
    try {
      for (const f of Array.from(files)) {
        const a = await addAvatarFromFile(f);
        setAvatars((prev) => [...prev, a]);
        if (!selectedAvatar) setSelectedAvatar(a.id);
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

  const handleGenerateVideo = async () => {
    if (!avatar) return;
    setError('');
    setVideoUrl(null);
    setPhase('video');
    try {
      const url = await generateVideo({ avatar, script, title, source: sourceName }, setStatus);
      setVideoUrl(url);
      setPhase('done');
      setStatus('');
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
          <Clapperboard className="w-3.5 h-3.5 text-sky-400" />
          Paso 3: Generar video
        </span>
        <button
          onClick={() => setConfigOpen(!configOpen)}
          className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Configurar video
        </button>
      </div>

      {configOpen && (
        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3 text-xs">
          <div>
            <label className="font-semibold text-neutral-300 block mb-1">URL del notebook de Colab (Gradio)</label>
            <input
              value={colabUrl}
              onChange={(e) => setColabUrlState(e.target.value)}
              placeholder="https://xxxxx.gradio.live"
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-200 font-mono"
            />
            <p className="text-neutral-500 mt-1">
              Abre colab/fabula_video.ipynb en Colab con GPU, corre todas las celdas y pega aqui el link gradio.live que imprime al final. Dura hasta 72 horas. La voz se clona en Colab a partir de voz_referencia.wav.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-neutral-300">Imagenes del personaje ({avatars.length})</label>
              <button
                onClick={() => fileInput.current?.click()}
                className="flex items-center gap-1 text-sky-400 hover:text-sky-300"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Agregar
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => handleAddImages(e.target.files)}
              />
            </div>
            {avatars.length === 0 ? (
              <p className="text-neutral-500">Sube una o varias fotos de tu personaje (de frente, cara visible).</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {avatars.map((a) => (
                  <div key={a.id} className="relative group">
                    <button
                      onClick={() => setSelectedAvatar(a.id)}
                      className={`w-full aspect-square rounded-lg overflow-hidden border-2 ${
                        selectedAvatar === a.id ? 'border-sky-400' : 'border-neutral-800'
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
            )}
          </div>

          <button
            onClick={handleSaveConfig}
            className="w-full py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-semibold flex items-center justify-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            Guardar configuracion
          </button>
        </div>
      )}

      {/* Selector rapido de imagen */}
      {!configOpen && avatars.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {avatars.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAvatar(a.id)}
              className={`w-12 h-12 shrink-0 rounded-lg overflow-hidden border-2 ${
                selectedAvatar === a.id ? 'border-sky-400' : 'border-neutral-800 opacity-60 hover:opacity-100'
              }`}
              title={a.name}
            >
              <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <button
        onClick={handleGenerateVideo}
        disabled={busy || needsSetup}
        title={needsSetup ? 'Configura la URL de Colab y una imagen del personaje' : ''}
        className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-950/40 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {busy ? status || 'Trabajando...' : 'Generar video (voz clonada + subtitulos, 9:16)'}
      </button>

      {needsSetup && !configOpen && (
        <p className="text-[11px] text-neutral-500">
          Falta {!colabUrl ? 'la URL de Colab' : ''}
          {!colabUrl && !avatar ? ' y ' : ''}
          {!avatar ? 'una imagen del personaje' : ''}. Entra a "Configurar video".
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
          <video controls src={videoUrl} className="w-full max-h-[480px] rounded-2xl bg-black" />
          <a
            href={videoUrl}
            download={`fabula-news-${cardId}.mp4`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Descargar MP4 para TikTok
          </a>
        </div>
      )}
    </div>
  );
}
