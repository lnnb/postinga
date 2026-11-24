/**
 * Postinga
 * Motores de redacción con IA (opcionales): Google Gemini y cualquier
 * endpoint compatible con OpenAI (OpenAI, Ollama, LM Studio, proxies).
 *
 * El motor local siempre corre primero y sirve de base y de red de seguridad.
 */

const AI_DEFAULTS = {
  geminiModel: 'gemini-2.5-flash',
  openaiBase: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini'
};

const GEMINI_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

function isLocalAiBase(base) {
  const value = String(base || '').trim();
  if (!value) return false;
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(value) || /^https?:\/\/[^/]+\.local(?::|\/|$)/i.test(value);
}

function aiHasKey(engine, keys, base) {
  if (engine === 'gemini') return Boolean(keys && String(keys.gemini || '').trim());
  if (engine === 'openai') return Boolean(keys && String(keys.openai || '').trim()) || isLocalAiBase(base);
  return true;
}

function aiEngineLabel(engine) {
  return engine === 'gemini' ? 'Gemini' : engine === 'openai' ? 'OpenAI' : 'Local';
}

function aiText(value, max = 0) {
  let text = Array.isArray(value) ? value.join('\n\n') : String(value ?? '');
  text = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
    .trim();
  if (max > 0 && text.length > max) text = text.slice(0, max).replace(/\s+\S*$/, '').trim();
  return text;
}

function aiParagraphs(value) {
  let text = aiText(value, 2600);
  if (!text) return '';
  if (!/\n\s*\n/.test(text) && /\n/.test(text)) {
    text = text.split('\n').map(part => part.trim()).filter(Boolean).join('\n\n');
  }
  return text;
}

function aiArray(value) {
  return Array.isArray(value) ? value : [];
}

function aiColor(value, fallback = 'gris') {
  const color = String(value || '').toLowerCase().trim();
  return COLORS.some(item => item[0] === color) ? color : fallback;
}

function aiTag(value) {
  return String(value || '')
    .replace(/[^\p{L}\p{N} ·/+&-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 18);
}

function normalizeAiItems(items, baselineItems) {
  const validColors = new Set(COLORS.map(color => color[0]));
  const result = [];
  const seen = new Set();

  aiArray(items).slice(0, 8).forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const name = aiText(item.name, 82);
    const desc = aiText(item.desc, 300);
    if (!name && !desc) return;
    // Encabezados de reseña y secciones del sitio no son características.
    if (name && (isReviewMeta(name) || isNavSection(name))) return;
    const dedupeKey = (name || desc).toLowerCase().slice(0, 40);
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    let tag = aiTag(item.tag);
    let color = validColors.has(String(item.color || '').toLowerCase()) ? String(item.color).toLowerCase() : '';
    if (!tag) {
      const guessed = classifyTag(name, desc, index);
      tag = guessed.tag;
      if (!color) color = guessed.color;
    }
    if (!color) color = classifyTag(name, desc, index).color;
    result.push({ tag, color, name, desc });
  });

  if (result.length >= 2) return result;
  return baselineItems && baselineItems.length ? baselineItems : result;
}

function normalizeAiSpecs(specs, baselineSpecs) {
  const result = [];
  const seen = new Set();
  aiArray(specs).slice(0, 8).forEach(spec => {
    if (!spec || typeof spec !== 'object') return;
    const key = aiText(spec.k, 28);
    const value = aiText(spec.v, 180);
    if (!key || !value) return;
    const normalized = normalizeCompare(key);
    if (!normalized || seen.has(normalized)) return;
    if (/^(leer|ver|compartir|fuente|imagen|video|nota)$/.test(normalized)) return;
    // Claves rotas (restos de markdown o links) y categorías de sitio.
    if (/[\[\](){}<>|\\]|https?:/i.test(key)) return;
    if (/^(downloads?|posts?|descargas?|blog|news|noticias|uncategorized|general|categorias?)$/i.test(normalized)) return;
    seen.add(normalized);
    result.push({ k: key, v: value });
  });
  if (result.length >= 2) return result;
  if (baselineSpecs && baselineSpecs.length) return baselineSpecs;
  return result;
}

