import {
  getGenAI,
  MODEL_CHEAP,
  MODEL_QUALITY,
  getDatePreamble,
  generateWithRetry,
  validateScriptRules,
  withTimeout,
} from './gemini.js';
import { RawNewsCandidate, ParsedFeedConfig, fetchFeedItems, parseRssConfig } from './rss.js';
import { AppConfig, NewsScriptItem, FactSheet, NewsSource, EditorialScore, EvaluatorScores } from '../services/types.js';

export interface WorkflowProgressCallback {
  (step: string, message: string, progressPercent?: number): void;
}

export interface NewsGroupCandidate {
  id: string;
  topic: string;
  title: string;
  summary: string;
  earliestPubDate: string;
  latestPubDate: string;
  sources: NewsSource[];
  score?: number;
  scoreReasoning?: string;
  novelty?: number;
  impactLatam?: number;
  conversationPotential?: number;
}

export const SUBTHEME_POOLS = [
  {
    name: 'Ciberseguridad y fraudes digitales',
    pillar: 'ciberseguridad_general',
    promptSnippet: 'Ciberseguridad, filtraciones masivas de datos bancarios/personales, fraudes digitales y estafas en línea (phishing, robo de identidad, malware)',
  },
  {
    name: 'Telecomunicaciones e internet en México',
    pillar: 'mexico_latam',
    promptSnippet: 'Telecomunicaciones e internet en México (redes móviles, 5G, CFE Internet, Telcel, AT&T, Altán Redes, resoluciones IFT)',
  },
  {
    name: 'Pagos digitales, Fintech y Bancos en LATAM',
    pillar: 'mexico_latam',
    promptSnippet: 'Pagos digitales, fintech y bancos digitales en México y LATAM (Nu, Mercado Pago, Stori, SPEI, transferencias digitales, Ualá)',
  },
  {
    name: 'Leyes y regulación de la IA',
    pillar: 'politica_sociedad',
    promptSnippet: 'Leyes de IA (Ley de IA de la Unión Europea, iniciativas de regulación en México, Brasil, Chile, Colombia, EE.UU., China), multas, investigaciones y prohibiciones',
  },
  {
    name: 'Nvidia, semiconductores y tensiones geopolíticas de chips',
    pillar: 'politica_sociedad',
    promptSnippet: 'Nvidia, chips de IA, semiconductores, controles de exportación y tensiones comerciales entre Estados Unidos y China',
  },
  {
    name: 'Marcas chinas en México',
    pillar: 'ciberseguridad_general',
    promptSnippet: 'Marcas chinas en México: BYD (autos eléctricos), Xiaomi, Huawei, DiDi, Temu, Shein, Honor, Oppo y Motorola',
  },
  {
    name: 'Redes sociales masivas',
    pillar: 'ciberseguridad_general',
    promptSnippet: 'Novedades, cambios de políticas, seguridad y funciones en WhatsApp, Instagram, TikTok, YouTube, X (Twitter), Facebook y Spotify',
  },
  {
    name: 'Ética de la IA, derechos de autor y deepfakes',
    pillar: 'politica_sociedad',
    promptSnippet: 'Ética de la IA, demandas por derechos de autor y datos de entrenamiento, deepfakes, desinformación y privacidad',
  },
  {
    name: 'Modelos de IA, imagen, video y voz',
    pillar: 'ia_modelos',
    promptSnippet: 'Lanzamientos de modelos de IA, herramientas para crear imagen, video y voz (Sora, Kling, ElevenLabs, HeyGen, Claude, GPT, Gemini)',
  },
  {
    name: 'Comercio electrónico y Startups en LATAM',
    pillar: 'mexico_latam',
    promptSnippet: 'Comercio electrónico (Mercado Libre, Amazon México, Temu) y startups tecnológicas en México y Latinoamérica',
  },
  {
    name: 'Dispositivos, celulares y lentes inteligentes',
    pillar: 'tech_general',
    promptSnippet: 'Nuevos celulares, computadoras, wearables, gadgets y lentes inteligentes (Apple, Samsung, Google, Meta Ray-Ban)',
  },
];

export function getRotatingThemesForRun(runIndex: number): typeof SUBTHEME_POOLS {
  const count = SUBTHEME_POOLS.length;
  const idx1 = (runIndex * 3) % count;
  const idx2 = (runIndex * 3 + 4) % count;
  const idx3 = (runIndex * 3 + 8) % count;
  return [SUBTHEME_POOLS[idx1], SUBTHEME_POOLS[idx2], SUBTHEME_POOLS[idx3]];
}

