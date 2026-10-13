import { Loader2, Radio, CheckCircle2, Search, FileText, CheckCheck, ShieldAlert, XCircle } from 'lucide-react';

interface ProgressIndicatorProps {
  currentStep: string;
  message: string;
  progressPercent?: number;
  onCancel?: () => void;
}

export function ProgressIndicator({ currentStep, message, progressPercent = 0, onCancel }: ProgressIndicatorProps) {
  const steps = [
    { id: 'reading_feeds', label: 'Leyendo RSS reales', icon: Radio },
    { id: 'scoring', label: 'Calificando', icon: FileText },
    { id: 'fact_checking', label: 'Verificando hechos', icon: ShieldAlert },
    { id: 'writing', label: 'Escribiendo', icon: FileText },
    { id: 'reviewing', label: 'Revisando estilo', icon: CheckCheck },
    { id: 'evaluating', label: 'Evaluando calidad', icon: CheckCircle2 },
  ];

  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-wide">
              Buscando y verificando noticias
            </h4>
            <p className="text-xs text-rose-300 font-medium animate-pulse mt-0.5">
              {message || 'Procesando pipeline editorial...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-neutral-400 hover:text-red-300 bg-neutral-800/80 hover:bg-red-950/40 border border-neutral-700 hover:border-red-500/40 transition flex items-center gap-1.5"
              title="Cancelar o reiniciar búsqueda"
            >
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              <span>Cancelar</span>
            </button>
          )}
          <span className="text-xs font-mono font-bold text-neutral-400 bg-neutral-800/80 px-2 py-1 rounded-md border border-neutral-700">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
        <div
          className="bg-gradient-to-r from-rose-500 to-amber-500 h-full transition-all duration-500 ease-out"
          style={{ width: `${Math.max(progressPercent, 5)}%` }}
        />
      </div>

      {/* Step Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 pt-1">
        {steps.map((s, index) => {
          const isDone = currentIdx > index;
          const isCurrent = currentIdx === index || (currentIdx === -1 && index === 0);
          return (
            <div
              key={s.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition ${
                isCurrent
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : isDone
                  ? 'bg-neutral-800/60 text-emerald-400'
                  : 'bg-neutral-800/20 text-neutral-500'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400 shrink-0" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0" />
              )}
              <span className="truncate">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