function normalizeAiLinks(links, baselineLinks, baseline, maxButtons, excludedHosts = []) {
  const allowed = new Set();
  const addAllowed = url => {
    const safe = safeHttpUrl(url);
    if (safe) allowed.add(safe);
  };
  if (baseline && baseline.source) addAllowed(baseline.source.url);
  if (baseline && baseline.links) (baseline.links.btns || []).forEach(button => addAllowed(button.url));
  if (baseline && baseline.source && Array.isArray(baseline.source.images)) baseline.source.images.forEach(addAllowed);
  const enforceAllowed = allowed.size > 0;

  const result = [];
  const seen = new Set();
  aiArray(links).slice(0, 6).forEach((button, index) => {
    if (!button || typeof button !== 'object') return;
    const url = safeHttpUrl(button.url);
    if (!url) return;
    if (enforceAllowed && !allowed.has(url)) return;
    const hostBoton = hostOf(url).replace(/^www\./i, '').toLowerCase();
    if (excludedHosts.some(excl => hostBoton === excl || hostBoton.endsWith('.' + excl))) return;
    if (seen.has(url)) return;
    seen.add(url);
    const label = aiText(button.label, 58) || `Ver en ${hostOf(url)}`;
    result.push({
      label,
      url,
      style: index === 0 ? 'primary' : 'secondary'
    });
  });

  if (result.length) return result.slice(0, maxButtons);
  return baselineLinks && baselineLinks.btns && baselineLinks.btns.length ? baselineLinks.btns.slice(0, maxButtons) : [];
}

function mergeAiPost(ai, baseline, options = {}) {
  const noOpen = options.noOpen !== false;
  const maxButtons = options.depth === 'rapido' ? 2 : 3;
  const hero = ai && ai.hero && typeof ai.hero === 'object' ? ai.hero : {};
  const info = ai && ai.info && typeof ai.info === 'object' ? ai.info : {};
  const links = ai && ai.links && typeof ai.links === 'object' ? ai.links : {};
  const bHero = baseline.hero || {};
  const bInfo = baseline.info || {};
  const bLinks = baseline.links || {};

  const baselineImages = Array.isArray(baseline.source && baseline.source.images) ? baseline.source.images : [];
  const candidateImage = safeHttpUrl(hero.img);
  const image = candidateImage && (baselineImages.includes(candidateImage) || candidateImage === safeHttpUrl(bHero.img))
    ? candidateImage
    : safeHttpUrl(bHero.img) || (baselineImages.length ? baselineImages[0] : '');

  const paras = aiParagraphs(info.paras);
  const items = normalizeAiItems(info.items, bInfo.items);
  const specs = normalizeAiSpecs(info.specs, bInfo.specs);
  const excludedHosts = (Array.isArray(options.excludedHosts) ? options.excludedHosts : [])
    .map(host => String(host || '').replace(/^www\./i, '').toLowerCase())
    .filter(Boolean);
  const buttons = normalizeAiLinks(links.btns, bLinks, baseline, maxButtons, excludedHosts);

  const post = {
    hero: {
      win: aiText(hero.win, 90) || bHero.win || '',
      img: image,
      title: aiText(hero.title, 110) || bHero.title || '',
      sub: aiText(hero.sub, 190) || bHero.sub || ''
    },
    info: {
      win: aiText(info.win, 80) || bInfo.win || '',
      greet: aiText(info.greet, 130) || bInfo.greet || '',
      paras: paras.length >= 80 ? paras : bInfo.paras || '',
      hlTitle: aiText(info.hlTitle, 100) || bInfo.hlTitle || '',
      hlText: aiText(info.hlText, 230) || bInfo.hlText || '',
      listTitle: aiText(info.listTitle, 70) || bInfo.listTitle || '',
      items,
      specTitle: aiText(info.specTitle, 70) || bInfo.specTitle || '',
      specs
    },
    links: {
      title: aiText(links.title, 80) || bLinks.title || '',
      text: aiText(links.text, 180) || bLinks.text || '',
      hide: bLinks.hide !== false,
      btns: buttons
    },
    source: baseline.source || {}
  };

  return finalizePost(post, noOpen);
}