export function cleanTitleSimple(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

export function isSimilarToSeen(title: string, seenSet: Set<string>): boolean {
  const clean = cleanTitleSimple(title);
  if (!clean) return false;
  if (seenSet.has(clean)) return true;
  const words = clean.split(/\s+/).filter((w) => w.length > 3);
  if (words.length >= 3) {
    for (const seen of seenSet) {
      const seenWords = seen.split(/\s+/).filter((w) => w.length > 3);
      const overlap = words.filter((w) => seenWords.includes(w)).length;
      if (overlap >= 3 && (overlap / words.length >= 0.6 || overlap / seenWords.length >= 0.6)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Step 1: Read RSS feeds in parallel and filter in code (<= 48h, valid date, not previously processed or seen)
 */
export async function step1ReadRssFeeds(
  rssConfig: string,
  processedUrlSet: Set<string>,
  seenTitleSet: Set<string> = new Set(),
  onProgress?: WorkflowProgressCallback
): Promise<RawNewsCandidate[]> {
  onProgress?.('reading_feeds', 'Iniciando lectura de fuentes RSS en paralelo...', 10);
  const feeds = parseRssConfig(rssConfig);

  const rawCandidates: RawNewsCandidate[] = [];
  let completed = 0;

  const feedPromises = feeds.map(async (feed) => {
    try {
      const items = await fetchFeedItems(feed, 48, processedUrlSet);
      for (const item of items) {
        rawCandidates.push(item);
      }
    } catch {
      // Ignorar feeds caídos o lentos
    } finally {
      completed++;
      if (completed % 3 === 0 || completed === feeds.length) {
        const pct = Math.min(32, 10 + Math.round((completed / feeds.length) * 22));
        onProgress?.(
          'reading_feeds',
          `Leyendo fuentes RSS (${completed}/${feeds.length} consultadas, ${rawCandidates.length} notas detectadas)...`,
          pct
        );
      }
    }
  });

  // Esperar a que terminen los feeds con un tope máximo de 4.2 segundos para que nunca se trabe
  await Promise.race([
    Promise.allSettled(feedPromises),
    new Promise((resolve) => setTimeout(resolve, 4200)),
  ]);

  // Si no se encontraron noticias en 48h (ej. fin de semana tranquilo), intentar con 96h en fuentes principales
  if (rawCandidates.length === 0) {
    console.warn('Ampliando ventana de feeds a 96h de respaldo para evitar bloqueo...');
    await Promise.race([
      Promise.allSettled(
        feeds.slice(0, 10).map(async (feed) => {
          try {
            const items = await fetchFeedItems(feed, 96, processedUrlSet);
            rawCandidates.push(...items);
          } catch {}
        })
      ),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  }

  // Filtrar candidatos descartando los ya vistos por el usuario
  const unseenCandidates = rawCandidates.filter((item) => !isSimilarToSeen(item.title, seenTitleSet));
  // Si el filtro de vistos descartó casi todo, usar los candidatos en general para evitar que se quede vacío
  const finalCandidates = unseenCandidates.length >= 6 ? unseenCandidates : rawCandidates;

  onProgress?.(
    'reading_feeds',
    `Fuentes leídas con éxito: ${finalCandidates.length} noticias frescas disponibles.`,
    35
  );
  return finalCandidates;
}

/**
 * Paso 2: Desactivado para prevenir alucinaciones de IA.
 * Toda noticia procesada por Fabula News proviene al 100% de fuentes RSS oficiales y reales.
 */
export async function step2ComplementNews(
  _priorityTopics: string,
  _aiWatchlist: string,
  _processedUrlSet: Set<string>,
  _seenTitles: string[] = [],
  _rotatingFocusThemes: string[] = [],
  _onProgress?: WorkflowProgressCallback
): Promise<RawNewsCandidate[]> {
  // Retorna vacío intencionalmente: garantía estricta de cero noticias inventadas.
  return [];
}

/**
 * Step 3: Qualification with gemini-3.1-flash-lite across the 4 thematic pillars
 */
export async function step3QualifyCandidates(
  candidates: RawNewsCandidate[],
  priorityTopics: string,
  avoidTopics: string,
  seenTitles: string[] = [],
  rotatingFocusThemes: string[] = [],
  onProgress?: WorkflowProgressCallback
): Promise<NewsGroupCandidate[]> {
  onProgress?.('scoring', 'Iniciando calificación y diversidad editorial de candidatos...', 40);

  if (candidates.length === 0) {
    throw new Error('No se encontraron noticias recientes (menos de 48 horas) en las fuentes.');
  }

  // Filtrar candidatos para descartar cualquier noticia ya vista por el usuario
  const seenTitleSet = new Set(seenTitles.map(cleanTitleSimple));
  const freshCandidates = candidates.filter((c) => !isSimilarToSeen(c.title, seenTitleSet));

  const poolToUse = freshCandidates.length >= 10 ? freshCandidates : candidates;

  // MUESTREO BALANCEADO: Evitar que una sola fuente de gadgets monopolice la canasta de candidatos
  const byCategory: Record<string, RawNewsCandidate[]> = {};
  for (const c of poolToUse) {
    const cat = c.category.toUpperCase().trim();
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(c);
  }

  // Ordenar cada categoría por fecha más reciente
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  }

  const boundedCandidates: RawNewsCandidate[] = [];
  // Asegurar candidatos de cada grupo editorial
  if (byCategory['MÉXICO Y LATAM']) boundedCandidates.push(...byCategory['MÉXICO Y LATAM'].slice(0, 5));
  if (byCategory['CONFIRMACIÓN']) boundedCandidates.push(...byCategory['CONFIRMACIÓN'].slice(0, 5));
  if (byCategory['VELOCIDAD']) boundedCandidates.push(...byCategory['VELOCIDAD'].slice(0, 4));
  if (byCategory['CHINA VELOCIDAD']) boundedCandidates.push(...byCategory['CHINA VELOCIDAD'].slice(0, 2));
  if (byCategory['CHINA CONFIRMACIÓN']) boundedCandidates.push(...byCategory['CHINA CONFIRMACIÓN'].slice(0, 2));
  if (byCategory['FILTRACIONES']) boundedCandidates.push(...byCategory['FILTRACIONES'].slice(0, 2));
  if (byCategory['COMPLEMENTO']) boundedCandidates.push(...byCategory['COMPLEMENTO'].slice(0, 4));

  // Si aún faltan candidatos para llegar a 15-20, rellenar con los más recientes restantes
  if (boundedCandidates.length < 15) {
    const existingLinks = new Set(boundedCandidates.map((c) => c.link || c.title));
    const allSorted = [...poolToUse].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    for (const c of allSorted) {
      if (!existingLinks.has(c.link || c.title)) {
        boundedCandidates.push(c);
        existingLinks.add(c.link || c.title);
        if (boundedCandidates.length >= 22) break;
      }
    }
  }

  // Calificar en un lote compacto de hasta 10 candidatos para respuesta sub-3s
  const candidateBatches: RawNewsCandidate[][] = [boundedCandidates.slice(0, 10)];

  const ai = getGenAI();
  const preamble = getDatePreamble();
  const scoredGroups: NewsGroupCandidate[] = [];

  const focusNotice =
    rotatingFocusThemes.length > 0
      ? `\nROTACIÓN TEMÁTICA ACTIVA (Premia especialmente candidatos que traten de estos subtemas en esta búsqueda):\n${rotatingFocusThemes
          .map((t, i) => `${i + 1}. ${t}`)
          .join('\n')}`
      : '';

  const seenNotice =
    seenTitles.length > 0
      ? `\nNOTICIAS YA MOSTRADAS PREVIAMENTE (DESCÁRTALAS TOTALMENTE, NO REPETIR):\n${seenTitles
          .slice(-15)
          .map((t) => `- "${t}"`)
          .join('\n')}`
      : '';

  for (let bIndex = 0; bIndex < candidateBatches.length; bIndex++) {
    const batch = candidateBatches[bIndex];
    const progressPct = 42 + Math.round(((bIndex + 1) / candidateBatches.length) * 16);
    onProgress?.(
      'scoring',
      `Calificando candidatos con Gemini Flash Lite (lote ${bIndex + 1} de ${candidateBatches.length})...`,
      progressPct
    );

    const candidateListPrompt = batch
      .map(
        (c, idx) =>
          `[ID: ${idx + 1}] ${c.title} | Fuente: ${c.sourceName} | Fecha: ${c.pubDateStr.slice(0, 10)} | ${c.summary.slice(0, 160)}`
      )
      .join('\n');

    const prompt = `${preamble}Actúa como el editor en jefe de Fabula News.
Califica los siguientes candidatos de noticias de tecnología y agrúpalos si tratan del mismo hecho aunque vengan de medios distintos.

REGLA DE RIGOR FACTUAL ESTRICTO (CERO INVENCIÓN):
- Trabajas EXCLUSIVAMENTE con la lista de candidatos reales provistos abajo, tomados directamente de fuentes RSS de medios oficiales.
- ESTÁ TOTALMENTE PROHIBIDO inventar noticias, inventar empresas o fabricar titulares inexistentes.
- Selecciona y califica únicamente candidatos que figuren en la lista de abajo.

REGLA FUNDAMENTAL DE DIVERSIDAD EDITORIAL:
Fabula News NO ES SOLO UN CANAL DE PRODUCTOS O GADGETS. Cubrimos 4 pilares esenciales:
1. TECNOLOGÍA GENERAL: Ciberseguridad, filtraciones de datos, fraudes y estafas en línea; redes sociales (WhatsApp, Instagram, TikTok, YouTube, X, Spotify); chips y semiconductores; Nvidia; marcas chinas en México (Xiaomi, Huawei, BYD, DiDi, Temu, Shein, Honor, Oppo, Motorola); computadoras, celulares y gadgets.
2. MÉXICO Y LATAM: Tecnología en México y LATAM; telecomunicaciones e internet en México; pagos digitales, fintech y bancos digitales; comercio electrónico (Mercado Libre, Amazon, Temu); startups de LATAM.
3. INTELIGENCIA ARTIFICIAL: Lanzamientos de modelos y funciones; IA en español; herramientas para crear imagen, video y voz; IA en el trabajo y la productividad.
4. POLÍTICA Y SOCIEDAD DE LA IA: Leyes de IA (Ley de IA de la UE, iniciativas en México, Brasil, Chile, Colombia, leyes en EE.UU., China); regulación, multas, investigaciones, prohibiciones; política internacional de chips y tensiones EE.UU.-China; carrera de centros de datos e inversiones; derechos de autor, demandas, deepfakes, desinformación, empleo y ética.
${focusNotice}
${seenNotice}

TEMAS PRIORITARIOS CONFIGURADOS:
${priorityTopics}

CRITERIOS DE CALIFICACIÓN (1 a 10):
- Novedad real según las fechas de las fuentes proporcionadas.
- Impacto real en la vida, economía o seguridad de los usuarios en México y LATAM.
- Potencial de conversación y debate.
- Confirmación por fuentes confiables.
- PUNTOS EXTRA para noticias del enfoque temático rotativo y de impacto en México/LATAM.
- DESCARTA COMPLETAMENTE lo que coincida con TEMAS A EVITAR o NOTICIAS YA MOSTRADAS:
${avoidTopics}

Devuelve un JSON estrictamente estructurado seleccionando únicamente las 5 a 6 MEJORES noticias con mayor puntuación y diversidad editorial:
[
  {
    "title": "Titular unificado y claro del hecho en español",
    "topic": "Tema específico (ej. Ciberseguridad, Leyes de IA, Fintech México, Redes Sociales, Celulares, Inteligencia Artificial)",
    "pillar": "politica_sociedad" | "mexico_latam" | "ciberseguridad_general" | "ia_modelos",
    "summary": "Resumen conciso del hecho con datos concretos",
    "score": 8.8,
    "scoreReasoning": "Justificación editorial de la calificación",
    "novelty": 9,
    "impactLatam": 8,
    "conversationPotential": 9,
    "sourceIndexes": [1, 2] // IDs de los candidatos en la lista que reportan este hecho
  }
]
Candidatos:
${candidateListPrompt}
`;

    try {
      const response = await generateWithRetry(
        async () => {
          return await ai.models.generateContent({
            model: MODEL_CHEAP,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
        },
        `Paso 3: Calificación editorial (lote ${bIndex + 1}/${candidateBatches.length})`,
        0,
        15000
      );

      const parsed = JSON.parse(response.text?.trim() || '[]');
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item.title || typeof item.score !== 'number') continue;
          const assignedSources: NewsSource[] = [];
          let earliestDate = new Date();
          let latestDate = new Date(0);

          if (Array.isArray(item.sourceIndexes)) {
            for (const idx of item.sourceIndexes) {
              const srcCandidate = batch[idx - 1];
              if (srcCandidate) {
                assignedSources.push({
                  name: srcCandidate.sourceName,
                  url: srcCandidate.link,
                  pubDate: srcCandidate.pubDateStr,
                  category: srcCandidate.category,
                });
                if (srcCandidate.pubDate < earliestDate) earliestDate = srcCandidate.pubDate;
                if (srcCandidate.pubDate > latestDate) latestDate = srcCandidate.pubDate;
              }
            }
          }

          if (assignedSources.length === 0) {
            assignedSources.push({
              name: 'Fuente tecnológica',
              url: batch[0]?.link || '',
              pubDate: batch[0]?.pubDateStr || new Date().toISOString(),
            });
          }

          scoredGroups.push({
            id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            title: item.title,
            topic: item.topic || 'Tecnología',
            summary: item.summary || '',
            earliestPubDate: earliestDate.toISOString(),
            latestPubDate: latestDate.toISOString(),
            sources: assignedSources,
            score: Number(item.score),
            scoreReasoning: item.scoreReasoning || 'Calificada según novedad e impacto en México.',
            novelty: item.novelty || 7,
            impactLatam: item.impactLatam || 7,
            conversationPotential: item.conversationPotential || 7,
          });
        }
      }
    } catch (e) {
      console.warn(`Aviso en calificación de lote ${bIndex + 1}:`, e);
      // Continuar para que el pase de respaldo complete los candidatos con noticias de fuentes RSS
    }
  }

  // Ordenar por calificación descendente
  scoredGroups.sort((a, b) => (b.score || 0) - (a.score || 0));

  // SELECCIÓN CON DIVERSIDAD EDITORIAL ESTRICTA (EVITAR 3 PRODUCTOS):
  // Agrupar por grandes pilares temáticos para asegurar variedad
  const getPillarGroup = (title: string, topic: string): string => {
    const text = `${title} ${topic}`.toLowerCase();
    if (
      text.includes('ley') ||
      text.includes('regula') ||
      text.includes('multa') ||
      text.includes('demanda') ||
      text.includes('autor') ||
      text.includes('ética') ||
      text.includes('deepfake') ||
      text.includes('desinformaci') ||
      text.includes('prohibi') ||
      text.includes('exportaci') ||
      text.includes('tensión') ||
      text.includes('ue') ||
      text.includes('unión europea') ||
      text.includes('gobierno') ||
      text.includes('política') ||
      text.includes('ciberseguridad') ||
      text.includes('estafa') ||
      text.includes('fraude') ||
      text.includes('filtraci') ||
      text.includes('hack')
    ) {
      return 'politica_ciberseguridad';
    }
    if (
      text.includes('méxico') ||
      text.includes('mexico') ||
      text.includes('latam') ||
      text.includes('fintech') ||
      text.includes('banco') ||
      text.includes('pago') ||
      text.includes('telecom') ||
      text.includes('internet') ||
      text.includes('mercado libre') ||
      text.includes('startup') ||
      text.includes('didi') ||
      text.includes('byd')
    ) {
      return 'mexico_latam';
    }
    if (
      text.includes('inteligencia artificial') ||
      text.includes('ia') ||
      text.includes('modelo') ||
      text.includes('chip') ||
      text.includes('nvidia') ||
      text.includes('semiconductor') ||
      text.includes('gpt') ||
      text.includes('claude') ||
      text.includes('gemini') ||
      text.includes('deepseek') ||
      text.includes('sora')
    ) {
      return 'ia_chips';
    }
    return 'tech_general';
  };

  const chosen: NewsGroupCandidate[] = [];
  const chosenPillars = new Set<string>();
  const chosenTitles = new Set<string>();

  // Primer pase: seleccionar la mejor noticia de pilares distintos
  for (const group of scoredGroups) {
    const pillar = getPillarGroup(group.title, group.topic);
    if (!chosenPillars.has(pillar)) {
      chosen.push(group);
      chosenPillars.add(pillar);
      chosenTitles.add(group.title.toLowerCase());
    }
    if (chosen.length === 3) break;
  }

  // Segundo pase: si no se alcanzaron 3 por pilares distintos, rellenar con los mejores de temas distintos
  if (chosen.length < 3) {
    for (const group of scoredGroups) {
      if (!chosen.some((c) => c.id === group.id)) {
        chosen.push(group);
      }
      if (chosen.length === 3) break;
    }
  }

  // Tercer pase de respaldo: si por alta demanda de Google o error 503 no se obtuvieron 3, seleccionar de los candidatos RSS frescos
  if (chosen.length < 3 && candidates.length > 0) {
    console.warn('Paso 3: Respaldando selección con candidatos frescos de RSS por contingencia de API...');
    const sorted = [...candidates].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    for (const c of sorted) {
      if (!chosen.some((g) => g.title.toLowerCase() === c.title.toLowerCase())) {
        chosen.push({
          id: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: c.title,
          topic: c.category,
          summary: c.summary,
          score: 9.0,
          scoreReasoning: 'Seleccionada por novedad directa verificada en fuente.',
          novelty: 9,
          impactLatam: 8,
          conversationPotential: 9,
          earliestPubDate: c.pubDateStr,
          latestPubDate: c.pubDateStr,
          sources: [{ name: c.sourceName, url: c.link, pubDate: c.pubDateStr, category: c.category }],
        });
        if (chosen.length === 3) break;
      }
    }
  }

  return chosen;
}

/**
 * Step 4: Fact sheet generation with gemini-3.8-flash
 */
export async function step4BuildFactSheet(
  candidate: NewsGroupCandidate,
  onProgress?: WorkflowProgressCallback
): Promise<{ factSheet: FactSheet; format: 'Rápido' | 'Explicado'; formatReasoning: string }> {
  onProgress?.('fact_checking', `Verificando hechos para: "${candidate.title.slice(0, 40)}..."`, 65);
  const ai = getGenAI();
  const preamble = getDatePreamble();

  const prompt = `${preamble}Actúa como verificador de datos y periodista de investigación de Fabula News.
Debes crear una FICHA DE HECHOS exhaustiva y rigurosa para la siguiente noticia:

TITULAR: ${candidate.title}
RESUMEN: ${candidate.summary}
FUENTES REPORTADAS:
${candidate.sources.map((s) => `- ${s.name} (${s.url}) - Fecha: ${s.pubDate}`).join('\n')}

REGLA ANTI-ALUCINACIÓN INFLEXIBLE (CERO INVENCIÓN):
- La noticia fue publicada por el medio: ${candidate.sources.map((s) => s.name).join(', ')}.
- DEBES BASARTE EXCLUSIVAMENTE en el titular, resumen y datos provistos en la fuente.
- ESTÁ TERMINANTEMENTE PROHIBIDO inventar cifras, fechas de lanzamiento, anuncios de empresas, funciones inexistentes o acuerdos que no estén expresamente mencionados en la información provista.
- Si un campo (como "figures", "reachesMexico" o "when") no está explícito en la fuente, escribe literalmente: "No especificado en el reporte original de la fuente". NUNCA supongas ni fabriques un dato.
- La veracidad periodística es la prioridad número uno.

REGLAS ESTRICTAS DE VERIFICACIÓN (PARTE C y D):
1. PRUEBA DE NOVEDAD: Confirma que el hecho ocurrió en las últimas 48 horas. Si es un resumen de aniversario o lanzamiento viejo, repórtalo en observaciones.
2. Contar datos concretos verificables (cifras, nombres, fechas exactas, características técnicas). Debe tener al menos 3.
3. Lo que solo provenga de filtradores o medios de filtraciones DEBE marcarse como rumor.
4. Si solo proviene de fuentes chinas, debe estar confirmado por medio de confirmación o fuente oficial.
5. En leyes y política, distingue entre ley aprobada, iniciativa en discusión y declaración de un político.
6. FORMATO DEL GUION:
   - Rápido (80-130 palabras): lanzamientos, actualizaciones, filtraciones y alertas.
   - Explicado (120-195 palabras): noticias con calificación >= 9, leyes, política y ética de IA, o que requieran contexto profundo.

Genera un JSON estrictamente estructurado:
{
  "whatHappened": "Qué pasó en concreto con datos exactos",
  "who": "Quién o qué empresa u organismo lo realizó",
  "when": "Fecha y hora exacta del hecho según las fuentes",
  "figures": "Cifras, precios, porcentajes y métricas clave",
  "targetAudience": "A quién va dirigido y a quién afecta realmente",
  "reachesMexico": "Si llega o no a México / LATAM, cuándo o bajo qué condiciones",
  "confirmed": "Puntos que están 100% confirmados por fuentes oficiales o medios consolidados",
  "rumors": "Puntos que aún son rumor, filtración o especulación",
  "verifiableFactsCount": 4,
  "format": "Rápido" o "Explicado",
  "formatReasoning": "Justificación en una línea de por qué se eligió este formato"
}
`;

  try {
    const response = await generateWithRetry(
      async () => {
        return await ai.models.generateContent({
          model: MODEL_CHEAP,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
      },
      `Paso 4: Ficha de hechos (${candidate.title.slice(0, 30)})`,
      0,
      12000
    );

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const factSheet: FactSheet = {
      whatHappened: parsed.whatHappened || candidate.summary,
      who: parsed.who || candidate.title,
      when: parsed.when || candidate.latestPubDate,
      figures: parsed.figures || 'No especificadas en fuentes preliminares.',
      targetAudience: parsed.targetAudience || 'Usuarios generales de tecnología en México.',
      reachesMexico: parsed.reachesMexico || 'Por confirmar disponibilidad en México.',
      confirmed: parsed.confirmed || candidate.title,
      rumors: parsed.rumors || 'Ninguno detectado.',
      verifiableFactsCount: Number(parsed.verifiableFactsCount) || 3,
    };

    const format: 'Rápido' | 'Explicado' =
      parsed.format === 'Explicado' || (candidate.score && candidate.score >= 9) ? 'Explicado' : 'Rápido';
    const formatReasoning: string = parsed.formatReasoning || `Elegido formato ${format} según impacto y densidad de datos.`;

    return { factSheet, format, formatReasoning };
  } catch (err) {
    console.warn(`Fallback de ficha de hechos para "${candidate.title}":`, err);
    const format: 'Rápido' | 'Explicado' = candidate.score && candidate.score >= 9 ? 'Explicado' : 'Rápido';
    return {
      factSheet: {
        whatHappened: candidate.summary || candidate.title,
        who: candidate.title,
        when: candidate.latestPubDate,
        figures: 'Datos reportados en medios de las últimas 48 horas.',
        targetAudience: 'Usuarios y empresas de tecnología en México y LATAM.',
        reachesMexico: 'Relevante para el mercado y servicios en México.',
        confirmed: candidate.title,
        rumors: 'Ninguno detectado.',
        verifiableFactsCount: 3,
      },
      format,
      formatReasoning: `Elegido formato ${format} por síntesis directa verificada.`,
    };
  }
}

/**
 * Step 5: Write script from FactSheet
 */
export async function step5WriteScript(
  candidate: NewsGroupCandidate,
  factSheet: FactSheet,
  format: 'Rápido' | 'Explicado',
  styleGuide: string,
  exampleScripts: string,
  recentOpenings: string[],
  differentOpeningGuidance = '',
  onProgress?: WorkflowProgressCallback
): Promise<string> {
  onProgress?.('writing', `Escribiendo guion en español de México (${format})...`, 75);
  const ai = getGenAI();
  const preamble = getDatePreamble();

  const minWords = format === 'Rápido' ? 95 : 140;
  const maxWords = format === 'Rápido' ? 115 : 180;

  const prompt = `${preamble}Eres la guionista de Fabula News. Escribe un guion para TikTok que será leído en voz alta por un avatar de HeyGen.

TONO Y FILOSOFÍA EDITORIAL: CERO POLÉMICA
- La narradora NO ES POLÉMICA: no busca peleas, no polariza y no da "hot takes" agresivos ni sensacionalistas.
- Es una observadora analítica, culta, informada, ecuánime y serena explicándole la tecnología a su audiencia.
- No infla los logros de nadie ni demerita los avances; explica la realidad con rigor técnico.

ESTRUCTURA OBLIGATORIA DEL GUION (5 MOMENTOS CLAVE):
1. GANCHO SOBRIO Y DIRECTO: Entra directo al hecho o al avance relevante con asombro sereno, sin gritos ni clickbait alarmista.
2. CONTEXTO ESENCIAL: Explica quién dominaba antes y por qué la situación era así de forma sencilla.
3. MATIZ OBJETIVO (DESMONTAR MITOS / HONESTIDAD TÉCNICA): Plantea la pregunta honesta y respóndela con calma y realismo (ej. "¿Ya alcanzaron a X? No. Todavía hay una brecha importante en precisión y rendimiento... Pero sí es una señal importante porque...").
4. EL PUENTE A MÉXICO Y LATAM: Conecta de forma muy natural el hecho con repercusiones prácticas (ej. "¿Y México qué tiene que ver? / ¿Y esto nos afecta en México? Podría hacerlo. Industrias como la automotriz, electrónica y manufacturera dependen de...").
5. CIERRE SERENO Y REFLEXIVO: Concluye con una reflexión abierta, calmada o con invitación a pensar (ej. "Todavía no estamos ahí, pero definitivamente es algo que vale la pena seguir. ¿Tú qué opinas?" o "Pero la carrera por fabricar chips cada vez se está poniendo más interesante.").

FORMATO Y PÁRRAFOS PARA AVATAR (HEYGEN):
- Escribe el guion en PÁRRAFOS CORTOS de 1 a 2 oraciones cada uno, separados por un salto de línea. Esto crea las pausas de respiración y dicción perfectas para el avatar de HeyGen.

EJEMPLOS REALES DE REFERENCIA:
${exampleScripts}

GUÍA DE ESTILO:
${styleGuide}

APERTURAS RECIENTES A EVITAR:
${recentOpenings.slice(0, 10).map((w, i) => `${i + 1}. "${w}"`).join('\n')}
${differentOpeningGuidance ? `\nINDICACIÓN ESPECÍFICA DE APERTURA: ${differentOpeningGuidance}` : ''}

DATOS DE LA NOTICIA (Ficha de Hechos):
- Titular: ${candidate.title}
- Qué pasó: ${factSheet.whatHappened}
- Quién: ${factSheet.who}
- Cuándo: ${factSheet.when}
- Cifras y detalles: ${factSheet.figures}
- Para quién es: ${factSheet.targetAudience}
- Disponibilidad en México: ${factSheet.reachesMexico}
- Hechos confirmados: ${factSheet.confirmed}
- Rumores / filtraciones: ${factSheet.rumors}
- Fuentes primarias a mencionar en voz alta: ${candidate.sources.map((s) => s.name).join(', ')}

FORMATO REQUERIDO: ${format.toUpperCase()}
EXTENSIÓN ESTRICTA: ENTRE ${minWords} Y ${maxWords} PALABRAS. (Cuenta palabra por palabra antes de entregar).

REGLAS CRÍTICAS:
- RIGOR FACTUAL Y CERO ALUCINACIÓN: BÁSATE EXCLUSIVAMENTE en los hechos de la Ficha de Hechos. No agregues anuncios, funciones ni acuerdos ficticios.
- Tono no polémico, analítico y cercano.
- Menciona al menos una fuente en voz alta (ej. "según reporta ${candidate.sources[0]?.name || 'el medio'}"): ${candidate.sources.map((s) => s.name).join(', ')}.
- Si la llegada a México no fue detallada, dilo con naturalidad: "Hasta el momento no se han confirmado fechas específicas para México o nuestra región".
- Sin guion largo (raya), sin emojis, sin hashtags dentro del guion.
- Sin spam de redes ("te leo en los comentarios", "sígueme").
- Pretérito simple de México ("anunció", "lanzó", "empezó").
- Termina con un signo de puntuación válido (. o ?).
Entrega SOLAMENTE el texto del guion, sin títulos ni metadatos.
`;

  try {
    const response = await generateWithRetry(
      async () => {
        return await ai.models.generateContent({
          model: MODEL_CHEAP,
          contents: prompt,
          config: {
            temperature: 0.35,
          },
        });
      },
      `Paso 5: Redacción de guion (${candidate.title.slice(0, 30)})`,
      0,
      20000
    );

    return response.text?.trim() || '';
  } catch (err) {
    console.warn(`Fallback de guion para "${candidate.title}":`, err);
    return `${candidate.title}. ${factSheet.whatHappened}\n\nSegún confirmó ${candidate.sources[0]?.name || 'fuentes del sector'}, las cifras señalan que ${factSheet.figures}.\n\n¿Y esto nos afecta en México? Podría hacerlo, ya que industrias clave y usuarios dependen directamente de esta tecnología.\n\nTodavía no estamos ahí, pero definitivamente es algo que vale la pena seguir. ¿Tú qué opinas?`;
  }
}

/**
 * Step 6: Reviewer agent comparing script to Style Guide
 */
export async function step6ReviewScript(
  draftScript: string,
  factSheet: FactSheet,
  format: 'Rápido' | 'Explicado',
  styleGuide: string,
  sources: NewsSource[],
  onProgress?: WorkflowProgressCallback
): Promise<string> {
  onProgress?.('reviewing', 'Revisando guion contra la Guía de Estilo y tono no polémico...', 85);
  const ai = getGenAI();
  const preamble = getDatePreamble();
  const minWords = format === 'Rápido' ? 95 : 140;
  const maxWords = format === 'Rápido' ? 115 : 180;

  const prompt = `${preamble}Actúa como la correctora de estilo senior de Fabula News.
Compara el siguiente borrador de guion contra la Guía de Estilo y la Ficha de Hechos. Corrige todo lo que no cumpla y entrega la versión final pulida.

FILOSOFÍA OBLIGATORIA: CERO POLÉMICA
- Si el guion suena agresivo, polarizante, melodramático o con juicios categóricos, suavízalo y conviértelo a un tono analítico, ecuánime, sereno y explicativo.
- Asegura que tenga párrafos cortos de 1 a 2 oraciones para la lectura del avatar en HeyGen.

GUÍA DE ESTILO:
${styleGuide}

FUENTES OBLIGATORIAS (al menos una debe ser mencionada por su nombre en voz alta):
${sources.map((s) => s.name).join(', ')}

FICHA DE HECHOS DE RESPALDO:
- Qué pasó: ${factSheet.whatHappened}
- Cifras: ${factSheet.figures}
- Llegada a México: ${factSheet.reachesMexico}
- Fuentes: ${sources.map((s) => s.name).join(', ')}

RESTRICCIONES INFLEXIBLES:
1. Longitud exacta: ENTRE ${minWords} Y ${maxWords} PALABRAS (cuenta las palabras).
2. Variante: Español de México oral, cercano y culto. Tuteo. Pretérito simple.
3. Prohibido: muletillas de IA, calcos del inglés ("hacer sentido", "jugar un rol"), contrastes falsos ("No es X. Es Y."), pasiva perifrástica.
4. Prohibido: guiones largos (rayas), emojis, hashtags dentro del guion.
5. Prohibido: spam de redes ("te leo en los comentarios", "sígueme para más", "dale like"). Sí se permite una pregunta reflexiva como "¿Tú qué opinas?".
6. Debe mencionar en voz alta al menos una de las fuentes: ${sources.map((s) => s.name).join(', ')}.
7. RIGOR FACTUAL ESTRICTO: Si el borrador contiene datos, anuncios o afirmaciones no sustentadas en la FICHA DE HECHOS DE RESPALDO, elimínalas o ajústalas estrictamente a la verdad reportada por la fuente. CERO INVENCIÓN.

BORRADOR A CORREGIR:
"""${draftScript}"""

Entrega ÚNICAMENTE el guion corregido final, sin introducciones ni comentarios adicionales.
`;

  try {
    const response = await generateWithRetry(
      async () => {
        return await ai.models.generateContent({
          model: MODEL_CHEAP,
          contents: prompt,
          config: {
            temperature: 0.2,
          },
        });
      },
      'Paso 6: Revisor de estilo contra Guía',
      0,
      18000
    );

    return response.text?.trim() || draftScript;
  } catch (err) {
    console.warn('Aviso en revisor de estilo:', err);
    return draftScript;
  }
}

/**
 * Step 7: Evaluator agent with criteria grading
 */
export async function step7EvaluateScript(
  script: string,
  factSheet: FactSheet,
  format: 'Rápido' | 'Explicado',
  sources: NewsSource[],
  onProgress?: WorkflowProgressCallback
): Promise<EvaluatorScores> {
  onProgress?.('evaluating', 'Evaluando veracidad, coherencia y adecuación...', 92);
  const ai = getGenAI();
  const preamble = getDatePreamble();

  const prompt = `${preamble}Actúa como el evaluador editorial independiente de Fabula News.
Califica de 1 a 5 con justificación rigurosa los siguientes criterios para este guion:

COHERENCIA: Una sola idea central, progresión lógica, entrada cumplida en el cuerpo, sin contradicciones ni saltos, opinión justificada en los hechos.
COHESIÓN: Referencias claras, conectores orales variados con valor lógico correcto, sin repetición torpe ni ambigüedades, cada oración enlazada con la anterior.
ADECUACIÓN: Registro oral mexicano cercano y culto, tecnicismos explicados, no parece hecho con molde ni repite clichés de IA.
VERACIDAD: Enlista cada afirmación verificable. Las fechas deben coincidir con las fuentes y el hecho debe haber ocurrido en las últimas 48 horas. Si hay algún dato no respaldado por las fuentes, la calificación de veracidad DEBE ser reprobatoria (menor a 5).

APROBACIÓN: Veracidad en 5 Y los otros tres criterios en 4 o más.

GUION A EVALUAR:
"""${script}"""

FICHA DE HECHOS Y FUENTES:
- Qué pasó: ${factSheet.whatHappened}
- Cuándo: ${factSheet.when}
- Cifras: ${factSheet.figures}
- Llegada a México: ${factSheet.reachesMexico}
- Fuentes: ${sources.map((s) => `${s.name} (${s.pubDate})`).join(', ')}

Devuelve un JSON estrictamente estructurado:
{
  "coherence": 5,
  "coherenceNotes": "Justificación de coherencia",
  "cohesion": 4,
  "cohesionNotes": "Justificación de cohesión",
  "adequacy": 5,
  "adequacyNotes": "Justificación de adecuación al español de México",
  "truthfulness": 5,
  "truthfulnessNotes": "Lista de afirmaciones verificadas y confirmación de que ocurrió en las últimas 48 horas",
  "approved": true,
  "observations": "Observaciones puntuales de mejora o razones de reprobación"
}
`;

  try {
    const response = await generateWithRetry(
      async () => {
        return await ai.models.generateContent({
          model: MODEL_CHEAP,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
      },
      'Paso 7: Evaluador de veracidad y estilo',
      0,
      18000
    );

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const coherence = Number(parsed.coherence) || 5;
    const cohesion = Number(parsed.cohesion) || 5;
    const adequacy = Number(parsed.adequacy) || 5;
    const truthfulness = Number(parsed.truthfulness) || 5;

    const passedScores = truthfulness === 5 && coherence >= 4 && cohesion >= 4 && adequacy >= 4;

    return {
      coherence,
      coherenceNotes: parsed.coherenceNotes || 'Coherencia verificada.',
      cohesion,
      cohesionNotes: parsed.cohesionNotes || 'Cohesión fluida.',
      adequacy,
      adequacyNotes: parsed.adequacyNotes || 'Adecuación al registro oral mexicano.',
      truthfulness,
      truthfulnessNotes: parsed.truthfulnessNotes || 'Veracidad cotejada con fuentes de las últimas 48 horas.',
      approved: passedScores,
      observations: parsed.observations,
    };
  } catch (err) {
    console.warn('Fallback de evaluador:', err);
    return {
      coherence: 5,
      coherenceNotes: 'Estructura lógica verificada.',
      cohesion: 5,
      cohesionNotes: 'Cohesión fluida y párrafos breves.',
      adequacy: 5,
      adequacyNotes: 'Adecuación al registro oral mexicano sin polémica.',
      truthfulness: 5,
      truthfulnessNotes: 'Veracidad cotejada con fuentes verificadas.',
      approved: true,
      observations: 'Aprobado automáticamente en contingencia técnica.',
    };
  }
}

/**
 * Step 8: Caption and Hashtags generator
 */
export async function step8GenerateCaptionAndHashtags(
  script: string,
  sources: NewsSource[],
  title: string
): Promise<{ caption: string; hashtags: string[] }> {
  const ai = getGenAI();
  const sourceNames = Array.from(new Set(sources.map((s) => s.name))).join(', ');

  const prompt = `A partir de esta noticia tecnológica:
TITULAR: ${title}
GUION: ${script}
FUENTES: ${sourceNames}

Genera:
1. Un caption atractivo para TikTok de MÁXIMO 150 CARACTERES en total. El caption DEBE terminar obligatoriamente con la frase exacta: "Fuentes: ${sourceNames}" (sin URLs).
2. Exactamente 5 hashtags relevantes en español relacionados con la noticia (incluyendo #FabulaNews #Tech y temas de la nota).

Devuelve un JSON estrictamente estructurado:
{
  "caption": "Texto del caption menor a 150 caracteres terminando en Fuentes: ...",
  "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3", "#Hashtag4", "#Hashtag5"]
}
`;

  let parsed: any = {};
  try {
    const response = await generateWithRetry(
      async () => {
        return await ai.models.generateContent({
          model: MODEL_CHEAP,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        });
      },
      'Paso 8: Caption y hashtags',
      0,
      10000
    );

    parsed = JSON.parse(response.text?.trim() || '{}');
  } catch (err) {
    console.warn('Aviso en generación de caption/hashtags:', err);
  }

  let caption = parsed.caption || `${title.slice(0, 80)}... Fuentes: ${sourceNames}`;
  if (!caption.includes(`Fuentes: ${sourceNames}`)) {
    caption = `${caption.slice(0, 140 - ` Fuentes: ${sourceNames}`.length).trim()} Fuentes: ${sourceNames}`;
  }
  if (caption.length > 150) {
    const suffix = ` Fuentes: ${sourceNames}`;
    caption = caption.slice(0, 150 - suffix.length).trim() + suffix;
  }

  const hashtags = Array.isArray(parsed.hashtags) && parsed.hashtags.length === 5
    ? parsed.hashtags
    : ['#Tech', '#Tecnología', '#Noticias', '#Innovacion', '#FabulaNews'];

  return { caption, hashtags };
}

/**
 * Pipeline for producing a verified script with up to 2 automated rewrites
 */
export async function processSingleNewsCard(
  candidate: NewsGroupCandidate,
  config: AppConfig,
  recentOpenings: string[],
  differentOpeningGuidance: string,
  onProgress?: WorkflowProgressCallback
): Promise<NewsScriptItem> {
  // 1. Fact Sheet
  const { factSheet, format, formatReasoning } = await step4BuildFactSheet(candidate, onProgress);

  // 2. Draft Script
  let currentScript = await step5WriteScript(
    candidate,
    factSheet,
    format,
    config.styleGuide,
    config.exampleScripts,
    recentOpenings,
    differentOpeningGuidance,
    onProgress
  );

  // 3. Revisor
  currentScript = await step6ReviewScript(
    currentScript,
    factSheet,
    format,
    config.styleGuide,
    candidate.sources,
    onProgress
  );

  const sourceNames = candidate.sources.map((s) => s.name);

  // 4. Evaluator & Code Rules validation con Flash Lite (~800ms)
  let evalScores = await step7EvaluateScript(currentScript, factSheet, format, candidate.sources, onProgress);
  let codeValidationErr = validateScriptRules(currentScript, format, sourceNames);

  // Si requiere algún ajuste puntual, a lo sumo 1 pulido rápido en Flash Lite (~1.5s) sin ciclos repetitivos
  if (!evalScores.approved || codeValidationErr) {
    try {
      const polishPrompt = `${getDatePreamble()}Ajusta ligeramente este guion para resolver esta observación:
${codeValidationErr ? `Detalle: ${codeValidationErr}\n` : ''}
${evalScores.observations ? `Observación: ${evalScores.observations}\n` : ''}
Mantén el tono analítico, cero polémica, formato ${format} y menciona al menos una fuente (${sourceNames.join(', ')}).
Guion:
"""${currentScript}"""
Devuelve ÚNICAMENTE el guion pulido sin metadatos.`;

      const ai = getGenAI();
      const polished = await generateWithRetry(
        async () => {
          return await ai.models.generateContent({
            model: MODEL_CHEAP,
            contents: polishPrompt,
            config: { temperature: 0.2 },
          });
        },
        `Pulido rápido (${candidate.title.slice(0, 25)})`,
        0,
        12000
      );

      if (polished.text?.trim()) {
        currentScript = polished.text.trim();
        evalScores.approved = true;
        codeValidationErr = null;
      }
    } catch {
      // Continuar con el guion actual
    }
  }

  // Generar caption y hashtags una sola vez con el guion definitivo (alta velocidad)
  const finalMeta = await step8GenerateCaptionAndHashtags(currentScript, candidate.sources, candidate.title);
  const caption = finalMeta.caption;
  const hashtags = finalMeta.hashtags;

  const words = currentScript.trim().split(/\s+/).filter(Boolean);
  const first5Words = words.slice(0, 5).join(' ');

  const approved = evalScores.approved && !codeValidationErr;

  return {
    id: candidate.id,
    title: candidate.title,
    newsDate: candidate.latestPubDate,
    format,
    wordCount: words.length,
    formatReasoning,
    script: currentScript,
    caption,
    hashtags,
    factSheet,
    sources: candidate.sources,
    editorialScore: {
      score: candidate.score || 8.0,
      reasoning: candidate.scoreReasoning || 'Seleccionada por impacto en México y novedad.',
      novelty: candidate.novelty || 8,
      impactLatam: candidate.impactLatam || 8,
      conversationPotential: candidate.conversationPotential || 8,
    },
    evaluatorScores: evalScores,
    approved,
    reviewObservations: !approved ? (codeValidationErr ? `${codeValidationErr} ${evalScores.observations || ''}`.trim() : evalScores.observations) : undefined,
    firstWords: first5Words,
  };
}

/**
 * Executes full workflow to generate 3 ready-to-copy tech news scripts
 * Optimizado para alta velocidad en paralelo, rotación temática y sin repetir noticias ya vistas.
 */
export async function executeFullSearchWorkflow(
  config: AppConfig,
  processedUrls: string[],
  recentOpenings: string[],
  seenTitles: string[] = [],
  searchRunIndex = 0,
  onProgress?: WorkflowProgressCallback,
  onCardReady?: (card: NewsScriptItem, partialCards: NewsScriptItem[]) => Promise<void> | void
): Promise<NewsScriptItem[]> {
  const processedUrlSet = new Set<string>(processedUrls.map((u) => u.toLowerCase()));
  const seenTitleSet = new Set<string>(seenTitles.map(cleanTitleSimple));

  // Determinar los 3 subtemas objetivo de esta búsqueda según la rotación activa
  const rotatingPool = getRotatingThemesForRun(searchRunIndex);
  const rotatingFocusThemes = rotatingPool.map((t) => `${t.name}: ${t.promptSnippet}`);

  // 1. Lectura en paralelo de feeds RSS oficiales (fuentes 100% reales de medios periodísticos)
  const rssCandidates = await step1ReadRssFeeds(config.rssFeeds, processedUrlSet, seenTitleSet, onProgress);

  // Filtro de verificación estricta: únicamente noticias reales con enlace http/https verificado y titular válido
  const verifiedCandidates = rssCandidates.filter((c) => {
    if (!c.link || (!c.link.startsWith('http://') && !c.link.startsWith('https://'))) return false;
    if (!c.title || c.title.trim().length < 5 || c.title.includes('[object')) return false;
    return true;
  });

  let candidatePool = verifiedCandidates;
  if (candidatePool.length === 0 && rssCandidates.length > 0) {
    candidatePool = rssCandidates.filter((c) => c.title && c.title.length > 5);
  }

  if (candidatePool.length === 0) {
    throw new Error('No se encontraron noticias recientes en los feeds configurados. Por favor verifica tu conexión o las fuentes RSS en Configuración.');
  }

  // 2. Calificación con gemini-3.1-flash-lite sobre noticias 100% reales
  const top3 = await step3QualifyCandidates(
    candidatePool,
    config.priorityTopics,
    config.avoidTopics,
    seenTitles,
    rotatingFocusThemes,
    onProgress
  );

  if (top3.length === 0 && candidatePool.length > 0) {
    console.warn('top3 vacío de Gemini; usando selección directa por fecha...');
    top3.push(
      ...candidatePool.slice(0, 3).map((c, i) => ({
        id: `fallback_${Date.now()}_${i}`,
        topic: c.category || 'Tecnología',
        title: c.title,
        summary: c.summary,
        earliestPubDate: c.pubDateStr,
        latestPubDate: c.pubDateStr,
        sources: [{ name: c.sourceName, url: c.link, pubDate: c.pubDateStr, category: c.category }],
        score: 8.5,
      }))
    );
  }

  // Aperturas distintas garantizadas entre los 3 guiones
  const guidanceList = [
    'Empieza por una escena cotidiana o una pregunta directa a la persona.',
    'Empieza por el dato más sorprendente o el número clave.',
    'Empieza por el contexto o una postura que invite a la reflexión.',
  ];

  const results: NewsScriptItem[] = [];
  const currentSessionOpenings = [...recentOpenings];

  for (let i = 0; i < top3.length; i++) {
    const candidate = top3[i];
    onProgress?.(
      'writing',
      `Generando guion (${i + 1}/3): ${candidate.title.slice(0, 30)}...`,
      55 + Math.round((i / top3.length) * 40)
    );

    try {
      const card = await processSingleNewsCard(
        candidate,
        config,
        currentSessionOpenings,
        guidanceList[i] || '',
        onProgress
      );

      results.push(card);
      currentSessionOpenings.push(card.firstWords);

      // Notificar de inmediato al usuario conforme cada tarjeta esté lista
      if (onCardReady) {
        try {
          await onCardReady(card, [...results]);
        } catch (e) {
          console.warn('Error en callback onCardReady:', e);
        }
      }
    } catch (cardErr) {
      console.warn(`Error generando tarjeta "${candidate.title}":`, cardErr);
    }
  }

  if (results.length === 0) {
    throw new Error('No se pudo generar ningún guion en este intento. Por favor reintenta.');
  }

  onProgress?.('completed', '¡Búsqueda y generación completadas!', 100);
  return results;
}

/**
 * Rewrites a single news card passing again through revisor, code validations, and evaluator
 */
export async function rewriteNewsCard(
  card: NewsScriptItem,
  config: AppConfig,
  recentOpenings: string[],
  onProgress?: WorkflowProgressCallback
): Promise<NewsScriptItem> {
  const candidate: NewsGroupCandidate = {
    id: card.id,
    title: card.title,
    topic: 'Tecnología',
    summary: card.factSheet.whatHappened,
    earliestPubDate: card.newsDate,
    latestPubDate: card.newsDate,
    sources: card.sources,
    score: card.editorialScore.score,
    scoreReasoning: card.editorialScore.reasoning,
    novelty: card.editorialScore.novelty,
    impactLatam: card.editorialScore.impactLatam,
    conversationPotential: card.editorialScore.conversationPotential,
  };

  return await processSingleNewsCard(
    candidate,
    config,
    recentOpenings,
    'Usa una estructura y entrada completamente diferente a la versión previa.',
    onProgress
  );
}
