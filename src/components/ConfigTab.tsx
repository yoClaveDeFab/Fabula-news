import { useState } from 'react';
import {
  Save,
  Check,
  AlertCircle,
  Download,
  Upload,
  Radio,
  CheckCircle2,
  XCircle,
  Loader2,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { AppConfig, FeedCheckResult } from '../services/types.js';
import { saveAppConfigField, importAppConfig } from '../services/configService.js';

interface ConfigTabProps {
  config: AppConfig;
  onConfigUpdated: (newConfig: AppConfig) => void;
}

export function ConfigTab({ config, onConfigUpdated }: ConfigTabProps) {
  const [formData, setFormData] = useState<AppConfig>({ ...config });
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  // Feed tester state
  const [testingFeeds, setTestingFeeds] = useState(false);
  const [feedResults, setFeedResults] = useState<FeedCheckResult[] | null>(null);

  // Field handler
  const handleFieldChange = (field: keyof AppConfig, val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    setSaveStatus((prev) => ({ ...prev, [field]: 'idle' }));
  };

  const handleSaveField = async (field: keyof AppConfig) => {
    setSaveStatus((prev) => ({ ...prev, [field]: 'saving' }));
    setSaveErrors((prev) => ({ ...prev, [field]: '' }));
    try {
      await saveAppConfigField(field, formData[field] || '');
      setSaveStatus((prev) => ({ ...prev, [field]: 'saved' }));
      onConfigUpdated({ ...formData });
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [field]: 'idle' }));
      }, 3000);
    } catch (err: unknown) {
      setSaveStatus((prev) => ({ ...prev, [field]: 'error' }));
      setSaveErrors((prev) => ({
        ...prev,
        [field]: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  // Test RSS Feeds button
  const handleTestFeeds = async () => {
    setTestingFeeds(true);
    setFeedResults(null);
    try {
      const res = await fetch('/api/test-feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rssFeeds: formData.rssFeeds }),
      });
      const data = await res.json();
      if (data.results) {
        setFeedResults(data.results);
      }
    } catch (err) {
      console.error('Error probando fuentes:', err);
    } finally {
      setTestingFeeds(false);
    }
  };

  // Export JSON
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(formData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fabula_news_config_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const updated = await importAppConfig(parsed);
        setFormData(updated);
        onConfigUpdated(updated);
        alert('Configuración importada exitosamente y guardada en Firestore.');
      } catch (err) {
        alert('Error al leer o importar el archivo JSON: ' + String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const fields: Array<{
    id: keyof AppConfig;
    title: string;
    description: string;
    rows: number;
    extra?: React.ReactNode;
  }> = [
    {
      id: 'styleGuide',
      title: '1. Guía de estilo',
      description: 'Instrucciones obligatorias para redacción, tono oral mexicano, sintaxis, tiempos y muletillas prohibidas.',
      rows: 12,
    },
    {
      id: 'exampleScripts',
      title: '2. Guiones de ejemplo',
      description: 'Ejemplos para imitar tono, ritmo y vocabulario sin copiar estructura.',
      rows: 10,
    },
    {
      id: 'priorityTopics',
      title: '3. Temas prioritarios',
      description: 'Temas tecnológicos y de impacto en México/LATAM con mayor valor editorial.',
      rows: 8,
    },
    {
      id: 'avoidTopics',
      title: '4. Temas a evitar',
      description: 'Criterios de descarte automático (rumores sin fuente, notas viejas, etc.).',
      rows: 6,
    },
    {
      id: 'aiWatchlist',
      title: '5. Lista de vigilancia de productos de IA',
      description: 'Nivel 1 (muchos puntos), Nivel 2 (puntos moderados), Nivel 3 (sin puntos extra).',
      rows: 8,
    },
    {
      id: 'rssFeeds',
      title: '6. Fuentes RSS',
      description: 'Una fuente por línea con el formato: categoría | nombre | URL.',
      rows: 12,
      extra: (
        <div className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleTestFeeds}
              disabled={testingFeeds}
              className="py-2.5 px-4 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-750 text-rose-300 border border-neutral-700 flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
            >
              {testingFeeds ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                  <span>Validando feeds en tiempo real...</span>
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4 text-rose-400" />
                  <span>Probar fuentes</span>
                </>
              )}
            </button>

            {feedResults && (
              <span className="text-xs text-neutral-400">
                {feedResults.filter((r) => r.status === 'ok').length} funcionando de {feedResults.length}
              </span>
            )}
          </div>

          {/* Feed test results table */}
          {feedResults && (
            <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2 max-h-80 overflow-y-auto">
              <h5 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2">
                Resultado de validación de feeds
              </h5>
              <div className="space-y-1.5">
                {feedResults.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-neutral-900 border border-neutral-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {r.status === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="font-semibold text-neutral-200">{r.name}</span>
                      <span className="text-[10px] text-neutral-500 uppercase px-1 rounded bg-neutral-800">
                        {r.category}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      {r.status === 'ok' ? (
                        <span className="text-[11px] text-emerald-400 font-medium">
                          OK ({r.itemCount} items)
                        </span>
                      ) : (
                        <span className="text-[11px] text-rose-400 font-medium truncate max-w-xs block" title={r.error}>
                          {r.error || 'Falló conexión'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header and Export / Import */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <FileCode className="w-5 h-5 text-rose-500" />
            Configuración editorial
          </h2>
          <p className="text-xs text-neutral-400 mt-1 max-w-xl">
            Cada cambio se guarda directamente en Firestore con merge. Nunca se sobrescribe lo que ya guardaste.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExport}
            className="py-2 px-3.5 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 flex items-center gap-2 transition active:scale-95"
          >
            <Download className="w-4 h-4 text-neutral-400" />
            <span>Exportar</span>
          </button>

          <label className="py-2 px-3.5 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 flex items-center gap-2 transition active:scale-95 cursor-pointer">
            <Upload className="w-4 h-4 text-neutral-400" />
            <span>Importar</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Six Textareas */}
      <div className="space-y-6">
        {fields.map((f) => {
          const status = saveStatus[f.id] || 'idle';
          const errorMsg = saveErrors[f.id];

          return (
            <div
              key={f.id}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-white">{f.title}</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">{f.description}</p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {status === 'saved' && (
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 animate-pulse">
                      <Check className="w-3.5 h-3.5" />
                      ¡Guardado!
                    </span>
                  )}
                  {status === 'error' && (
                    <span className="text-xs font-semibold text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Error al guardar
                    </span>
                  )}

                  <button
                    onClick={() => handleSaveField(f.id)}
                    disabled={status === 'saving'}
                    className="py-1.5 px-3.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow transition active:scale-95 disabled:opacity-50"
                  >
                    {status === 'saving' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Guardar</span>
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200 text-xs">
                  {errorMsg}
                </div>
              )}

              <textarea
                value={formData[f.id] || ''}
                onChange={(e) => handleFieldChange(f.id, e.target.value)}
                rows={f.rows}
                className="w-full p-4 rounded-2xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs font-mono leading-relaxed focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/30 transition resize-y"
              />

              {f.extra}
            </div>
          );
        })}
      </div>
    </div>
  );
}