const SOURCE_ROLE_LABELS = {
  user: '[APORTE DEL USUARIO]',
  official: '[SITIO OFICIAL]',
  review: '[RESEÑA]',
  manual: '[MANUAL]',
  forum: '[FORO]'
};

/* Material separado por rol. Acepta [{ role, text }] o { official: 'texto', … }. */
function formatSourcesBreakdown(breakdown) {
  if (!breakdown) return '';
  const partes = [];
  const agregar = (role, text) => {
    const body = String(text || '').trim();
    if (!body) return;
    const clave = String(role || '').toLowerCase();
    const label = SOURCE_ROLE_LABELS[clave] || `[${clave.toUpperCase() || 'FUENTE'}]`;
    partes.push(`${label}\n${body.slice(0, 9000)}`);
  };
  if (Array.isArray(breakdown)) {
    breakdown.forEach(item => {
      if (item && typeof item === 'object') agregar(item.role, item.text);
    });
  } else if (typeof breakdown === 'object') {
    Object.keys(breakdown).forEach(role => agregar(role, breakdown[role]));
  }
  return partes.join('\n\n');
}

function buildAiPrompt({ sourceText, baseline, options, type, sourceUrl, siteName, sourcesBreakdown }) {
  const tone = options.tone || 'taringa';
  const depth = options.depth === 'rapido' ? 'rapido' : 'completo';
  const noOpen = options.noOpen !== false;
  const maxItems = depth === 'rapido' ? 4 : 6;
  const maxSpecs = depth === 'rapido' ? 4 : 6;
  const maxParagraphs = depth === 'rapido' ? 2 : 3;

  const toneRules = {
    taringa: 'Cercano, directo, con voseo argentino natural. Sin exageraciones ni clickbait barato.',
    gamer: 'Joven y con onda gamer, pero claro y sin cringe. Voseo argentino.',
    pro: 'Informativo, profesional, claro y bien estructurado. Español neutro con voseo suave.'
  };

  const schema = {
    hero: {
      win: 'Título de la ventana, ej: "Sylenth1 — Vista previa"',
      img: 'URL absoluta de una de las imágenes detectadas, o cadena vacía',
      title: 'Título del post (máx. 90 caracteres)',
      sub: 'Subtítulo de una línea (máx. 180 caracteres)'
    },
    info: {
      win: 'Nombre de archivo de la ventana, ej: "Información de Sylenth1.rtf"',
      greet: 'Saludo breve y natural (máx. 120 caracteres)',
      paras: '2 o 3 párrafos separados por \\n\\n',
      hlTitle: 'Pregunta o título del destacado (máx. 90 caracteres)',
      hlText: 'Resumen del destacado con **negritas** (máx. 220 caracteres)',
      listTitle: 'Título de la lista de características',
      items: [{ tag: 'ETIQUETA CORTA', color: 'naranja|azul|rojo|amarillo|violeta|verde|rosa|gris', name: 'Nombre', desc: 'Descripción' }],
      specTitle: 'Título de la ficha técnica',
      specs: [{ k: 'Clave', v: 'Valor' }]
    },
    links: {
      title: 'Título de la sección de enlaces',
      text: 'Texto breve de la sección',
      btns: [{ label: 'Texto del botón', url: 'https://...', style: 'primary|secondary' }]
    }
  };

  const compactBaseline = clone(baseline);
  if (compactBaseline.source) {
    compactBaseline.source.images = (compactBaseline.source.images || []).slice(0, 8);
    delete compactBaseline.source.fetchedAt;
  }

  const porRol = formatSourcesBreakdown(sourcesBreakdown);
  const source = (porRol || String(sourceText || '')).slice(0, 18000);

  return `Sos un editor de contenido experto en Taringa! y en redacción en español rioplatense.
Tu tarea es reescribir y completar un post a partir del material fuente y de los datos ya detectados.

REGLAS OBLIGATORIAS
- Devolvés ÚNICAMENTE un objeto JSON válido. Sin markdown, sin explicaciones, sin texto antes ni después.
- No inventes datos, precios, fechas, requisitos ni URLs. Si un dato no está en el material, dejalo vacío o usá el dato detectado.
- Traducí al español todo el texto que esté en otro idioma. Conservá marcas, nombres propios y términos técnicos.
- No copies el subtítulo al principio del primer párrafo. El primer párrafo tiene que aportar información nueva.
- Tono: ${toneRules[tone] || toneRules.taringa}
- ${noOpen ? 'No uses los signos de apertura ¿ ni ¡ en ningún texto.' : 'Usá la puntuación normal del español, incluidos ¿ y ¡.'}
- En "paras", usá **dobles asteriscos** para 2 o 3 énfasis como máximo y [[dobles corchetes]] una sola vez para destacar el nombre principal.
- En "items" y "specs" no uses markdown. Escribí texto plano.
- "tag": máximo 18 caracteres, en mayúsculas, representativa de la característica.
- "color": elegí entre naranja, azul, rojo, amarillo, violeta, verde, rosa, gris. Variá los colores.
- Generá entre ${depth === 'rapido' ? 3 : 4} y ${maxItems} ítems en "items". Cada "desc" debe tener 1 o 2 oraciones y no superar 260 caracteres.
- Generá entre 2 y ${maxSpecs} filas en "specs", solo con datos verificables del material.
- "paras": ${maxParagraphs} párrafos como máximo, separados por \\n\\n. Cada párrafo de 2 a 4 oraciones.
- En "links.btns" usá solo URLs que aparezcan en los datos detectados o en el material. No inventes enlaces. Máximo ${depth === 'rapido' ? 2 : 3} botones.
- "hero.img": usá solo una URL de imagen presente en los datos detectados. Si no hay, devolvé "".
- Si el material es escaso, priorizá calidad sobre cantidad: no rellenes con frases genéricas vacías.
- El contenido tiene que quedar listo para publicar: coherente, en español y sin repetir la misma información en varios campos.
- Escribí el 100% en español natural. Conservá marcas, nombres propios y términos técnicos tal cual, pero nada de frases en otro idioma.
- Usá el MISMO nombre limpio del producto en todas las secciones: sin etiquetas de plataforma ni de descarga ([WIN/macOS], [Full], [Español], Free Download).
- En "items" no pongas encabezados de reseña ("Verdict", "Pros and cons", "What is it") ni secciones del sitio ("Posts Relacionados", "Comentarios").
- En "specs" no pongas fechas de la reseña ni categorías del foro (Downloads, Posts). Solo datos del producto.
- En "links.btns" no pongas enlaces de registro, login, perfil ni otros posts del foro.

ESQUEMA EXACTO
${JSON.stringify(schema, null, 2)}

CONTEXTO
- URL de origen: ${sourceUrl || 'no disponible'}
- Sitio: ${siteName || hostOf(sourceUrl) || 'no disponible'}
- Tipo de contenido detectado: ${type || 'generic'}
- Profundidad: ${depth}

DATOS DETECTADOS (base editable, corregí si hace falta)
${JSON.stringify(compactBaseline, null, 2).slice(0, 9000)}

MATERIAL FUENTE
${source}

Recordá: respondé SOLO el objeto JSON.`;
}

