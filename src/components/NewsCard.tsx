import { useState } from 'react';
import {
  Copy,
  Check,
  RefreshCw,
  Archive,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ExternalLink,
  Clock,
  Sparkles,
  ShieldCheck,
  Hash,
  MessageSquare,
} from 'lucide-react';
import { NewsScriptItem } from '../services/types.js';
import { VideoStudio } from './VideoStudio.js';

interface NewsCardProps {
  card: NewsScriptItem;
  cardNumber: number;
  onRewrite: (card: NewsScriptItem) => Promise<void>;
  onMarkUsed: (card: NewsScriptItem) => Promise<void>;
  isRewriting?: boolean;
}

export function NewsCard({
  card,
  cardNumber,
  onRewrite,
  onMarkUsed,
  isRewriting = false,
}: NewsCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);

  const copyToClipboard = async (text: string, type: 'script' | 'caption' | 'hashtags') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'script') {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      } else if (type === 'caption') {
        setCopiedCaption(true);
        setTimeout(() => setCopiedCaption(false), 2000);
      } else if (type === 'hashtags') {
        setCopiedHashtags(true);
        setTimeout(() => setCopiedHashtags(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  // Format date nicely
  const formattedNewsDate = (() => {
    try {
      const d = new Date(card.newsDate);
      if (isNaN(d.getTime())) return card.newsDate;
      return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Mexico_City',
      }).format(d);
    } catch {
      return card.newsDate;
    }
  })();

  const hashtagString = card.hashtags.join(' ');

  return (
    <article className="w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5 transition relative overflow-hidden">
      {/* Rewriting overlay */}
      {isRewriting && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center">
          <RefreshCw className="w-8 h-8 text-rose-400 animate-spin mb-3" />
          <p className="text-sm font-bold text-white">Reescribiendo guion...</p>
          <p className="text-xs text-neutral-400 mt-1 max-w-xs">
            Pasando de nuevo por la Guía de Estilo, correctora y evaluador independiente.
          </p>
        </div>
      )}

      {/* Header Info */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-rose-500 text-white font-bold text-xs flex items-center justify-center shadow-md">
              {cardNumber}
            </span>
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                card.format === 'Explicado'
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                  : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
              }`}
            >
              Formato {card.format} • {card.wordCount} palabras
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Clock className="w-3.5 h-3.5 text-neutral-500" />
            <span>{formattedNewsDate}</span>
          </div>
        </div>

        <h3 className="text-lg sm:text-xl font-extrabold text-white leading-snug tracking-tight">
          {card.title}
        </h3>

        {/* Fuente verificada visible inmediatamente */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {card.sources[0] && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-300 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Fuente verificada:</span>
              <strong className="text-white font-semibold">{card.sources[0].name}</strong>
              {card.sources[0].url && (
                <a
                  href={card.sources[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-rose-400 hover:text-rose-300 ml-1 inline-flex items-center gap-0.5 hover:underline"
                  title="Abrir artículo original en el medio"
                >
                  <span>Abrir artículo</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Error alert if any real failure occurred */}
      {card.error && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Error en la generación:</span>
            <span>{card.error}</span>
          </div>
        </div>
      )}

      {/* Not approved alert banner if evaluator failed after retries */}
      {!card.approved && !card.error && (
        <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/60 text-red-200 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Aviso: No aprobada por el evaluador tras las reescrituras</span>
          </div>
          <p className="text-red-300/90 pl-6 leading-relaxed">
            {card.reviewObservations ||
              card.evaluatorScores.observations ||
              'No alcanzó la calificación aprobatoria en veracidad o adecuación.'}
          </p>
        </div>
      )}

      {/* Guion Final Box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Paso 1: Guion final
          </span>
          <span className="text-[11px] text-neutral-500 font-mono">
            {card.wordCount} palabras
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm leading-relaxed font-sans shadow-inner selection:bg-rose-500/30 selection:text-white">
          {card.script}
        </div>

        <button
          onClick={() => copyToClipboard(card.script, 'script')}
          className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg ${
            copiedScript
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40 active:scale-[0.99]'
          }`}
        >
          {copiedScript ? (
            <>
              <Check className="w-4 h-4" />
              <span>¡Guion copiado al portapapeles!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copiar guion</span>
            </>
          )}
        </button>
      </div>

      {/* Paso 3: Video gratuito (voz + avatar en Colab) */}
      <VideoStudio script={card.script} cardId={card.id} />

      {/* Caption & Hashtags for TikTok */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Caption */}
        <div className="p-3.5 rounded-2xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-1 text-[11px] text-neutral-400 font-semibold mb-1">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-rose-400" />
                Caption para TikTok
              </span>
              <span className="font-mono text-[10px] text-neutral-500">
                {card.caption.length}/150 car.
              </span>
            </div>
            <p className="text-xs text-neutral-300 leading-snug line-clamp-3">
              {card.caption}
            </p>
          </div>
          <button
            onClick={() => copyToClipboard(card.caption, 'caption')}
            className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition border ${
              copiedCaption
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700'
            }`}
          >
            {copiedCaption ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCaption ? '¡Copiado!' : 'Copiar caption'}</span>
          </button>
        </div>

        {/* Hashtags */}
        <div className="p-3.5 rounded-2xl bg-neutral-950/70 border border-neutral-800 flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-1 text-[11px] text-neutral-400 font-semibold mb-1">
              <span className="flex items-center gap-1">
                <Hash className="w-3 h-3 text-amber-400" />
                5 Hashtags
              </span>
              <span className="font-mono text-[10px] text-neutral-500">
                {card.hashtags.length} tags
              </span>
            </div>
            <p className="text-xs text-neutral-300 font-mono leading-snug truncate">
              {hashtagString}
            </p>
          </div>
          <button
            onClick={() => copyToClipboard(hashtagString, 'hashtags')}
            className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition border ${
              copiedHashtags
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700'
            }`}
          >
            {copiedHashtags ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedHashtags ? '¡Copiados!' : 'Copiar hashtags'}</span>
          </button>
        </div>
      </div>

      {/* Actions: Reescribir & Ya la usé */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800">
        <button
          onClick={() => onRewrite(card)}
          disabled={isRewriting}
          className="flex-1 min-w-[130px] py-2 px-3 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-neutral-400 ${isRewriting ? 'animate-spin' : ''}`} />
          <span>Reescribir</span>
        </button>

        <button
          onClick={() => onMarkUsed(card)}
          disabled={card.used}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 border ${
            card.used
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 cursor-default'
              : 'bg-neutral-800 hover:bg-neutral-750 text-amber-300 border-neutral-700'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>{card.used ? 'Guardada en Historial' : 'Ya la usé'}</span>
        </button>

        <button
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="py-2 px-3 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 flex items-center justify-center gap-1 transition"
        >
          <span>{detailsOpen ? 'Ocultar detalle' : 'Ver detalle'}</span>
          {detailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Accordion "Ver detalle" */}
      {detailsOpen && (
        <div className="mt-4 pt-4 border-t border-neutral-800 space-y-4 text-xs">
          {/* Ficha de Hechos */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2.5">
            <h4 className="font-bold text-neutral-200 flex items-center gap-1.5 text-sm">
              <ShieldCheck className="w-4 h-4 text-rose-400" />
              Ficha de hechos
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-neutral-300">
              <div>
                <span className="font-semibold text-neutral-500 block">Qué pasó:</span>
                <p className="mt-0.5">{card.factSheet.whatHappened}</p>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 block">Quién:</span>
                <p className="mt-0.5">{card.factSheet.who}</p>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 block">Cuándo:</span>
                <p className="mt-0.5">{card.factSheet.when}</p>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 block">Cifras y datos:</span>
                <p className="mt-0.5">{card.factSheet.figures}</p>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 block">Para quién es:</span>
                <p className="mt-0.5">{card.factSheet.targetAudience}</p>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 block">Llegada a México:</span>
                <p className="mt-0.5">{card.factSheet.reachesMexico}</p>
              </div>
              <div>
                <span className="font-semibold text-emerald-400 block">Confirmado:</span>
                <p className="mt-0.5 text-emerald-200/90">{card.factSheet.confirmed}</p>
              </div>
              <div>
                <span className="font-semibold text-amber-400 block">Rumores / Filtraciones:</span>
                <p className="mt-0.5 text-amber-200/90">{card.factSheet.rumors}</p>
              </div>
            </div>
          </div>

          {/* Fuentes con link y fecha de publicación */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
            <h4 className="font-bold text-neutral-200 text-sm">
              Fuentes ({card.sources.length})
            </h4>
            <div className="space-y-1.5">
              {card.sources.map((src, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-neutral-900 border border-neutral-800/80"
                >
                  <div className="truncate">
                    <span className="font-semibold text-neutral-200">{src.name}</span>
                    <span className="text-[11px] text-neutral-500 ml-2">
                      {src.pubDate ? new Date(src.pubDate).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : 'Fecha no especificada'}
                    </span>
                  </div>
                  {src.url && (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-rose-400 hover:text-rose-300 flex items-center gap-1 text-[11px] font-medium shrink-0"
                    >
                      <span>Abrir</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Calificación Editorial */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-neutral-200 text-sm">Calificación editorial</h4>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {card.editorialScore.score} / 10
              </span>
            </div>
            <p className="text-neutral-300">{card.editorialScore.reasoning}</p>
            <div className="flex gap-4 pt-1 text-[11px] text-neutral-400">
              <span>Novedad: <strong className="text-white">{card.editorialScore.novelty}/10</strong></span>
              <span>Impacto LATAM: <strong className="text-white">{card.editorialScore.impactLatam}/10</strong></span>
              <span>Debate: <strong className="text-white">{card.editorialScore.conversationPotential}/10</strong></span>
            </div>
          </div>

          {/* Calificaciones del Evaluador */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-neutral-200 text-sm">Evaluación de calidad</h4>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  card.evaluatorScores.approved
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}
              >
                {card.evaluatorScores.approved ? 'Aprobada' : 'No aprobada'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-800">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Coherencia</span>
                <span className="text-base font-extrabold text-white">{card.evaluatorScores.coherence}/5</span>
              </div>
              <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-800">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Cohesión</span>
                <span className="text-base font-extrabold text-white">{card.evaluatorScores.cohesion}/5</span>
              </div>
              <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-800">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Adecuación</span>
                <span className="text-base font-extrabold text-white">{card.evaluatorScores.adequacy}/5</span>
              </div>
              <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-800">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Veracidad</span>
                <span className="text-base font-extrabold text-white">{card.evaluatorScores.truthfulness}/5</span>
              </div>
            </div>

            <div className="space-y-1.5 text-neutral-400 text-[11px] pt-1">
              <p><strong className="text-neutral-300">Veracidad:</strong> {card.evaluatorScores.truthfulnessNotes}</p>
              <p><strong className="text-neutral-300">Adecuación:</strong> {card.evaluatorScores.adequacyNotes}</p>
              {card.evaluatorScores.observations && (
                <p><strong className="text-neutral-300">Observaciones:</strong> {card.evaluatorScores.observations}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