function friendlyAiError(status, message, provider) {
  const name = provider === 'gemini' ? 'Gemini' : 'el motor de IA';
  if (status === 401 || status === 403) return `${name} rechazó la API Key. Revisala en Ajustes.`;
  if (status === 429) return `${name} alcanzó el límite de uso. Esperá un momento o cambiá de motor.`;
  if (status === 400 && /api key not valid|invalid api key/i.test(message)) return 'La API Key no es válida.';
  if (status === 404) return `${name} no encontró el modelo configurado. Probá con otro modelo.`;
  if (message) return `${name}: ${message.slice(0, 220)}`;
  return `${name} devolvió un error inesperado (${status}).`;
}

async function requestGemini(prompt, { apiKey, model, signal }) {
  const configured = String(model || AI_DEFAULTS.geminiModel).trim();
  const models = [...new Set([configured, ...GEMINI_FALLBACKS].filter(Boolean))];
  let lastError = null;

  for (const modelName of models) {
    let response;
    try {
      response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.45,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json'
            }
          })
        },
        70000,
        signal
      );
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      lastError = new Error('No se pudo conectar con Gemini. Revisá tu conexión a internet.');
      lastError.provider = 'gemini';
      throw lastError;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : '';
      lastError = new Error(friendlyAiError(response.status, message, 'gemini'));
      lastError.status = response.status;
      lastError.provider = 'gemini';
      if ((response.status === 404 || /not found|not supported/i.test(message)) && models.indexOf(modelName) < models.length - 1) {
        continue;
      }
      throw lastError;
    }

    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error('Gemini bloqueó la generación por las políticas de contenido. Probá con otro texto.');
    }

    const candidate = data.candidates && data.candidates[0];
    if (candidate && candidate.finishReason === 'MAX_TOKENS') {
      throw new Error('La respuesta de Gemini quedó incompleta por límite de tokens. Probá con una fuente más corta.');
    }
    const parts = candidate && candidate.content && candidate.content.parts ? candidate.content.parts : [];
    const text = parts.map(part => part.text || '').join('\n').trim();
    if (!text) {
      lastError = new Error('Gemini no devolvió contenido. Volvé a intentar.');
      lastError.provider = 'gemini';
      throw lastError;
    }
    return { text, model: modelName };
  }

  throw lastError || new Error('No se pudo usar Gemini.');
}

function openAiChatUrl(base) {
  let clean = String(base || AI_DEFAULTS.openaiBase).trim().replace(/\/+$/, '');
  if (!clean) clean = AI_DEFAULTS.openaiBase;
  if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
  return /\/chat\/completions$/i.test(clean) ? clean : clean + '/chat/completions';
}

async function requestOpenAI(prompt, { base, model, key, signal }) {
  const url = openAiChatUrl(base);
  const body = {
    model: String(model || AI_DEFAULTS.openaiModel).trim(),
    messages: [
      { role: 'system', content: 'Sos un redactor y editor experto. Respondés siempre con JSON válido, sin markdown.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.45,
    response_format: { type: 'json_object' }
  };
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = 'Bearer ' + key;

  const send = async payload => {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, 75000, signal);
    const data = await response.json().catch(() => ({}));
    return { response, data };
  };

  let result;
  try {
    result = await send(body);
    if (!result.response.ok && result.response.status === 400) {
      const message = result.data && result.data.error && result.data.error.message ? result.data.error.message : '';
      if (/response_format|json_object/i.test(message)) {
        const fallback = { ...body };
        delete fallback.response_format;
        result = await send(fallback);
      }
    }
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    const networkError = new Error('No se pudo conectar con el endpoint de IA. Revisá la URL, la API Key y tu conexión.');
    networkError.provider = 'openai';
    throw networkError;
  }

  const { response, data } = result;
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : '';
    const error = new Error(friendlyAiError(response.status, message, 'openai'));
    error.status = response.status;
    error.provider = 'openai';
    throw error;
  }

  const choice = data.choices && data.choices[0];
  let content = choice && choice.message ? choice.message.content : '';
  if (Array.isArray(content)) content = content.map(part => part.text || part.content || '').join('\n');
  content = String(content || '').trim();
  if (!content) throw new Error('El motor de IA no devolvió contenido. Volvé a intentar.');
  return { text: content, model: body.model };
}

function parseJsonLoose(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('La IA devolvió una respuesta que no es JSON. Volvé a intentar.');
  }
  text = text.slice(start, end + 1);
  try {
    return JSON.parse(text);
  } catch (error) {
    try {
      return JSON.parse(text.replace(/,\s*([}\]])/g, '$1'));
    } catch (inner) {
      try {
        return JSON.parse(text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1'));
      } catch (last) {
        throw new Error('La IA devolvió un JSON inválido. Probá de nuevo o usá el motor local.');
      }
    }
  }
}

async function runAI({ sourceText, baseline, options = {}, config = {}, signal }) {
  const engine = config.engine === 'openai' ? 'openai' : 'gemini';
  const keys = config.keys || {};
  if (!aiHasKey(engine, keys, config.openaiBase)) {
    throw new Error(`Falta la API Key de ${aiEngineLabel(engine)}. Configurala en Ajustes.`);
  }

  const prompt = buildAiPrompt({
    sourceText,
    baseline,
    options,
    type: baseline.source ? baseline.source.type : 'generic',
    sourceUrl: baseline.source ? baseline.source.url : '',
    siteName: baseline.source ? baseline.source.siteName : ''
  });

  let output;
  if (engine === 'gemini') {
    output = await requestGemini(prompt, {
      apiKey: String(keys.gemini || '').trim(),
      model: config.geminiModel,
      signal
    });
  } else {
    output = await requestOpenAI(prompt, {
      base: config.openaiBase,
      model: config.openaiModel,
      key: String(keys.openai || '').trim(),
      signal
    });
  }

  const parsed = parseJsonLoose(output.text);
  const post = mergeAiPost(parsed, baseline, options);
  return { post, model: output.model, engine };
}

async function testAI(config, signal) {
  const engine = config.engine === 'openai' ? 'openai' : 'gemini';
  const keys = config.keys || {};

  if (engine === 'gemini') {
    const key = String(keys.gemini || '').trim();
    if (!key) return { ok: false, detail: 'Pegá tu API Key de Gemini.' };
    try {
      const response = await fetchWithTimeout(
        'https://generativelanguage.googleapis.com/v1beta/models',
        { headers: { Accept: 'application/json', 'x-goog-api-key': key } },
        20000,
        signal
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, detail: friendlyAiError(response.status, data.error && data.error.message, 'gemini') };
      }
      const models = data.models || [];
      const configured = config.geminiModel || AI_DEFAULTS.geminiModel;
      const available = models.some(model => String(model.name || '').replace(/^models\//, '') === configured);
      return {
        ok: true,
        detail: available ? `Conexión correcta. ${models.length} modelos disponibles.` : `Conexión correcta. ${models.length} modelos disponibles (se probará "${configured}").`
      };
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      return { ok: false, detail: 'No se pudo conectar con Gemini. Revisá tu conexión.' };
    }
  }

  const key = String(keys.openai || '').trim();
  if (!key && !isLocalAiBase(config.openaiBase)) return { ok: false, detail: 'Pegá la API Key del endpoint.' };
  try {
    const response = await fetchWithTimeout(
      openAiChatUrl(config.openaiBase).replace(/\/chat\/completions$/i, '/models'),
      { headers: { ...(key ? { Authorization: 'Bearer ' + key } : {}), Accept: 'application/json' } },
      20000,
      signal
    );
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const count = Array.isArray(data.data) ? data.data.length : 0;
      return { ok: true, detail: count ? `Conexión correcta. ${count} modelos disponibles.` : 'Conexión correcta.' };
    }
    if (response.status === 404) {
      return { ok: false, detail: 'El endpoint respondió, pero no expone /models. Verificá la URL base (debe terminar en /v1).' };
    }
    return { ok: false, detail: friendlyAiError(response.status, data.error && data.error.message, 'openai') };
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    return { ok: false, detail: 'No se pudo conectar con el endpoint. Revisá la URL y tu conexión.' };
  }
}
