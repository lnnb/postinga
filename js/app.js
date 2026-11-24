/**
 * Postinga
 * Controlador de la interfaz: estado, biblioteca, captura inteligente,
 * vista previa, ajustes, atajos y publicación.
 */

'use strict';

/* ============================================================
   Persistencia y estado
   ============================================================ */
const STORAGE = {
  draft: 'postinga.draft.v1',
  library: 'postinga.library.v1',
  prefs: 'postinga.prefs.v1',
  keys: 'postinga.keys.v1',
  legacy: 'taringa-editor-v1'
};

// El proyecto se llamaba tpost antes de llamarse Postinga: se copian los datos
// guardados para que nadie pierda su biblioteca ni sus claves.
const RENAMED_KEYS = {
  'postinga.draft.v1': 'tpost.draft.v1',
  'postinga.library.v1': 'tpost.library.v1',
  'postinga.prefs.v1': 'tpost.prefs.v1',
  'postinga.keys.v1': 'tpost.keys.v1'
};

function migrateStorage() {
  Object.keys(RENAMED_KEYS).forEach(key => {
    try {
      if (localStorage.getItem(key) !== null) return;
      const previous = localStorage.getItem(RENAMED_KEYS[key]);
      if (previous !== null) localStorage.setItem(key, previous);
    } catch (error) {
      // Si el navegador bloquea el almacenamiento, se sigue sin migrar.
    }
  });
}

migrateStorage();

const DEFAULT_PREFS = {
  appearance: 'auto',
  tone: 'taringa',
  depth: 'completo',
  noOpen: true,
  engine: 'local',
  geminiModel: 'gemini-2.5-flash',
  openaiBase: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini',
  targetName: 'Taringas!',
  targetUrl: 'https://taringas.net',
  sidebarCollapsed: false
};

const DEFAULT_KEYS = { gemini: '', openai: '' };
const MAX_LIBRARY = 60;
const PANELS = ['hero', 'info', 'items', 'specs', 'links', 'design'];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

function loadPrefs() {
  const stored = readJson(STORAGE.prefs, {});
  const prefs = { ...DEFAULT_PREFS };
  if (stored && typeof stored === 'object') {
    Object.keys(DEFAULT_PREFS).forEach(key => {
      if (stored[key] !== undefined && stored[key] !== null) prefs[key] = stored[key];
    });
  }
  if (!['auto', 'light', 'dark'].includes(prefs.appearance)) prefs.appearance = 'auto';
  if (!['taringa', 'gamer', 'pro'].includes(prefs.tone)) prefs.tone = 'taringa';
  if (!['completo', 'rapido'].includes(prefs.depth)) prefs.depth = 'completo';
  if (!['local', 'gemini', 'openai'].includes(prefs.engine)) prefs.engine = 'local';
  prefs.noOpen = prefs.noOpen !== false;
  return prefs;
}

function loadKeys() {
  const stored = readJson(STORAGE.keys, {});
  return {
    gemini: stored && typeof stored.gemini === 'string' ? stored.gemini : '',
    openai: stored && typeof stored.openai === 'string' ? stored.openai : ''
  };
}

function loadLibrary() {
  const stored = readJson(STORAGE.library, []);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(entry => entry && entry.id && entry.state && typeof entry.state === 'object')
    .map(entry => ({
      id: String(entry.id),
      title: String(entry.title || entry.state.hero && entry.state.hero.title || 'Post sin título'),
      thumb: safeHttpUrl(entry.thumb || ''),
      site: String(entry.site || ''),
      createdAt: Number(entry.createdAt) || Date.now(),
      updatedAt: Number(entry.updatedAt) || Date.now(),
      published: Boolean(entry.published),
      publishedAt: Number(entry.publishedAt) || 0,
      state: normalizePostState(entry.state)
    }))
    .slice(0, MAX_LIBRARY);
}

function loadInitialPost() {
  const draft = readJson(STORAGE.draft, null);
  if (draft && typeof draft === 'object' && (draft.hero || draft.info)) return normalizePostState(draft);
  const legacy = readJson(STORAGE.legacy, null);
  if (legacy && typeof legacy === 'object' && (legacy.hero || legacy.info)) return normalizePostState(legacy);
  // Primer arranque: post vacío con los separadores clásicos, listo para pegar.
  return normalizePostState(BLANK);
}

let prefs = loadPrefs();
let keys = loadKeys();
let library = loadLibrary();
let S = loadInitialPost();
let savedAt = readJson(STORAGE.draft, null) ? Date.now() : 0;

const state = {
  panelOpen: { hero: true, info: true, items: true, specs: false, links: true, design: false },
  analyzing: false,
  abort: null,
  captureMin: false,
  summary: null,
  alert: null,
  status: '',
  html: '',
  lastHtml: '',
  previewReady: false,
  activeSheet: null,
  lastFocus: null,
  pendingDelete: null,
  pendingDeleteTimer: 0,
  pendingSourceUrl: '',
  dirty: false,
  copiedHtmlLabel: '',
  copiedHelpLabel: '',
  imageChoice: '',
  attachments: [],
  reader: { available: false, checked: false }
};

/* ============================================================
   Utilidades de interfaz
   ============================================================ */
const formEl = $('#form');
const editorPane = $('#editorPane');
const captureInput = $('#captureInput');
const previewFrame = $('#pv');
const codeView = $('#codeView');

function nextTick(ms = 20) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function abortError() {
  const error = new Error('Análisis cancelado.');
  error.name = 'AbortError';
  return error;
}

function paletteForCurrent() {
  return palette(S.theme, S.accent);
}

function resolvedAppearance() {
  if (prefs.appearance === 'auto') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return prefs.appearance;
}

function applyAppearance() {
  const resolved = resolvedAppearance();
  document.documentElement.dataset.appearance = resolved;
  document.documentElement.style.colorScheme = resolved;

  // El selector de la barra muestra lo que estás viendo ahora.
  document.querySelectorAll('#themeToggle [data-appearance-choice]').forEach(button => {
    const active = button.dataset.appearanceChoice === resolved;
    button.classList.toggle('on', active);
    button.setAttribute('aria-pressed', String(active));
  });

  // En Ajustes se muestra la preferencia, que también puede ser automática.
  document.querySelectorAll('#appearanceSeg [data-appearance-choice]').forEach(choice => {
    choice.classList.toggle('on', choice.dataset.appearanceChoice === prefs.appearance);
  });
}

function setAppearance(choice) {
  if (choice !== 'light' && choice !== 'dark') return;
  if (resolvedAppearance() === choice && prefs.appearance === choice) return;
  prefs.appearance = choice;
  savePrefs();
  applyAppearance();
}

function savePrefs() {
  writeJson(STORAGE.prefs, prefs);
}

const WIDE_QUERY = '(min-width: 1181px)';

function isWideLayout() {
  return window.matchMedia(WIDE_QUERY).matches;
}

/** Pliega o muestra la biblioteca según la preferencia y el ancho. */
function applySidebarState() {
  const collapsed = Boolean(prefs.sidebarCollapsed) && isWideLayout();
  document.body.classList.toggle('sidebar-collapsed', collapsed);

  const button = $('#bSideToggle');
  if (button) {
    const label = collapsed ? 'Mostrar la biblioteca' : 'Ocultar la biblioteca';
    button.setAttribute('aria-pressed', String(collapsed));
    button.title = label + ' (⌘\\)';
    button.setAttribute('aria-label', label);
  }
}

function toggleSidebarCollapsed() {
  prefs.sidebarCollapsed = !prefs.sidebarCollapsed;
  savePrefs();
  applySidebarState();
  const label = prefs.sidebarCollapsed ? 'Biblioteca oculta' : 'Biblioteca visible';
  toast(label, { duration: 1800 });
}

function saveKeys() {
  writeJson(STORAGE.keys, keys);
}

function markDirty() {
  state.dirty = true;
}

function persistDraftNow() {
  const ok = writeJson(STORAGE.draft, S);
  if (ok) {
    savedAt = Date.now();
    renderTitlebar();
  }
  return ok;
}

const persistDraft = debounce(() => {
  if (writeJson(STORAGE.draft, S)) {
    savedAt = Date.now();
    renderTitlebar();
  }
}, 320);

function schedulePreview() {
  if (state.previewRaf) return;
  state.previewRaf = requestAnimationFrame(() => {
    state.previewRaf = 0;
    renderPreview();
  });
}

function autoResize(textarea, maxHeight = 420) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const height = Math.min(textarea.scrollHeight + 2, maxHeight);
  textarea.style.height = height + 'px';
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function textOr(value, fallback) {
  return cleanSpace(value || '') || fallback;
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = 0;
let toastActionFn = null;

function toast(message, options = {}) {
  const type = options.type || 'success';
  const box = $('#toast');
  const icon = $('#toastIcon');
  const text = $('#toastText');
  const action = $('#toastAction');

  text.textContent = message;
  icon.classList.toggle('warn', type === 'warn');
  icon.classList.toggle('error', type === 'error');
  icon.innerHTML = `<svg><use href="#${type === 'success' ? 'i-check' : 'i-alert'}"/></svg>`;
  toastActionFn = options.action && typeof options.action.fn === 'function' ? options.action.fn : null;
  if (toastActionFn && options.action.label) {
    action.hidden = false;
    action.textContent = options.action.label;
  } else {
    action.hidden = true;
  }
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.classList.remove('show');
    toastActionFn = null;
  }, options.duration || 2800);
  const live = $('#ariaLive');
  if (live) live.textContent = message;
}

function setCopyFeedback(button, originalLabel, copiedLabel) {
  if (!button) return;
  const use = button.querySelector('use');
  const label = button.querySelector('.tool-label') || button.querySelector('span');
  const previousHref = use ? use.getAttribute('href') : '';
  const previousLabel = label ? label.textContent : '';
  if (label) label.textContent = copiedLabel;
  if (use) use.setAttribute('href', '#i-check');
  setTimeout(() => {
    if (use && use.isConnected) use.setAttribute('href', previousHref || '#i-copy');
    if (label && label.isConnected) label.textContent = previousLabel || originalLabel || 'Copiar HTML';
  }, 1500);
}

/* ============================================================
   Titlebar / estado general
   ============================================================ */
function renderTitlebar() {
  const title = cleanSpace(S.hero.title) || 'Post sin título';
  const host = cleanSpace(S.source.siteName) || hostOf(S.source.url);
  $('#docTitle').textContent = title;
  $('#docSource').textContent = host || 'Sin fuente';
  $('#docTime').textContent = savedAt ? `Guardado ${relativeTime(savedAt)}` : 'Borrador local';
  document.title = `${title} · Postinga`;
  $('#libCount').textContent = String(library.length);
  $('#engineChipText').textContent = aiEngineLabel(prefs.engine);
  $('#engineChip').title = `Motor: ${aiEngineLabel(prefs.engine)}. Clic para cambiar.`;
  $('#toneSelect').value = prefs.tone;
  $('#bAnalyze').disabled = !canAnalyze();
}

/* ============================================================
   Biblioteca
   ============================================================ */
function libraryEntryFromState() {
  return {
    id: S.id,
    title: cleanSpace(S.hero.title) || 'Post sin título',
    thumb: safeHttpUrl(S.hero.img),
    site: cleanSpace(S.source.siteName) || hostOf(S.source.url),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    published: false,
    publishedAt: 0,
    state: clone(S)
  };
}

function saveCurrentToLibrary(silent = false) {
  if (!state.html && !build(S)) return false;
  const now = Date.now();
  const existing = library.find(entry => entry.id === S.id);
  if (existing) {
    existing.title = cleanSpace(S.hero.title) || existing.title || 'Post sin título';
    existing.thumb = safeHttpUrl(S.hero.img);
    existing.site = cleanSpace(S.source.siteName) || hostOf(S.source.url);
    existing.updatedAt = now;
    existing.state = clone(S);
  } else {
    library.unshift({
      id: S.id,
      title: cleanSpace(S.hero.title) || 'Post sin título',
      thumb: safeHttpUrl(S.hero.img),
      site: cleanSpace(S.source.siteName) || hostOf(S.source.url),
      createdAt: now,
      updatedAt: now,
      published: false,
      publishedAt: 0,
      state: clone(S)
    });
  }
  pruneLibrary();
  writeJson(STORAGE.library, library);
  state.dirty = false;
  renderLibrary();
  if (!silent) toast('Post guardado en la biblioteca');
  return true;
}

function pruneLibrary() {
  library.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (library.length <= MAX_LIBRARY) return;
  const removable = library.filter(entry => !entry.published && entry.id !== S.id);
  while (library.length > MAX_LIBRARY && removable.length) {
    const victim = removable.pop();
    const index = library.findIndex(entry => entry.id === victim.id);
    if (index !== -1) library.splice(index, 1);
  }
  while (library.length > MAX_LIBRARY) library.pop();
}

function markPublished() {
  if (!library.some(entry => entry.id === S.id)) saveCurrentToLibrary(true);
  const entry = library.find(item => item.id === S.id);
  if (entry) {
    entry.published = true;
    entry.publishedAt = Date.now();
    entry.updatedAt = Date.now();
    writeJson(STORAGE.library, library);
    renderLibrary();
  }
  state.dirty = false;
}

function renderLibrary() {
  const list = $('#libList');
  if (!list) return;
  const query = normalizeCompare($('#libSearch').value);
  const filtered = query
    ? library.filter(entry => normalizeCompare(`${entry.title} ${entry.site}`).includes(query))
    : library;

  $('#libCount').textContent = String(library.length);
  $('#libClear').hidden = !$('#libSearch').value;

  if (!library.length) {
    list.innerHTML = `<div class="lib-empty">
      <svg><use href="#i-folder"/></svg>
      <b>Tu biblioteca está vacía</b>
      Los posts que generes o guardes van a quedar acá.
    </div>`;
    return;
  }

  if (!filtered.length) {
    list.innerHTML = `<div class="lib-empty">
      <svg><use href="#i-search"/></svg>
      <b>Sin resultados</b>
      Probá con otro título o sitio.
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(entry => {
    const active = entry.id === S.id;
    const thumb = safeHttpUrl(entry.thumb);
    const initial = (entry.title || 'P').trim().charAt(0) || 'P';
    const pending = state.pendingDelete === entry.id;
    return `<div class="lib-item ${active ? 'is-active' : ''}" role="listitem" tabindex="0" data-id="${esc(entry.id)}" aria-label="${esc(entry.title)}">
      <span class="lib-thumb ${thumb ? '' : 'empty'}" ${thumb ? `style="background-image: url('${esc(thumb).replace(/'/g, '%27')}')"` : ''}>${thumb ? '' : esc(initial)}</span>
      <span class="lib-info">
        <span class="lib-title">${esc(entry.title || 'Post sin título')}</span>
        <span class="lib-meta">
          <span class="lib-status ${entry.published ? 'published' : ''}" title="${entry.published ? 'Publicado' : 'Borrador'}"></span>
          <span class="lib-source">${esc(entry.site || 'Sin fuente')} · ${esc(relativeTime(entry.updatedAt))}</span>
        </span>
      </span>
      <span class="lib-actions">
        <button class="icon-btn" data-update="${esc(entry.id)}" title="Actualizar con una fuente nueva" aria-label="Actualizar ${esc(entry.title)}"><svg><use href="#i-refresh"/></svg></button>
        <button class="icon-btn" data-dup="${esc(entry.id)}" title="Duplicar" aria-label="Duplicar ${esc(entry.title)}"><svg><use href="#i-duplicate"/></svg></button>
        <button class="icon-btn lib-del ${pending ? 'confirm' : ''}" data-del="${esc(entry.id)}" title="${pending ? 'Confirmar eliminación' : 'Eliminar'}" aria-label="Eliminar ${esc(entry.title)}">${pending ? '¿Eliminar?' : '<svg><use href="#i-trash"/></svg>'}</button>
      </span>
    </div>`;
  }).join('');
}

function openLibraryEntry(id) {
  state.attachments = [];
  renderAttachments();
  const entry = library.find(item => item.id === id);
  if (!entry) return;
  if (state.dirty) saveCurrentToLibrary(true);
  S = normalizePostState(clone(entry.state));
  S.id = entry.id;
  state.dirty = false;
  state.panelOpen = { hero: true, info: true, items: true, specs: false, links: true, design: false };
  state.summary = null;
  state.captureMin = false;
  state.alert = null;
  state.pendingSourceUrl = '';
  captureInput.value = '';
  persistDraftNow();
  renderForm();
  renderPreview();
  renderTitlebar();
  renderLibrary();
  renderCapture();
  closeSidebar();
  setMobileView('editor');
  toast('Post cargado');
}

function duplicateLibraryEntry(id) {
  if (state.dirty) saveCurrentToLibrary(true);
  const entry = library.find(item => item.id === id);
  if (!entry) return;
  const copy = clone(entry);
  copy.id = uid('post');
  copy.title = `${entry.title} (copia)`;
  copy.thumb = safeHttpUrl(entry.thumb);
  copy.site = entry.site;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  copy.published = false;
  copy.publishedAt = 0;
  copy.state.id = copy.id;
  copy.state.hero = copy.state.hero || {};
  copy.state.hero.title = copy.title;
  library.unshift(copy);
  pruneLibrary();
  writeJson(STORAGE.library, library);
  renderLibrary();
  toast('Post duplicado');
}

function deleteLibraryEntry(id) {
  if (state.pendingDelete !== id) {
    state.pendingDelete = id;
    clearTimeout(state.pendingDeleteTimer);
    state.pendingDeleteTimer = setTimeout(() => {
      state.pendingDelete = null;
      renderLibrary();
    }, 3000);
    renderLibrary();
    return;
  }
  state.pendingDelete = null;
  clearTimeout(state.pendingDeleteTimer);
  library = library.filter(entry => entry.id !== id);
  writeJson(STORAGE.library, library);
  if (S.id === id) S.id = uid('post');
  renderLibrary();
  toast('Post eliminado de la biblioteca');
}

/* ============================================================
   Captura inteligente
   ============================================================ */
/* ============================================================
   Archivos adjuntos
   Cada archivo entra como una fuente aparte, además de lo que haya
   escrito en el recuadro.
   ============================================================ */
const ATTACH_LIMIT = 600 * 1024;

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAttachments() {
  const row = $('#attachRow');
  if (!row) return;
  const files = state.attachments || [];
  row.hidden = files.length === 0;
  row.innerHTML = files.map(file => `<span class="attach-chip" title="${esc(file.name)}">
    <svg><use href="#${file.kind === 'html' ? 'i-code' : 'i-text'}"/></svg>
    <span class="attach-name">${esc(file.name)}</span>
    <span class="attach-size">${formatBytes(file.size)}</span>
    <button type="button" data-detach="${esc(file.id)}" aria-label="Quitar ${esc(file.name)}"><svg><use href="#i-x"/></svg></button>
  </span>`).join('');
  refreshDetection();
}

function removeAttachment(id) {
  state.attachments = (state.attachments || []).filter(file => file.id !== id);
  renderAttachments();
}

function addAttachments(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const aceptados = [];
  const rechazados = [];

  const pendientes = files.map(file => new Promise(resolve => {
    const esTexto = /^text\//.test(file.type) || /\.(txt|md|markdown|html?|text)$/i.test(file.name);
    if (!esTexto) {
      rechazados.push(`${file.name} (no es texto)`);
      return resolve();
    }
    if (file.size > ATTACH_LIMIT) {
      rechazados.push(`${file.name} (supera 600 KB)`);
      return resolve();
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      if (!content.trim()) {
        rechazados.push(`${file.name} (está vacío)`);
        return resolve();
      }
      aceptados.push({
        id: uid('file'),
        name: file.name,
        size: file.size,
        kind: looksLikeHtml(content) ? 'html' : 'text',
        content
      });
      resolve();
    };
    reader.onerror = () => {
      rechazados.push(`${file.name} (no se pudo leer)`);
      resolve();
    };
    reader.readAsText(file);
  }));

  Promise.all(pendientes).then(() => {
    if (!aceptados.length) {
      toast(rechazados.length ? `No se pudo adjuntar: ${rechazados[0]}` : 'No se adjuntó nada', { type: 'warn' });
      return;
    }
    state.attachments = [...(state.attachments || []), ...aceptados];
    renderAttachments();
    const html = aceptados.filter(file => file.kind === 'html').length;
    const resumen = aceptados.length === 1
      ? `Adjuntado: ${aceptados[0].name}`
      : `${aceptados.length} archivos adjuntados${html ? ` (${html} con HTML)` : ''}`;
    toast(rechazados.length ? `${resumen} · ${rechazados.length} sin agregar` : resumen);
  });
}

/** ¿Hay algo para analizar? Alcanza con texto en el recuadro o archivos adjuntos. */
function canAnalyze() {
  if (state.analyzing) return false;
  if (captureInput.value.trim()) return true;
  return (state.attachments || []).length > 0;
}

function detectLabel(value) {
  const parsed = parseSources(value);
  const resto = String(parsed.text || '').trim();
  const partes = [];

  if (parsed.urls.length === 1) partes.push(`1 link · ${hostOf(parsed.urls[0]) || 'sitio'}`);
  else if (parsed.urls.length > 1) partes.push(`${parsed.urls.length} links`);
  if (resto) {
    partes.push(looksLikeHtml(resto) ? 'HTML pegado' : `${formatNumber(wordCount(resto))} palabras`);
  }

  const adjuntos = (state.attachments || []).length;
  if (adjuntos) partes.push(`${adjuntos} ${adjuntos === 1 ? 'archivo' : 'archivos'}`);

  if (!partes.length) return { html: 'Esperando contenido', kind: 'empty' };
  return {
    html: partes.join(' + '),
    kind: parsed.urls.length ? 'url' : (looksLikeHtml(resto) ? 'html' : 'text')
  };
}

function refreshDetection() {
  const label = detectLabel(captureInput.value);
  const chip = $('#detectChip');
  if (chip) chip.dataset.kind = label.kind;
  const text = $('#detectText');
  if (text) text.textContent = label.html;
  $('#bAnalyze').disabled = !canAnalyze();
  autoResize(captureInput, 230);
}

function renderCapture() {
  const card = $('#captureCard');
  const body = $('#captureBody');
  const min = state.captureMin;
  card.classList.toggle('is-min', min);
  $('#bCaptureToggle').setAttribute('aria-expanded', String(!min));
  if (body) body.inert = min && !state.analyzing;
  $('#bAnalyze').hidden = state.analyzing;
  $('#bCancel').hidden = !state.analyzing;
  $('#captureProgress').hidden = !state.analyzing;
  $('#captureStatus').textContent = state.status || 'Analizando…';
  captureInput.readOnly = state.analyzing;
  $('#toneSelect').disabled = state.analyzing;
  $('#engineChip').disabled = state.analyzing;

  const summary = state.summary;
  if (summary) {
    const origen = summary.fuentes > 1
      ? `${summary.fuentes} fuentes`
      : (summary.host || 'el contenido');
    const parts = [`Completado desde ${origen}`];
    if (summary.items) parts.push(`${summary.items} ${summary.items === 1 ? 'característica' : 'características'}`);
    $('#captureSub').textContent = parts.join(' · ');
  } else if (state.analyzing) {
    $('#captureSub').textContent = state.status || 'Trabajando…';
  } else if (min) {
    $('#captureSub').textContent = 'Tocá para pegar un link o texto';
  } else {
    $('#captureSub').textContent = 'Pegá links, texto o HTML: podés mezclarlos';
  }

  const summaryBox = $('#captureSummary');
  if (summary) {
    const chips = [];
    if (summary.fuentes > 1) chips.push(`<span class="summary-chip"><svg><use href="#i-globe"/></svg><b>${summary.fuentes}</b> fuentes</span>`);
    if (summary.fallidas) chips.push(`<span class="summary-chip"><svg><use href="#i-alert"/></svg>${summary.fallidas} sin leer</span>`);
    if (summary.items) chips.push(`<span class="summary-chip"><svg><use href="#i-layers"/></svg><b>${summary.items}</b> características</span>`);
    if (summary.specs) chips.push(`<span class="summary-chip"><svg><use href="#i-tag"/></svg><b>${summary.specs}</b> datos</span>`);
    if (summary.links) chips.push(`<span class="summary-chip"><svg><use href="#i-link"/></svg><b>${summary.links}</b> enlaces</span>`);
    chips.push(`<span class="summary-chip"><svg><use href="#i-sparkle"/></svg>${esc(aiEngineLabel(summary.provider))}</span>`);
    const kept = lockedSectionsLabel(S);
    if (kept) chips.push(`<span class="summary-chip"><svg><use href="#i-lock"/></svg>Se conservó: <b>${esc(kept)}</b></span>`);
    summaryBox.hidden = false;
    summaryBox.innerHTML = `<span class="summary-source">Fuente: <b>${esc(summary.host || 'texto pegado')}</b></span>${chips.join('')}<button type="button" class="summary-action" data-capture-action="new">Pegar otro</button>`;
  } else {
    summaryBox.hidden = true;
    summaryBox.innerHTML = '';
  }

  renderLockHint();
  renderCaptureAlert();
  renderAttachments();
}

function renderLockHint() {
  const hint = $('#lockHint');
  if (!hint) return;
  const locked = lockedSectionsLabel(S);
  const show = Boolean(locked) && !state.analyzing;
  hint.hidden = !show;
  if (!show) {
    hint.innerHTML = '';
    return;
  }
  hint.innerHTML = `<svg><use href="#i-lock"/></svg><span>Al analizar se conservan: <b>${esc(locked)}</b></span><button type="button" class="text-btn" data-unlock-all>Desbloquear todo</button>`;
}

function renderCaptureAlert() {
  const box = $('#captureAlert');
  if (!state.alert) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.className = `capture-alert${state.alert.info ? ' info' : ''}`;
  const actions = (state.alert.actions || []).map(action =>
    `<button type="button" data-capture-action="${esc(action.id)}">${esc(action.label)}</button>`
  ).join('');
  box.innerHTML = `<svg><use href="#${state.alert.info ? 'i-info' : 'i-alert'}"/></svg>
    <span class="alert-copy"><b>${esc(state.alert.title || '')}</b>${esc(state.alert.message || '')}${actions ? `<span class="alert-actions">${actions}</span>` : ''}</span>`;
}

function setCaptureStatus(text) {
  state.status = text;
  const status = $('#captureStatus');
  if (status) status.textContent = text;
  if (state.analyzing) $('#captureSub').textContent = text;
}

function setAnalyzing(active) {
  state.analyzing = active;
  if (!active) state.status = '';
  document.querySelectorAll('#form input, #form textarea, #form select, #form button').forEach(control => {
    if (active) {
      if (!control.dataset.wasDisabled) control.dataset.wasDisabled = control.disabled ? '1' : '0';
      control.disabled = true;
    } else if (control.dataset.wasDisabled !== undefined) {
      control.disabled = control.dataset.wasDisabled === '1';
      delete control.dataset.wasDisabled;
    }
  });
  renderCapture();
  renderTitlebar();
}

function resetCapture(forNew = false) {
  if (state.analyzing) return;
  state.attachments = [];
  renderAttachments();
  state.summary = null;
  state.captureMin = false;
  state.alert = null;
  state.pendingSourceUrl = '';
  $('#captureInput').value = '';
  $('#captureInput').placeholder = 'Pegá uno o varios links, texto o HTML. Todo junto sirve: se combina solo…';
  refreshDetection();
  renderCapture();
  if (forNew) {
    editorPane.scrollTop = 0;
    setTimeout(() => $('#captureInput').focus(), 60);
  }
}

function showCaptureError(error, detected) {
  const message = error && error.message ? error.message : 'No se pudo procesar la información.';
  const isAiError = /API Key|Gemini|IA|modelo|límite/i.test(message) && !error.retryWithText;
  const actions = [];
  actions.push({ id: 'retry', label: 'Reintentar' });
  if ((error && error.retryWithText) || (detected && detected.kind === 'url')) {
    actions.push({ id: 'paste-text', label: 'Pegar el texto manualmente' });
  }
  if (isAiError) actions.push({ id: 'open-ai', label: 'Revisar configuración' });
  state.alert = {
    title: 'No pudimos completar el post.',
    message: `${message} `,
    actions
  };
  state.captureMin = false;
  state.status = '';
  renderCapture();
}

function applyAnalysis(post, info = {}) {
  state.lastSnapshot = clone(S);
  const merged = mergeSections(S, post);
  S = normalizePostState({
    ...S,
    ...merged,
    id: S.id || uid('post')
  });
  state.dirty = true;
  state.pendingSourceUrl = '';
  savedAt = Date.now();
  writeJson(STORAGE.draft, S);
  const html = build(S);
  const stats = buildStats(html, S);
  const host = cleanSpace(S.source.siteName) || hostOf(S.source.url) || 'texto pegado';
  const fuentes = info.sources || { leidas: [], fallidas: [] };
  state.summary = {
    host,
    items: stats.items,
    specs: stats.specs,
    links: stats.buttons,
    provider: info.engine || 'local',
    fuentes: fuentes.leidas.length,
    fallidas: fuentes.fallidas.length
  };
  state.captureMin = true;
  state.alert = null;
  captureInput.value = '';
  refreshDetection();
  renderForm();
  renderPreview();
  renderTitlebar();
  saveCurrentToLibrary(true);
  renderLibrary();
  renderCapture();
  editorPane.scrollTop = 0;
  setMobileView('editor');

  const filled = countFilledFields(S);
  const kept = lockedSectionsLabel(S);
  const suffix = info.aiNote ? ` ${info.aiNote}` : '';
  const keptNote = kept ? ` · conservé ${kept}` : '';
  toast(`Post completado: ${filled} campos${keptNote}${suffix}`, {
    duration: 4200,
    action: {
      label: 'Deshacer',
      fn: () => {
        if (!state.lastSnapshot) return;
        S = normalizePostState(state.lastSnapshot);
        state.lastSnapshot = null;
        state.summary = null;
        state.captureMin = false;
        state.dirty = true;
        persistDraftNow();
        renderForm();
        renderPreview();
        renderTitlebar();
        saveCurrentToLibrary(true);
        renderLibrary();
        renderCapture();
        toast('Cambios deshechos');
      }
    }
  });
}

/**
 * Reúne todo lo que haya en el recuadro: uno o varios links, texto pegado
 * y/o HTML. Los links se leen y después todo se combina en una sola fuente.
 */
async function gatherSources(rawInput, { signal, onStage, fallbackUrl = '' } = {}) {
  const parsed = parseSources(rawInput);
  const adjuntos = Array.isArray(state.attachments) ? state.attachments : [];
  const leidas = [];
  const fallidas = [];
  const maxLinks = 3;

  // Un .txt con links adentro también aporta fuentes para leer.
  const urlsAdjuntas = [];
  adjuntos.forEach(file => {
    if (looksLikeHtml(file.content)) return;
    parseSources(file.content).urls.forEach(url => urlsAdjuntas.push(url));
  });
  const urls = [...new Set([...parsed.urls, ...urlsAdjuntas])];

  for (const url of urls.slice(0, maxLinks)) {
    if (signal && signal.aborted) {
      const abort = new Error('Lectura cancelada.');
      abort.name = 'AbortError';
      throw abort;
    }
    try {
      if (onStage) onStage(`Leyendo ${hostOf(url)}…`);
      const result = await readUrl(url, { signal, onStage });
      leidas.push({ url, result });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      fallidas.push({ url, message: error && error.message ? error.message : 'No se pudo leer.' });
    }
  }

  if (urls.length && !leidas.length) {
    const error = new Error(fallidas[0] ? fallidas[0].message : 'No se pudo leer ningún enlace.');
    error.retryWithText = true;
    throw error;
  }

  // Lo que se pegó además de los links (texto suelto o HTML).
  let pegado = '';
  let metaPegada = null;
  const resto = String(parsed.text || '').trim();
  if (resto) {
    if (looksLikeHtml(resto)) {
      metaPegada = extractMeta(resto, leidas[0] ? leidas[0].result.finalUrl : '');
      pegado = htmlToText(resto);
    } else if (/^Title:\s/mi.test(resto) && /Markdown Content:/i.test(resto)) {
      const reader = parseReaderMarkdown(resto, '');
      metaPegada = reader.meta;
      pegado = reader.text;
    } else {
      pegado = resto;
    }
  }

  // Los metadatos del primer link mandan; el resto completa lo que falte.
  let meta = {};
  leidas.forEach(item => { meta = mergeMeta(meta, item.result.meta); });
  if (metaPegada) meta = mergeMeta(metaPegada, meta);

  // Tus archivos adjuntos: cada uno entra como una fuente aparte.
  const propios = [];
  if (pegado.length > 20) propios.push(pegado);
  adjuntos.forEach(file => {
    if (looksLikeHtml(file.content)) {
      const metaArchivo = extractMeta(file.content, '');
      if (metaArchivo) meta = mergeMeta(meta, metaArchivo);
      const convertido = htmlToText(file.content);
      if (convertido.length > 20) propios.push(convertido);
    } else {
      // Se descartan las líneas que son solo links: esas ya se leen aparte.
      const limpio = parseSources(file.content).text.trim();
      if (limpio.length > 20) propios.push(limpio);
    }
  });

  // Lo tuyo (pegado y adjuntos) va primero: manda sobre lo leído.
  const textos = [...propios];
  leidas.forEach(item => {
    if (item.result.text && item.result.text.length > 20) textos.push(item.result.text);
  });
  const text = textos.join('\n\n');

  const sourceUrl = (leidas[0] && (leidas[0].result.finalUrl || leidas[0].url))
    || urls[0]
    || safeHttpUrl(fallbackUrl)
    || '';

  return {
    payload: { text, meta },
    sourceUrl,
    pegado,
    priorityText: propios.join('\n\n'),
    provider: leidas.length ? leidas[0].result.provider : (metaPegada ? 'html' : 'texto'),
    sources: {
      leidas: leidas.map(item => ({
        url: item.result.finalUrl || item.url,
        provider: item.result.provider
      })),
      fallidas,
      adjuntos: adjuntos.length,
      palabrasPegadas: wordCount(propios.join(' ')),
      esHtml: Boolean(resto) && looksLikeHtml(resto)
    }
  };
}

async function runCapture() {
  if (state.analyzing) return;
  const raw = captureInput.value.trim();
  if (!raw && !(state.attachments || []).length) {
    captureInput.focus();
    return;
  }
  const fuentes = parseSources(raw);
  const adjuntos = (state.attachments || []).length;
  if (fuentes.isEmpty && !adjuntos) return;
  if (fuentes.isEmpty && adjuntos && !raw) {
    // Solo archivos adjuntos: alcanza para armar el post.
    fuentes.isEmpty = false;
  }
  const detected = {
    kind: fuentes.urls.length ? 'url' : (fuentes.isHtml ? 'html' : 'text'),
    url: fuentes.urls[0] || '',
    reseñas: fuentes.urls.length
  };

  if (prefs.engine !== 'local' && !aiHasKey(prefs.engine, keys, prefs.openaiBase)) {
    toast(`Configurá la API Key de ${aiEngineLabel(prefs.engine)} antes de analizar.`, { type: 'warn' });
    openSettings('engine');
    return;
  }

  const forced = state.forceAnalyze === true;
  state.forceAnalyze = false;

  if (!forced && fuentes.urls.length === 1 && !fuentes.text.trim()) {
    const direct = toDirectDownload(fuentes.urls[0]);
    if (direct.service) {
      state.alert = {
        info: true,
        title: `Ese enlace es una descarga de ${direct.service}.`,
        message: 'No es una página con texto para analizar. Puedo agregarlo a la sección Enlaces ya convertido a descarga directa.',
        actions: [
          { id: 'add-direct', label: 'Agregar a Enlaces' },
          { id: 'analyze-anyway', label: 'Analizar la página igual' }
        ]
      };
      state.pendingDirect = { url: direct.url, service: direct.service };
      state.captureMin = false;
      renderCapture();
      return;
    }
  }

  if (lockedSections(S).length === LOCKABLE_SECTIONS.length) {
    toast('Todas las secciones están bloqueadas: desbloqueá alguna para actualizar', { type: 'warn', duration: 3600 });
    renderCapture();
    return;
  }

  state.alert = null;
  state.summary = null;
  state.captureMin = false;
  state.abort = new AbortController();
  const signal = state.abort.signal;
  setAnalyzing(true);
  setCaptureStatus('Preparando el análisis…');

  const options = {
    tone: prefs.tone,
    depth: prefs.depth,
    noOpen: prefs.noOpen,
    seed: `${Date.now()}-${Math.random().toString(36).slice(2)}`
  };

  try {
    const gathered = await gatherSources(raw, {
      signal,
      onStage: setCaptureStatus,
      fallbackUrl: state.pendingSourceUrl
    });
    if (signal.aborted) throw abortError();

    const { payload, sourceUrl, provider, sources, pegado, priorityText } = gathered;
    setCaptureStatus('Detectando título, imágenes y características…');
    await nextTick(30);

    const baseline = analyze(payload, { ...options, sourceUrl, provider, priorityText: priorityText || pegado || '' });
    if (signal.aborted) throw abortError();

    let post = baseline;
    let aiNote = '';
    let usedEngine = 'local';
    if (prefs.engine !== 'local') {
      setCaptureStatus(`Redactando con ${aiEngineLabel(prefs.engine)}…`);
      try {
        const result = await runAI({
          sourceText: payload.text || '',
          baseline,
          options,
          config: {
            engine: prefs.engine,
            keys,
            geminiModel: prefs.geminiModel,
            openaiBase: prefs.openaiBase,
            openaiModel: prefs.openaiModel
          },
          signal
        });
        post = result.post;
        aiNote = `Redactado con ${aiEngineLabel(prefs.engine)}.`;
        usedEngine = prefs.engine;
      } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        aiNote = `La IA no pudo completar la tarea; usé el motor local.`;
      }
    }

    if (signal.aborted) throw abortError();
    setAnalyzing(false);
    state.abort = null;
    applyAnalysis(post, { provider, aiNote, engine: usedEngine, sources });
  } catch (error) {
    state.abort = null;
    setAnalyzing(false);
    if (error && error.name === 'AbortError') {
      setCaptureStatus('Análisis cancelado.');
      state.status = '';
      toast('Análisis cancelado', { type: 'warn' });
      renderCapture();
      return;
    }
    showCaptureError(error, detected);
    toast('No se pudo completar el post', { type: 'error' });
  }
}

function cancelCapture() {
  if (state.abort) {
    try { state.abort.abort(); } catch (error) { /* noop */ }
  }
  state.status = 'Cancelando…';
  renderCapture();
}

function handleCaptureAction(action) {
  if (action === 'add-direct') {
    const pending = state.pendingDirect;
    if (!pending) return;
    if (!S.links.btns.some(button => sameUrl(button.url, pending.url))) {
      S.links.btns.push({
        label: `Descargar desde ${pending.service}`,
        url: pending.url,
        style: S.links.btns.length ? 'secondary' : 'primary'
      });
    }
    if (!cleanSpace(S.links.title)) S.links.title = 'Descárgalo acá';
    state.panelOpen.links = true;
    state.alert = null;
    state.pendingDirect = null;
    captureInput.value = '';
    markDirty();
    renderForm();
    renderPreview();
    persistDraft();
    saveCurrentToLibrary(true);
    renderCapture();
    toast('Enlace agregado, ya convertido a descarga directa');
    return;
  }

  if (action === 'analyze-anyway') {
    state.alert = null;
    state.forceAnalyze = true;
    renderCapture();
    runCapture();
    return;
  }

  if (action === 'retry') {
    state.alert = null;
    renderCapture();
    runCapture();
    return;
  }
  if (action === 'paste-text') {
    const detected = detectInput(captureInput.value.trim());
    state.pendingSourceUrl = detected.url || '';
    state.alert = {
      info: true,
      title: 'Pegá el contenido de la página.',
      message: 'Copiá el texto principal y pegalo acá. Mantenemos el enlace para los botones del post.',
      actions: []
    };
    state.captureMin = false;
    captureInput.value = '';
    captureInput.placeholder = 'Pegá acá el texto de la página…';
    refreshDetection();
    renderCapture();
    setTimeout(() => captureInput.focus(), 50);
    return;
  }
  if (action === 'open-ai') {
    openSettings('engine');
    return;
  }
  if (action === 'new') {
    resetCapture(true);
    return;
  }
}

/* ============================================================
   Formulario
   ============================================================ */
const PANEL_META = {
  hero: { icon: 'photo', svg: 'i-image', title: 'Portada', sub: () => textOr(S.hero.title, 'Título, subtítulo e imagen principal') },
  info: { icon: 'doc', svg: 'i-text', title: 'Información', sub: () => {
    const words = wordCount(S.info.paras);
    return words ? `${formatNumber(words)} palabras · saludo y destacado` : 'Presentación, párrafos y destacado';
  } },
  items: { icon: 'list', svg: 'i-layers', title: 'Características', sub: () => {
    const count = S.info.items.filter(item => cleanSpace(item.name) || cleanSpace(item.desc)).length;
    return count ? `${count} ${count === 1 ? 'característica' : 'características'}` : 'La lista que hace único al post';
  } },
  specs: { icon: 'specs', svg: 'i-tag', title: 'Ficha técnica', sub: () => {
    const count = S.info.specs.filter(spec => cleanSpace(spec.k) && cleanSpace(spec.v)).length;
    return count ? `${count} ${count === 1 ? 'dato' : 'datos'}` : 'Datos, requisitos y compatibilidad';
  } },
  links: { icon: 'link', svg: 'i-link', title: 'Enlaces', sub: () => {
    const count = S.links.btns.filter(button => cleanSpace(button.label) && safeHttpUrl(button.url)).length;
    return count ? `${count} ${count === 1 ? 'enlace' : 'enlaces'} de descarga o info` : 'Descargas, compra y más info';
  } },
  design: { icon: 'design', svg: 'i-palette', title: 'Diseño y separadores', sub: () => `${S.theme === 'dark' ? 'Paleta oscura' : 'Paleta clara'} · ${(ACCENTS[S.accent] || ACCENTS.azul)[0]}` }
};

function fieldId(path) {
  return 'fld-' + path.replace(/[^a-z0-9]+/gi, '-');
}

function fieldCounter(path, max) {
  const value = String(getP(S, path) ?? '');
  const over = value.length > max ? ' over' : '';
  return `<span class="char-count${over}" data-count="${path}" data-max="${max}">${value.length}/${max}</span>`;
}

function textField({ path, label, placeholder = '', hint = '', max = 0, mono = false, type = 'text' }) {
  const value = String(getP(S, path) ?? '');
  return `<div class="field">
    <label class="field-label" for="${fieldId(path)}"><span>${label}</span>${max ? fieldCounter(path, max) : ''}</label>
    <input class="input${mono ? ' mono' : ''}" id="${fieldId(path)}" data-p="${path}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"${max ? ` maxlength="${max}"` : ''} autocomplete="off" spellcheck="false">
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </div>`;
}

function areaField({ path, label, placeholder = '', hint = '', rows = 4, max = 0 }) {
  const value = String(getP(S, path) ?? '');
  return `<div class="field">
    <label class="field-label" for="${fieldId(path)}"><span>${label}</span>${max ? fieldCounter(path, max) : ''}</label>
    <textarea class="textarea" id="${fieldId(path)}" data-p="${path}" rows="${rows}" placeholder="${esc(placeholder)}" spellcheck="false">${esc(value)}</textarea>
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </div>`;
}

function selectField({ path, label, options }) {
  const value = String(getP(S, path) ?? '');
  return `<div class="field">
    <label class="field-label" for="${fieldId(path)}"><span>${label}</span></label>
    <span class="select-wrap"><select id="${fieldId(path)}" data-p="${path}">${options.map(option =>
      `<option value="${esc(option[0])}"${value === option[0] ? ' selected' : ''}>${esc(option[1])}</option>`
    ).join('')}</select></span>
  </div>`;
}

function toggleField(path, label, help) {
  return `<div class="switch-row">
    <span class="switch-label">${label}${help ? `<small>${help}</small>` : ''}</span>
    <input type="checkbox" class="switch" data-p="${path}"${getP(S, path) ? ' checked' : ''} aria-label="${esc(label)}">
  </div>`;
}

function imageFieldMarkup() {
  const image = safeHttpUrl(S.hero.img);
  const count = Array.isArray(S.source.images) ? S.source.images.length : 0;
  return `<div class="field">
    <label class="field-label" for="${fieldId('hero.img')}"><span>Imagen de portada</span></label>
    <div class="image-field">
      <div class="image-thumb ${image ? 'has-image' : ''}" id="imgThumb">
        ${image ? `<img src="${esc(image)}" alt="">` : ''}
        <svg class="thumb-ph"><use href="#i-image"/></svg>
      </div>
      <div class="image-fields">
        <input class="input mono" id="${fieldId('hero.img')}" data-p="hero.img" value="${esc(S.hero.img || '')}" placeholder="https://…/portada.jpg" autocomplete="off" spellcheck="false">
        <div class="image-actions">
          <button type="button" class="link-btn" data-a="pick-image"${count ? '' : ' disabled'}><svg><use href="#i-image"/></svg> Elegir encontrada${count ? ` (${count})` : ''}</button>
          <button type="button" class="link-btn" data-a="clear-image"${S.hero.img ? '' : ' disabled'}>Quitar</button>
        </div>
      </div>
    </div>
    ${count > 1 ? '<span class="field-hint">Detectamos varias imágenes. Podés elegir otra sin salir del editor.</span>' : ''}
  </div>`;
}

function itemsMarkup() {
  const items = S.info.items;
  const colorOptions = COLORS.map(color => [color[0], color[1]]);
  const rows = items.map((item, index) => {
    const paletteValue = TAGS[S.theme] || TAGS.light;
    const colors = paletteValue[item.color] || paletteValue.gris;
    return `<div class="row-card" data-row="item-${index}">
      <div class="row-top">
        <span class="row-num">
          <span class="row-dot" style="background:${colors[1]}"></span>
          #${index + 1}
          <span class="row-tag">${esc(cleanSpace(item.tag) || 'Sin etiqueta')}</span>
        </span>
        <span class="row-actions">
          <button type="button" class="icon-btn" data-a="up" data-path="info.items" data-i="${index}" title="Subir" aria-label="Subir"${index === 0 ? ' disabled' : ''}><svg><use href="#i-up"/></svg></button>
          <button type="button" class="icon-btn" data-a="down" data-path="info.items" data-i="${index}" title="Bajar" aria-label="Bajar"${index === items.length - 1 ? ' disabled' : ''}><svg><use href="#i-down"/></svg></button>
          <button type="button" class="icon-btn danger" data-a="del" data-path="info.items" data-i="${index}" title="Quitar" aria-label="Quitar"><svg><use href="#i-trash"/></svg></button>
        </span>
      </div>
      <div class="field-row">
        ${textField({ path: `info.items.${index}.tag`, label: 'Etiqueta', placeholder: 'DESTACADO', max: 18 })}
        ${selectField({ path: `info.items.${index}.color`, label: 'Color', options: colorOptions })}
      </div>
      ${textField({ path: `info.items.${index}.name`, label: 'Nombre', placeholder: 'Nombre de la característica', max: 90 })}
      ${areaField({ path: `info.items.${index}.desc`, label: 'Descripción', placeholder: 'Una o dos oraciones.', rows: 3, max: 320 })}
    </div>`;
  }).join('');

  return `${textField({ path: 'info.listTitle', label: 'Título de la lista', placeholder: 'Características principales', max: 70 })}
    <div class="rows">${rows || '<p class="empty-rows">Todavía no hay características. Agregá la primera o generá el post desde un link.</p>'}</div>
    <div style="margin-top:7px"><button type="button" class="add-row" data-a="add" data-path="info.items" data-focus="name"><svg><use href="#i-plus"/></svg> Agregar característica</button></div>`;
}

function specsMarkup() {
  const specs = S.info.specs;
  const rows = specs.map((spec, index) => `<div class="row-card">
    <div class="row-top">
      <span class="row-num">#${index + 1}</span>
      <span class="row-actions">
        <button type="button" class="icon-btn" data-a="up" data-path="info.specs" data-i="${index}" title="Subir" aria-label="Subir"${index === 0 ? ' disabled' : ''}><svg><use href="#i-up"/></svg></button>
        <button type="button" class="icon-btn" data-a="down" data-path="info.specs" data-i="${index}" title="Bajar" aria-label="Bajar"${index === specs.length - 1 ? ' disabled' : ''}><svg><use href="#i-down"/></svg></button>
        <button type="button" class="icon-btn danger" data-a="del" data-path="info.specs" data-i="${index}" title="Quitar" aria-label="Quitar"><svg><use href="#i-trash"/></svg></button>
      </span>
    </div>
    <div class="spec-fields">
      <input class="input" data-p="info.specs.${index}.k" value="${esc(spec.k || '')}" placeholder="Clave" maxlength="28" aria-label="Clave ${index + 1}" spellcheck="false">
      <input class="input" data-p="info.specs.${index}.v" value="${esc(spec.v || '')}" placeholder="Valor" maxlength="180" aria-label="Valor ${index + 1}" spellcheck="false">
    </div>
  </div>`).join('');

  return `${textField({ path: 'info.specTitle', label: 'Título de la ficha', placeholder: 'Especificaciones y compatibilidad', max: 70 })}
    <div class="rows">${rows || '<p class="empty-rows">Sin datos técnicos. Podés agregar formatos, requisitos, precio o fecha.</p>'}</div>
    <div style="margin-top:7px"><button type="button" class="add-row" data-a="add" data-path="info.specs" data-focus="k"><svg><use href="#i-plus"/></svg> Agregar dato</button></div>`;
}

function linksMarkup() {
  const buttons = S.links.btns;
  const rows = buttons.map((button, index) => {
    const isDirect = isDirectDownload(button.url);
    return `<div class="row-card link-card">
    <div class="row-top">
      <span class="row-num">#${index + 1} <span class="row-tag">${button.style === 'primary' ? 'Principal' : 'Secundario'}</span>${isDirect ? '<span class="row-direct">↓ Descarga directa</span>' : ''}</span>
      <span class="row-actions">
        <button type="button" class="icon-btn" data-a="up" data-path="links.btns" data-i="${index}" title="Subir" aria-label="Subir"${index === 0 ? ' disabled' : ''}><svg><use href="#i-up"/></svg></button>
        <button type="button" class="icon-btn" data-a="down" data-path="links.btns" data-i="${index}" title="Bajar" aria-label="Bajar"${index === buttons.length - 1 ? ' disabled' : ''}><svg><use href="#i-down"/></svg></button>
        <button type="button" class="icon-btn danger" data-a="del" data-path="links.btns" data-i="${index}" title="Quitar" aria-label="Quitar"><svg><use href="#i-trash"/></svg></button>
      </span>
    </div>
    ${textField({ path: `links.btns.${index}.label`, label: 'Texto del botón', placeholder: 'Descargar para Windows', max: 60 })}
    ${textField({ path: `links.btns.${index}.url`, label: 'URL', placeholder: 'https://…', mono: true, type: 'url' })}
    <div class="link-style-row">
      ${selectField({ path: `links.btns.${index}.style`, label: 'Estilo', options: [['primary', 'Principal'], ['secondary', 'Secundario']] })}
    </div>
  </div>`;
  }).join('');

  return `${textField({ path: 'links.title', label: 'Título de la sección', placeholder: 'Descargalo desde el sitio oficial', max: 80 })}
    ${textField({ path: 'links.text', label: 'Texto de la sección', placeholder: 'Elegí la opción que te sirva:', max: 180 })}
    ${toggleField('links.hide', 'Envolver en <code>links-ocultos</code>', 'Solo se muestran cuando el sitio lo permite.')}
    <div class="field">
      <div class="rows">${rows || '<p class="empty-rows">Sin enlaces todavía. Agregá el sitio oficial o la descarga.</p>'}</div>
      <div style="margin-top:7px"><button type="button" class="add-row" data-a="add" data-path="links.btns" data-focus="label"><svg><use href="#i-plus"/></svg> Agregar enlace</button></div>
    </div>`;
}

function designMarkup() {
  const accentEntries = Object.entries(ACCENTS);
  return `<div class="design-section">
      <div class="field-label">Paleta del post</div>
      <div class="choice-seg" id="postThemeSeg">
        <button type="button" data-theme-choice="light" class="${S.theme === 'light' ? 'on' : ''}" aria-pressed="${S.theme === 'light'}"><svg><use href="#i-sun"/></svg> Claro</button>
        <button type="button" data-theme-choice="dark" class="${S.theme === 'dark' ? 'on' : ''}" aria-pressed="${S.theme === 'dark'}"><svg><use href="#i-moon"/></svg> Oscuro</button>
      </div>
    </div>
    <div class="design-section">
      <div class="field-label">Color de acento</div>
      <div class="accent-row">
        ${accentEntries.map(([id, [label, colors]]) => `<button type="button" class="accent-swatch ${S.accent === id ? 'on' : ''}" data-accent-choice="${id}" style="--swatch:${colors[S.theme] || colors.light}" title="${label}" aria-label="${label}" aria-pressed="${S.accent === id}"><svg class="check"><use href="#i-check"/></svg></button>`).join('')}
      </div>
    </div>
    <div class="design-section">
      <div class="design-head">
        <span class="field-label">Separadores clásicos</span>
        <button type="button" class="link-btn" data-a="restore-sep">Restaurar clásicos</button>
      </div>
      <div class="sep-fields">
        ${[0, 1, 2].map(index => `<div class="field">
          <label class="field-label" for="${fieldId(`sep.${index}`)}"><span>Separador ${index + 1}</span></label>
          <input class="input" id="${fieldId(`sep.${index}`)}" data-p="sep.${index}" value="${esc(S.sep[index] || '')}" placeholder="${esc(CLASSIC_SEPARATORS[index])}" maxlength="60" spellcheck="false">
        </div>`).join('')}
      </div>
      <p class="post-design-note">Las líneas se generan dentro del HTML: no dependen de CSS externo. Vaciar un separador deja una línea simple.</p>
    </div>`;
}

function panelMarkup(key, body) {
  const meta = PANEL_META[key];
  const open = Boolean(state.panelOpen[key]);
  const lockable = LOCKABLE_SECTIONS.includes(key);
  const locked = lockable && isSectionLocked(S, key);
  const sub = locked ? `Bloqueada · ${meta.sub()}` : meta.sub();
  const lockButton = lockable
    ? `<button type="button" class="panel-lock" data-lock="${key}" aria-pressed="${locked}" title="${locked ? 'Bloqueada: no se actualiza al analizar' : 'Bloquear: conservar esta sección al analizar'}" aria-label="${locked ? 'Desbloquear' : 'Bloquear'} ${esc(meta.title)}"><svg><use href="#${locked ? 'i-lock' : 'i-unlock'}"/></svg></button>`
    : '';

  return `<section class="panel ${open ? 'open' : ''} ${locked ? 'is-locked' : ''}" data-panel="${key}">
    <div class="panel-head">
      <button type="button" class="panel-toggle" data-toggle="${key}" aria-expanded="${open}" aria-controls="panel-${key}">
        <span class="panel-ico ${meta.icon}"><svg><use href="#${meta.svg}"/></svg></span>
        <span class="panel-head-txt">
          <span class="panel-title">${meta.title}</span>
          <span class="panel-sub">${esc(sub)}</span>
        </span>
      </button>
      ${lockButton}
      <button type="button" class="panel-chev" data-toggle="${key}" tabindex="-1" aria-label="${open ? 'Ocultar' : 'Mostrar'} ${esc(meta.title)}"><svg><use href="#i-chevron"/></svg></button>
    </div>
    <div class="panel-body" id="panel-${key}"${open ? '' : ' inert'}>
      <div><div class="panel-inner">${body}</div></div>
    </div>
  </section>`;
}

function toggleSectionLock(key) {
  if (!LOCKABLE_SECTIONS.includes(key)) return;
  const next = !isSectionLocked(S, key);
  S.locked = S.locked || {};
  S.locked[key] = next;
  markDirty();
  renderForm();
  renderCapture();
  persistDraft();
  toast(next
    ? `${SECTION_LABELS[key]} bloqueada: se conserva al analizar`
    : `${SECTION_LABELS[key]} desbloqueada: se actualiza al analizar`);
}

function buildFormHtml() {
  const hero = [
    textField({ path: 'hero.title', label: 'Título', placeholder: 'Nombre del producto, juego o contenido', max: 120 }),
    textField({ path: 'hero.sub', label: 'Subtítulo', placeholder: 'Una línea que resuma de qué se trata.', max: 220 }),
    imageFieldMarkup(),
    textField({ path: 'hero.win', label: 'Nombre de la ventana', placeholder: 'Título — Vista previa', max: 90, hint: 'El texto que aparece en la barra superior de la ventana.' })
  ].join('');

  const info = [
    textField({ path: 'info.win', label: 'Nombre de la ventana', placeholder: 'Información del post.rtf', max: 90 }),
    textField({ path: 'info.greet', label: 'Saludo', placeholder: 'Qué hacés, maquinola del diseño sonoro.', max: 130 }),
    areaField({ path: 'info.paras', label: 'Párrafos', placeholder: 'Pegá o escribí el cuerpo del post. Separá los párrafos con una línea en blanco.', rows: 7, hint: 'Usá <b>**negrita**</b> y <b>[[acento de color]]</b>. Separá los párrafos con una línea en blanco.' }),
    textField({ path: 'info.hlTitle', label: 'Destacado: título', placeholder: 'Por qué vale la pena probarlo?', max: 100 }),
    areaField({ path: 'info.hlText', label: 'Destacado: texto', placeholder: 'Lo más destacado: **...**', rows: 3, max: 260 })
  ].join('');

  const design = designMarkup();

  return [
    panelMarkup('hero', hero),
    panelMarkup('info', info),
    panelMarkup('items', itemsMarkup()),
    panelMarkup('specs', specsMarkup()),
    panelMarkup('links', linksMarkup()),
    panelMarkup('design', design)
  ].join('');
}

function renderForm(focusPath) {
  const scroll = editorPane.scrollTop;
  formEl.innerHTML = buildFormHtml();
  editorPane.scrollTop = scroll;
  requestAnimationFrame(() => {
    formEl.querySelectorAll('textarea').forEach(textarea => autoResize(textarea));
    updateCharCounters();
    if (focusPath) {
      const target = formEl.querySelector(`[data-p="${focusPath}"]`);
      if (target) {
        target.focus();
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  });
}

function updateCharCounters() {
  formEl.querySelectorAll('[data-count]').forEach(counter => {
    const path = counter.dataset.count;
    const max = Number(counter.dataset.max) || 0;
    const value = String(getP(S, path) ?? '');
    counter.textContent = `${value.length}/${max}`;
    counter.classList.toggle('over', max > 0 && value.length > max);
  });
}

function refreshImageThumb() {
  const thumb = $('#imgThumb');
  if (!thumb) return;
  const image = safeHttpUrl(S.hero.img);
  thumb.classList.toggle('has-image', Boolean(image));
  thumb.innerHTML = `${image ? `<img src="${esc(image)}" alt="">` : ''}<svg class="thumb-ph"><use href="#i-image"/></svg>`;
  const img = thumb.querySelector('img');
  if (img) {
    img.addEventListener('error', () => {
      img.remove();
      thumb.classList.remove('has-image');
    }, { once: true });
  }
}

function updateItemIndicators(path) {
  const match = path.match(/^info\.items\.(\d+)\.(tag|color)$/);
  if (!match) return;
  const index = Number(match[1]);
  const row = formEl.querySelector(`.row-card[data-row="item-${index}"]`);
  if (!row) return;
  const item = S.info.items[index];
  if (!item) return;
  const tag = row.querySelector('.row-tag');
  if (tag) tag.textContent = cleanSpace(item.tag) || 'Sin etiqueta';
  const dot = row.querySelector('.row-dot');
  if (dot) {
    const colors = (TAGS[S.theme] || TAGS.light)[item.color] || (TAGS[S.theme] || TAGS.light).gris;
    dot.style.background = colors[1];
  }
}

function togglePanel(key) {
  if (!PANELS.includes(key)) return;
  state.panelOpen[key] = !state.panelOpen[key];
  const panel = formEl.querySelector(`.panel[data-panel="${key}"]`);
  if (!panel) return;
  const open = state.panelOpen[key];
  panel.classList.toggle('open', open);
  const button = panel.querySelector('.panel-head');
  if (button) button.setAttribute('aria-expanded', String(open));
  const body = panel.querySelector('.panel-body');
  if (body) body.inert = !open;
}

function handleFormAction(button) {
  const action = button.dataset.a;
  const path = button.dataset.path;
  if (!action) return;

  if (action === 'pick-image') {
    openImageSheet();
    return;
  }
  if (action === 'clear-image') {
    S.hero.img = '';
    markDirty();
    renderForm();
    schedulePreview();
    persistDraft();
    return;
  }
  if (action === 'restore-sep') {
    S.sep = CLASSIC_SEPARATORS.slice();
    markDirty();
    renderForm();
    schedulePreview();
    persistDraft();
    return;
  }

  const list = getP(S, path);
  if (!Array.isArray(list)) return;
  const index = Number(button.dataset.i);
  let focusPath = '';

  if (action === 'add') {
    const creator = NEW[path];
    if (!creator) return;
    list.push(creator());
    focusPath = `${path}.${list.length - 1}.${button.dataset.focus || 'name'}`;
  } else if (action === 'del') {
    list.splice(index, 1);
  } else if (action === 'up' || action === 'down') {
    const target = action === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
  } else {
    return;
  }

  markDirty();
  renderForm(focusPath);
  schedulePreview();
  persistDraft();
}

function handleFormClick(event) {
  const lock = event.target.closest('[data-lock]');
  if (lock) {
    toggleSectionLock(lock.dataset.lock);
    return;
  }
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    togglePanel(toggle.dataset.toggle);
    return;
  }
  const themeChoice = event.target.closest('[data-theme-choice]');
  if (themeChoice) {
    S.theme = themeChoice.dataset.themeChoice === 'dark' ? 'dark' : 'light';
    markDirty();
    renderForm();
    renderPreview();
    persistDraft();
    return;
  }
  const accentChoice = event.target.closest('[data-accent-choice]');
  if (accentChoice) {
    const accent = accentChoice.dataset.accentChoice;
    if (ACCENTS[accent]) S.accent = accent;
    markDirty();
    renderForm();
    renderPreview();
    persistDraft();
    return;
  }
  const action = event.target.closest('[data-a]');
  if (action) handleFormAction(action);
}

/* ============================================================
   Vista previa y código
   ============================================================ */
function highlightHtml(source) {
  const attrOpen = '\u0001';
  const attrClose = '\u0002';
  const strOpen = '\u0003';
  const strClose = '\u0004';
  const tagOpen = '\u0005';
  const tagClose = '\u0006';

  let text = esc(source);
  text = text.replace(/([\w:-]+)(=)(&quot;[\s\S]*?&quot;)/g, `${attrOpen}$1${attrClose}$2${strOpen}$3${strClose}`);
  text = text.replace(/(&lt;\/?)([\w:-]+)/g, `${tagOpen}$1${tagClose}${tagOpen}$2${tagClose}`);
  return text
    .split(attrOpen).join('<span class="tok-attr">')
    .split(attrClose).join('</span>')
    .split(strOpen).join('<span class="tok-str">')
    .split(strClose).join('</span>')
    .split(tagOpen).join('<span class="tok-tag">')
    .split(tagClose).join('</span>');
}

function renderCode() {
  const html = state.html || '';
  if (!html) {
    codeView.innerHTML = '<span class="code-placeholder">El HTML generado va a aparecer acá cuando el post tenga contenido.</span>';
    return;
  }
  codeView.innerHTML = highlightHtml(html);
}

function renderPreview() {
  const html = build(S);
  state.html = html;
  const P = paletteForCurrent();

  if (previewFrame.contentDocument && state.previewReady) {
    const doc = previewFrame.contentDocument;
    doc.documentElement.style.colorScheme = S.theme;
    doc.documentElement.dataset.previewTheme = S.theme;
    if (doc.body) {
      doc.body.style.background = P.pv;
      if (state.lastHtml !== html) doc.body.innerHTML = html;
    }
  }
  state.lastHtml = html;

  const frame = $('#postFrame');
  if (frame) frame.style.background = P.pv;
  const empty = $('#previewEmpty');
  if (empty) empty.hidden = Boolean(html);

  const stats = buildStats(html, S);
  $('#postStats').textContent = html
    ? `${formatNumber(stats.words)} palabras · ${stats.items} ${stats.items === 1 ? 'característica' : 'características'} · ${stats.specs} datos · ${stats.buttons} enlaces`
    : 'Sin contenido todavía';
  $('#codeStats').textContent = html
    ? `${formatNumber(stats.chars)} caracteres · ${html.split('\n').length} líneas`
    : '0 caracteres';

  if (document.body.dataset.preview === 'code') renderCode();
}

function setPreviewView(view) {
  const value = view === 'code' ? 'code' : 'preview';
  document.body.dataset.preview = value;
  document.querySelectorAll('#viewSeg [data-view]').forEach(button => {
    const active = button.dataset.view === value;
    button.classList.toggle('on', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (value === 'code') renderCode();
}

function setDevice(device) {
  const mobile = device === 'mobile';
  $('#postFrame').classList.toggle('is-mobile', mobile);
  document.querySelectorAll('#deviceSeg [data-device]').forEach(button => {
    button.classList.toggle('on', button.dataset.device === (mobile ? 'mobile' : 'desktop'));
  });
}

function initPreview() {
  previewFrame.addEventListener('load', () => {
    state.previewReady = true;
    state.lastHtml = '';
    renderPreview();
  });
  previewFrame.srcdoc = buildPreviewDocument('', palette(S.theme, S.accent));
  setTimeout(() => {
    if (!state.previewReady) {
      state.previewReady = true;
      state.lastHtml = '';
      renderPreview();
    }
  }, 420);
}

function standaloneDocument() {
  return buildPreviewDocument(build(S), paletteForCurrent());
}

function openPreviewTab() {
  const html = build(S);
  state.html = html;
  if (!html) {
    toast('Todavía no hay contenido para previsualizar', { type: 'warn' });
    return;
  }
  const blob = new Blob([standaloneDocument()], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) toast('El navegador bloqueó la pestaña nueva', { type: 'warn' });
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ============================================================
   Copiar / descargar
   ============================================================ */
async function copyHtml(sourceButton) {
  const html = build(S);
  state.html = html;
  if (!html) {
    toast('Todavía no hay contenido para copiar', { type: 'warn' });
    return;
  }
  let copied = false;
  try {
    await navigator.clipboard.writeText(html);
    copied = true;
  } catch (error) {
    try {
      const area = document.createElement('textarea');
      area.value = html;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      area.style.top = '0';
      document.body.appendChild(area);
      area.select();
      copied = document.execCommand('copy');
      area.remove();
    } catch (fallbackError) {
      copied = false;
    }
  }
  if (!copied) {
    toast('No se pudo copiar. Probá desde el botón del código HTML.', { type: 'error' });
    return;
  }
  markPublished();
  if (sourceButton && sourceButton.id === 'bCopy') {
    setCopyFeedback(sourceButton, 'Copiar HTML', 'Copiado');
  }
  if (sourceButton && sourceButton.id === 'bCopy2') {
    setCopyFeedback(sourceButton, 'Copiar HTML', 'Copiado');
  }
  toast('HTML copiado. Pegalo en el modo HTML o Fuente del editor del sitio.', {
    duration: 3600,
    action: { label: 'Ver HTML', fn: () => setPreviewView('code') }
  });
}

async function copyPostTitle() {
  const title = cleanSpace(S.hero.title) || 'Post sin título';
  try {
    await navigator.clipboard.writeText(title);
    toast('Título copiado');
  } catch (error) {
    toast('No se pudo copiar el título', { type: 'error' });
  }
}

function downloadHtml() {
  const html = build(S);
  state.html = html;
  if (!html) {
    toast('Todavía no hay contenido para descargar', { type: 'warn' });
    return;
  }
  const blob = new Blob([standaloneDocument()], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${slugify(S.hero.title || 'post')}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  toast('HTML descargado');
}

/* ============================================================
   Hojas
   ============================================================ */
function focusableIn(container) {
  return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(element => !element.disabled && element.offsetParent !== null);
}

function openSheet(sheet, section) {
  if (!sheet) return;
  if (state.activeSheet && state.activeSheet !== sheet) closeSheet(state.activeSheet);
  state.lastFocus = document.activeElement;
  state.activeSheet = sheet;
  sheet.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  if (sheet.id === 'settingsSheet') {
    syncSettings();
    if (section === 'engine') {
      const engineSection = $('#engineSeg');
      if (engineSection) engineSection.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  if (sheet.id === 'helpSheet') syncHelp();
  if (sheet.id === 'imageSheet') renderImageChoices();
  setTimeout(() => {
    const focusable = focusableIn(sheet);
    if (focusable.length) focusable[0].focus();
  }, 40);
  checkReader(false);
}

function closeSheet(sheet) {
  if (!sheet) return;
  sheet.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
  if (state.activeSheet === sheet) state.activeSheet = null;
  if (!document.querySelector('.sheet.is-open')) document.body.classList.remove('sheet-open');
  if (state.lastFocus && state.lastFocus.isConnected) {
    try { state.lastFocus.focus(); } catch (error) { /* noop */ }
  }
  state.lastFocus = null;
}

function trapSheetFocus(event) {
  if (event.key !== 'Tab' || !state.activeSheet) return;
  const focusable = focusableIn(state.activeSheet);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openSettings(section) {
  openSheet($('#settingsSheet'), section);
}

function openHelp() {
  openSheet($('#helpSheet'));
}

function syncHelp() {
  const target = cleanSpace(prefs.targetName) || hostOf(prefs.targetUrl) || 'tu sitio';
  $('#helpTargetName').textContent = target;
  $('#helpTargetName2').textContent = target;
  $('#postTitleInput').value = cleanSpace(S.hero.title) || 'Post sin título';
  const url = safeHttpUrl(prefs.targetUrl);
  const openButton = $('#helpOpenTarget');
  openButton.disabled = !url;
  openButton.title = url || 'Configurá la URL en Ajustes';
  $('#helpHidden').hidden = !S.links.hide;
}

function openImageSheet() {
  const images = Array.isArray(S.source.images) ? S.source.images.filter(image => safeHttpUrl(image)) : [];
  const unique = [...new Set(images)];
  if (S.hero.img && safeHttpUrl(S.hero.img) && !unique.includes(S.hero.img)) unique.unshift(S.hero.img);
  state.imageChoice = S.hero.img || '';
  if (!unique.length) {
    $('#imageGrid').innerHTML = '';
    $('#imageEmpty').hidden = false;
  } else {
    $('#imageEmpty').hidden = true;
  }
  openSheet($('#imageSheet'));
}

function renderImageChoices() {
  const images = Array.isArray(S.source.images) ? [...new Set(S.source.images.map(image => safeHttpUrl(image)).filter(Boolean))] : [];
  if (S.hero.img && safeHttpUrl(S.hero.img) && !images.includes(S.hero.img)) images.unshift(S.hero.img);
  const grid = $('#imageGrid');
  const empty = $('#imageEmpty');
  if (!images.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = images.map(url => `<button type="button" data-image-url="${esc(url)}" class="${url === S.hero.img ? 'selected' : ''}" title="${esc(url)}">
    <img src="${esc(url)}" alt="Opción de portada" loading="lazy">
    <span>${esc(hostOf(url))}</span>
  </button>`).join('');
}

function chooseImage(url) {
  const safe = safeHttpUrl(url);
  if (!safe) return;
  S.hero.img = safe;
  markDirty();
  closeSheet($('#imageSheet'));
  renderForm();
  schedulePreview();
  persistDraft();
  toast('Imagen de portada actualizada');
}

/* ============================================================
   Actualización rápida desde la biblioteca
   ============================================================ */
function openUpdateSheet(id) {
  const entry = library.find(item => item.id === id);
  if (!entry) return;

  state.updateTarget = id;
  $('#updateSub').textContent = 'Solo se reemplazan las secciones sin candado.';
  $('#updateInput').value = '';
  $('#updateInput').placeholder = 'Pegá el link con la información nueva o el texto completo…';
  $('#updateStatus').hidden = true;
  $('#updateStatus').textContent = '';
  $('#updateStatus').className = 'update-status';
  $('#updateDetect').textContent = 'Esperando contenido.';

  const host = cleanSpace(entry.state.source && entry.state.source.siteName) || hostOf(entry.state.source && entry.state.source.url);
  $('#updateTarget').innerHTML =
    `<div class="update-target-title">${esc(entry.title || 'Post sin título')}</div>` +
    `<div class="update-target-meta">${esc(host || 'sin fuente')} · ${esc(relativeTime(entry.updatedAt))}</div>`;

  renderUpdatePlan(entry);
  openSheet($('#updateSheet'));
  setTimeout(() => $('#updateInput').focus(), 60);
}

function renderUpdatePlan(entry) {
  const locked = lockedSections(entry.state);
  const willUpdate = LOCKABLE_SECTIONS.filter(section => !locked.includes(section));
  const label = list => list.map(section => SECTION_LABELS[section]).join(', ');

  const rows = [];
  if (locked.length) {
    rows.push(`<div class="plan-line keep"><svg><use href="#i-lock"/></svg><span>Se conservan: <b>${esc(label(locked))}</b></span></div>`);
  }
  rows.push(willUpdate.length
    ? `<div class="plan-line upd"><svg><use href="#i-refresh"/></svg><span>Se actualizan: <b>${esc(label(willUpdate))}</b></span></div>`
    : `<div class="plan-line warn"><svg><use href="#i-alert"/></svg><span>Todo está bloqueado: desbloqueá alguna sección desde el editor.</span></div>`);

  $('#updatePlan').innerHTML = rows.join('');
  $('#updateRun').disabled = willUpdate.length === 0;
}

function setUpdateStatus(text, kind = '') {
  const box = $('#updateStatus');
  box.hidden = !text;
  box.textContent = text || '';
  box.className = 'update-status' + (kind ? ' ' + kind : '');
}

async function runLibraryUpdate() {
  const entry = library.find(item => item.id === state.updateTarget);
  if (!entry) return;
  const raw = $('#updateInput').value.trim();
  if (!raw) {
    $('#updateInput').focus();
    return;
  }

  const detected = detectInput(raw);
  if (detected.kind === 'empty') return;

  const button = $('#updateRun');
  button.disabled = true;
  button.classList.add('loading');
  setUpdateStatus('Preparando…');

  try {
    if (detected.kind === 'url') {
      const direct = toDirectDownload(detected.url);
      if (direct.service) {
        setUpdateStatus(`Ese enlace es una descarga de ${direct.service}, no una página con contenido para analizar.`, 'err');
        return;
      }
    }

    let payload;
    let sourceUrl = '';
    if (detected.kind === 'url') {
      setUpdateStatus('Leyendo el enlace…');
      const fetched = await readUrl(detected.url, { onStage: text => setUpdateStatus(text) });
      payload = { text: fetched.text, html: fetched.html, meta: fetched.meta };
      sourceUrl = fetched.finalUrl || detected.url;
    } else {
      payload = { text: raw, html: detected.kind === 'html' ? raw : '', meta: null };
    }

    setUpdateStatus('Analizando…');
    const options = {
      tone: prefs.tone,
      depth: prefs.depth,
      noOpen: prefs.noOpen,
      seed: `${Date.now()}-${Math.random().toString(36).slice(2)}`
    };
    const baseline = analyze(payload, { ...options, sourceUrl });

    let post = baseline;
    if (prefs.engine !== 'local' && aiHasKey(prefs.engine, keys, prefs.openaiBase)) {
      setUpdateStatus(`Redactando con ${aiEngineLabel(prefs.engine)}…`);
      try {
        const result = await runAI({
          sourceText: payload.text || '',
          baseline,
          options,
          config: {
            engine: prefs.engine,
            keys,
            geminiModel: prefs.geminiModel,
            openaiBase: prefs.openaiBase,
            openaiModel: prefs.openaiModel
          }
        });
        post = result.post;
      } catch (error) {
        // Si la IA falla, se aplica el resultado local.
      }
    }

    const merged = mergeSections(entry.state, post);
    const nextState = normalizePostState({ ...entry.state, ...merged, id: entry.id });
    entry.state = nextState;
    entry.title = cleanSpace(nextState.hero.title) || entry.title || 'Post sin título';
    entry.thumb = safeHttpUrl(nextState.hero.img);
    entry.site = cleanSpace(nextState.source.siteName) || hostOf(nextState.source.url);
    entry.updatedAt = Date.now();
    writeJson(STORAGE.library, library);
    renderLibrary();

    // Si el post está abierto en el editor, se refleja al instante.
    if (S.id === entry.id) {
      S = normalizePostState(clone(nextState));
      state.summary = null;
      renderForm();
      renderPreview();
      renderTitlebar();
      persistDraftNow();
    }

    const kept = lockedSectionsLabel(entry.state);
    closeSheet($('#updateSheet'));
    toast(`Actualizado${kept ? ` · conservé ${kept}` : ''}`, {
      duration: 4200,
      action: { label: 'Abrir', fn: () => openLibraryEntry(entry.id) }
    });
  } catch (error) {
    setUpdateStatus(error && error.message ? error.message : 'No se pudo actualizar el post.', 'err');
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
  }
}

/* ============================================================
   Ajustes
   ============================================================ */
function syncSettings() {
  $('#setTone').value = prefs.tone;
  $('#setDepth').value = prefs.depth;
  $('#setNoOpen').checked = prefs.noOpen;
  document.querySelectorAll('#appearanceSeg [data-appearance-choice]').forEach(choice => {
    choice.classList.toggle('on', choice.dataset.appearanceChoice === prefs.appearance);
  });
  document.querySelectorAll('#engineSeg [data-engine]').forEach(choice => {
    choice.classList.toggle('on', choice.dataset.engine === prefs.engine);
  });
  $('#geminiBox').classList.toggle('on', prefs.engine === 'gemini');
  $('#openaiBox').classList.toggle('on', prefs.engine === 'openai');
  $('#geminiKey').value = keys.gemini || '';
  $('#geminiModel').value = prefs.geminiModel;
  $('#openaiBase').value = prefs.openaiBase;
  $('#openaiModel').value = prefs.openaiModel;
  $('#openaiKey').value = keys.openai || '';
  $('#setTargetName').value = prefs.targetName;
  $('#setTargetUrl').value = prefs.targetUrl;
  const hints = {
    local: 'El motor local es gratis, no usa API Key y no traduce textos de otro idioma.',
    gemini: 'Gemini reescribe, traduce y ordena el contenido. Necesita una API Key de Google AI Studio.',
    openai: 'Usa cualquier endpoint compatible con OpenAI. También sirve para Ollama o LM Studio.'
  };
  $('#engineHint').textContent = hints[prefs.engine];
  $('#toneSelect').value = prefs.tone;
  renderServerStatus();
}

function setEngineTest(kind, message) {
  const dot = $('#engineTestDot');
  dot.className = `status-dot${kind ? ' ' + kind : ''}`;
  $('#engineTestText').textContent = message;
}

async function runTestAI(engine) {
  setEngineTest('wait', 'Probando la conexión…');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const result = await testAI({
      engine,
      keys,
      geminiModel: prefs.geminiModel,
      openaiBase: prefs.openaiBase,
      openaiModel: prefs.openaiModel
    }, controller.signal);
    setEngineTest(result.ok ? 'ok' : 'err', result.detail);
  } catch (error) {
    setEngineTest('err', error && error.message ? error.message : 'No se pudo probar la conexión.');
  } finally {
    clearTimeout(timer);
  }
}

function renderServerStatus() {
  const available = state.reader.available;
  const checked = state.reader.checked;
  const pill = $('#serverStatus');
  if (pill) {
    pill.className = `status-pill ${available ? 'ok' : (checked ? 'err' : '')}`;
    pill.innerHTML = `<span class="status-dot${available ? ' ok' : (checked ? ' err' : '')}"></span><span>${available ? 'Activo' : (checked ? 'Inactivo' : 'Comprobando')}</span>`;
  }
  const detail = $('#serverDetail');
  if (detail) {
    detail.textContent = available
      ? 'Las páginas se leen directamente desde este equipo.'
      : (checked ? 'No se detectó el servidor local. Usamos lectores públicos.' : 'Comprobando si el servidor local está activo…');
  }
  const reader = $('#readerStatus');
  if (reader) {
    reader.classList.toggle('is-on', available);
    const text = reader.querySelector('.txt');
    if (text) text.textContent = available ? 'Lector local activo' : (checked ? 'Lectores públicos' : 'Comprobando lector…');
    reader.title = available ? 'El servidor local está leyendo las páginas.' : 'Sin servidor local: se usan lectores públicos de respaldo.';
  }
}

async function checkReader(force) {
  try {
    const available = await checkLocalReader(force);
    state.reader.available = Boolean(available);
    state.reader.checked = true;
  } catch (error) {
    state.reader.available = false;
    state.reader.checked = true;
  }
  renderServerStatus();
}

/* ============================================================
   Importar / exportar
   ============================================================ */
function exportLibrary() {
  const payload = {
    app: 'postinga',
    version: 2,
    exportedAt: new Date().toISOString(),
    prefs: { ...prefs },
    current: clone(S),
    library: library.map(entry => ({ ...entry, state: entry.state }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  link.download = `postinga-biblioteca-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  toast('Biblioteca exportada');
}

function addImportedPost(value) {
  const normalized = normalizePostState(value);
  normalized.id = normalized.id || uid('post');
  const existing = library.find(entry => entry.id === normalized.id);
  const record = {
    id: normalized.id,
    title: cleanSpace(normalized.hero.title) || 'Post importado',
    thumb: safeHttpUrl(normalized.hero.img),
    site: cleanSpace(normalized.source.siteName) || hostOf(normalized.source.url),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    published: false,
    publishedAt: 0,
    state: normalized
  };
  if (existing) Object.assign(existing, record);
  else library.unshift(record);
  return record;
}

function importData(data) {
  let imported = 0;
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (item && item.state) {
        const stateValue = normalizePostState(item.state);
        stateValue.id = item.id || stateValue.id;
        addImportedPost(stateValue);
        imported += 1;
      } else if (item && (item.hero || item.info)) {
        addImportedPost(item);
        imported += 1;
      }
    });
  } else if (data && Array.isArray(data.library)) {
    data.library.forEach(entry => {
      if (!entry || !entry.state) return;
      const value = normalizePostState(entry.state);
      value.id = entry.id || value.id;
      addImportedPost(value);
      imported += 1;
    });
    if (data.prefs && typeof data.prefs === 'object') {
      Object.keys(DEFAULT_PREFS).forEach(key => {
        if (data.prefs[key] !== undefined && data.prefs[key] !== null) prefs[key] = data.prefs[key];
      });
      savePrefs();
      applyAppearance();
    }
    if (data.current && data.current.hero) {
      const currentState = normalizePostState(data.current);
      if (!library.some(entry => entry.id === currentState.id)) {
        addImportedPost(currentState);
        imported += 1;
      }
    }
  } else if (data && (data.hero || data.info)) {
    addImportedPost(data);
    imported += 1;
  }

  pruneLibrary();
  writeJson(STORAGE.library, library);
  if (imported) {
    const first = library[0];
    if (first) {
      S = normalizePostState(clone(first.state));
      S.id = first.id;
      state.dirty = false;
      persistDraftNow();
      renderForm();
      renderPreview();
      renderTitlebar();
    }
  }
  renderLibrary();
  syncSettings();
  toast(imported ? `${imported} ${imported === 1 ? 'post importado' : 'posts importados'}` : 'No encontramos posts en el archivo', { type: imported ? 'success' : 'warn' });
}

function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importData(JSON.parse(reader.result));
    } catch (error) {
      toast('El archivo no es un JSON válido', { type: 'error' });
    }
  };
  reader.onerror = () => toast('No se pudo leer el archivo', { type: 'error' });
  reader.readAsText(file);
}

function clearAllData() {
  const button = $('#bClearAll');
  if (button.dataset.armed !== '1') {
    button.dataset.armed = '1';
    button.textContent = '¿Seguro? Borrar todo';
    setTimeout(() => {
      if (button.isConnected) {
        button.dataset.armed = '0';
        button.innerHTML = '<svg><use href="#i-trash"/></svg> Borrar todo';
      }
    }, 3200);
    return;
  }
  [STORAGE.draft, STORAGE.library, STORAGE.prefs, STORAGE.keys, STORAGE.legacy].forEach(key => {
    try { localStorage.removeItem(key); } catch (error) { /* noop */ }
  });
  button.dataset.armed = '0';
  button.innerHTML = '<svg><use href="#i-trash"/></svg> Borrar todo';
  prefs = { ...DEFAULT_PREFS };
  keys = { ...DEFAULT_KEYS };
  library = [];
  S = normalizePostState({ ...BLANK, id: uid('post') });
  state.dirty = false;
  state.summary = null;
  state.captureMin = false;
  state.alert = null;
  savedAt = 0;
  captureInput.value = '';
  applyAppearance();
  renderForm();
  renderPreview();
  renderTitlebar();
  renderLibrary();
  renderCapture();
  syncSettings();
  closeSheet($('#settingsSheet'));
  toast('Datos borrados. Empezamos de cero.');
}

/* ============================================================
   Nuevo / ejemplo / guardar / abrir
   ============================================================ */
function loadExample() {
  state.attachments = [];
  renderAttachments();
  // El ejemplo usa el diseño actual para no cambiar el tema de golpe.
  const design = { theme: S.theme, accent: S.accent, sep: (S.sep || []).slice(0, 3) };
  S = normalizePostState({ ...clone(DEF), id: uid('post'), ...design });
  state.summary = null;
  state.captureMin = false;
  state.alert = null;
  state.pendingSourceUrl = '';
  state.panelOpen = { hero: true, info: true, items: true, specs: false, links: true, design: false };
  captureInput.value = '';
  S.locked = { hero: false, info: false, items: false, specs: false, links: false };
  markDirty();
  renderForm();
  renderPreview();
  renderTitlebar();
  renderCapture();
  persistDraftNow();
  setMobileView('editor');
  toast('Ejemplo cargado · ⌘N para empezar de cero', { duration: 3600 });
}

function newPost() {
  if (state.dirty) saveCurrentToLibrary(true);
  state.attachments = [];
  renderAttachments();
  const design = { theme: S.theme, accent: S.accent, sep: S.sep.slice(0, 3) };
  S = normalizePostState({ ...clone(BLANK), id: uid('post'), ...design });
  state.dirty = false;
  state.summary = null;
  state.captureMin = false;
  state.alert = null;
  state.pendingSourceUrl = '';
  state.panelOpen = { hero: true, info: true, items: true, specs: false, links: true, design: false };
  captureInput.value = '';
  savedAt = 0;
  refreshDetection();
  renderForm();
  renderPreview();
  renderTitlebar();
  renderLibrary();
  renderCapture();
  persistDraftNow();
  setMobileView('editor');
  editorPane.scrollTop = 0;
  closeSidebar();
  setTimeout(() => captureInput.focus(), 80);
  toast('Post nuevo listo');
}

/* ============================================================
   Publicación
   ============================================================ */
function openTargetSite() {
  const url = safeHttpUrl(prefs.targetUrl);
  if (!url) {
    toast('Configurá la URL del sitio en Ajustes', { type: 'warn' });
    openSettings();
    return;
  }
  const win = window.open(url, '_blank', 'noopener');
  if (!win) toast('El navegador bloqueó la pestaña nueva', { type: 'warn' });
}

/* ============================================================
   Navegación / sidebar / móvil
   ============================================================ */
function setMobileView(view) {
  const allowed = ['editor', 'preview', 'library'];
  const value = allowed.includes(view) ? view : 'editor';
  document.body.dataset.mv = value;
  document.querySelectorAll('#tabbar [data-mv]').forEach(button => {
    button.classList.toggle('on', button.dataset.mv === value);
  });
  if (value !== 'library') closeSidebar(true);
}

function openSidebar() {
  if (window.matchMedia('(max-width: 900px)').matches) {
    setMobileView('library');
    return;
  }
  document.body.classList.add('sidebar-open');
  $('#scrim').hidden = false;
  setTimeout(() => {
    const first = $('#bNew');
    if (first) first.focus();
  }, 40);
}

function closeSidebar(keepMobileView) {
  document.body.classList.remove('sidebar-open');
  const scrim = $('#scrim');
  if (scrim) scrim.hidden = true;
  if (!keepMobileView && window.matchMedia('(max-width: 900px)').matches && document.body.dataset.mv === 'library') {
    setMobileView('editor');
  }
}

/* ============================================================
   Eventos
   ============================================================ */
let formInputRaf = 0;

function bindEvents() {
  /* --- Formulario --- */
  formEl.addEventListener('input', event => {
    const target = event.target;
    const path = target.dataset.p;
    if (!path) return;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setP(S, path, value);
    markDirty();
    if (target.tagName === 'TEXTAREA') autoResize(target);
    if (path === 'hero.img') refreshImageThumb();
    if (path.startsWith('info.items.')) updateItemIndicators(path);
    updateCharCounters();
    if (!formInputRaf) {
      formInputRaf = requestAnimationFrame(() => {
        formInputRaf = 0;
        schedulePreview();
      });
    }
    persistDraft();
  });

  formEl.addEventListener('click', handleFormClick);

  // Al pegar un enlace de descarga, se convierte solo a descarga directa.
  formEl.addEventListener('change', event => {
    const path = event.target.dataset.p;
    if (!path || !/^links\.btns\.\d+\.url$/.test(path)) return;
    const result = toDirectDownload(event.target.value);
    if (!result.changed) return;

    const previous = event.target.value;
    setP(S, path, result.url);
    event.target.value = result.url;
    markDirty();
    schedulePreview();
    persistDraft();
    renderForm();
    toast(`Enlace de ${result.service} convertido a descarga directa`, {
      action: {
        label: 'Deshacer',
        fn: () => {
          setP(S, path, previous);
          markDirty();
          renderForm();
          schedulePreview();
          persistDraft();
          toast('Conversión deshecha', { type: 'warn' });
        }
      }
    });
  });

  /* --- Captura --- */
  captureInput.addEventListener('input', () => {
    if (state.summary) {
      state.summary = null;
      state.captureMin = false;
    }
    if (state.alert && state.alert.info) state.alert = null;
    refreshDetection();
    renderCapture();
  });

  captureInput.addEventListener('paste', () => {
    setTimeout(refreshDetection, 30);
  });

  captureInput.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      runCapture();
    }
  });

  $('#captureCard').addEventListener('click', event => {
    if (event.target.closest('#bAnalyze')) return runCapture();
    if (event.target.closest('#bCancel')) return cancelCapture();
    if (event.target.closest('#bCaptureToggle')) {
      if (state.analyzing) return;
      state.captureMin = !state.captureMin;
      renderCapture();
      return;
    }
    if (event.target.closest('#engineChip') || event.target.closest('#bCaptureOptions')) {
      openSettings('engine');
      return;
    }
    if (event.target.closest('[data-unlock-all]')) {
      LOCKABLE_SECTIONS.forEach(section => { S.locked[section] = false; });
      markDirty();
      renderForm();
      renderCapture();
      persistDraft();
      toast('Secciones desbloqueadas');
      return;
    }
    const action = event.target.closest('[data-capture-action]');
    if (action) handleCaptureAction(action.dataset.captureAction);
  });

  $('#toneSelect').addEventListener('change', event => {
    prefs.tone = event.target.value;
    savePrefs();
    syncSettings();
    toast(`Tono: ${event.target.options[event.target.selectedIndex].text}`);
  });

  /* --- Drag & drop de la captura --- */
  const dropZone = $('#captureDrop');
  ['dragenter', 'dragover'].forEach(type => {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.add('drag');
    });
  });
  ['dragleave', 'drop'].forEach(type => {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.remove('drag');
    });
  });
  dropZone.addEventListener('drop', event => {
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) {
      const proyectos = files.filter(file => /\.json$/i.test(file.name));
      const adjuntos = files.filter(file => !/\.json$/i.test(file.name));
      if (adjuntos.length) addAttachments(adjuntos);
      else if (proyectos.length) toast('Para importar un proyecto usá Ajustes > Importar', { type: 'warn' });
      return;
    }
    const text = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
    if (text) {
      const actual = captureInput.value.trim();
      captureInput.value = actual ? `${actual}\n\n${text.trim()}` : text.trim();
      refreshDetection();
      captureInput.focus();
    }
  });

  /* --- Biblioteca --- */
  $('#libList').addEventListener('click', event => {
    const del = event.target.closest('[data-del]');
    if (del) {
      event.stopPropagation();
      deleteLibraryEntry(del.dataset.del);
      return;
    }
    const dup = event.target.closest('[data-dup]');
    if (dup) {
      event.stopPropagation();
      duplicateLibraryEntry(dup.dataset.dup);
      return;
    }
    const upd = event.target.closest('[data-update]');
    if (upd) {
      event.stopPropagation();
      openUpdateSheet(upd.dataset.update);
      return;
    }
    const item = event.target.closest('.lib-item');
    if (item) openLibraryEntry(item.dataset.id);
  });

  $('#libList').addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('button')) return;
    const item = event.target.closest('.lib-item');
    if (!item) return;
    event.preventDefault();
    openLibraryEntry(item.dataset.id);
  });

  $('#bAttach').addEventListener('click', () => $('#attachInput').click());
  $('#attachInput').addEventListener('change', event => {
    addAttachments(event.target.files);
    event.target.value = '';
  });
  $('#attachRow').addEventListener('click', event => {
    const button = event.target.closest('[data-detach]');
    if (button) removeAttachment(button.dataset.detach);
  });

  $('#libSearch').addEventListener('input', renderLibrary);
  $('#libClear').addEventListener('click', () => {
    $('#libSearch').value = '';
    renderLibrary();
    $('#libSearch').focus();
  });

  /* --- Navegación --- */
  $('#bNew').addEventListener('click', newPost);
  const exampleButton = $('#bLoadExample');
  if (exampleButton) exampleButton.addEventListener('click', loadExample);
  $('#bSideToggle').addEventListener('click', toggleSidebarCollapsed);
  $('#bMenu').addEventListener('click', openSidebar);
  $('#bSideClose').addEventListener('click', () => closeSidebar());
  $('#scrim').addEventListener('click', () => closeSidebar());
  $('#bSettings').addEventListener('click', () => openSettings());
  $('#bHelpSide').addEventListener('click', openHelp);
  $('#bHelp').addEventListener('click', openHelp);
  $('#bCaptureFocus').addEventListener('click', () => {
    setMobileView('editor');
    state.captureMin = false;
    renderCapture();
    editorPane.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => captureInput.focus(), 120);
  });

  document.querySelectorAll('#tabbar [data-mv]').forEach(button => {
    button.addEventListener('click', () => setMobileView(button.dataset.mv));
  });

  /* --- Barra superior / vista previa --- */
  document.querySelectorAll('#themeToggle [data-appearance-choice]').forEach(button => {
    button.addEventListener('click', () => setAppearance(button.dataset.appearanceChoice));
  });
  $('#bSave').addEventListener('click', () => {
    if (!saveCurrentToLibrary(false)) toast('Agregá contenido antes de guardar', { type: 'warn' });
    persistDraftNow();
  });
  $('#bCopy').addEventListener('click', event => copyHtml(event.currentTarget));
  $('#bCopy2').addEventListener('click', event => copyHtml(event.currentTarget));
  $('#bOpenPreview').addEventListener('click', openPreviewTab);

  document.querySelectorAll('#viewSeg [data-view]').forEach(button => {
    button.addEventListener('click', () => setPreviewView(button.dataset.view));
  });
  document.querySelectorAll('#deviceSeg [data-device]').forEach(button => {
    button.addEventListener('click', () => setDevice(button.dataset.device));
  });

  /* --- Hojas --- */
  document.querySelectorAll('.sheet').forEach(sheet => {
    sheet.addEventListener('keydown', trapSheetFocus);
    sheet.querySelectorAll('[data-close]').forEach(button => {
      button.addEventListener('click', () => closeSheet(sheet));
    });
  });

  /* --- Ajustes --- */
  document.querySelectorAll('#appearanceSeg [data-appearance-choice]').forEach(button => {
    button.addEventListener('click', () => {
      prefs.appearance = button.dataset.appearanceChoice;
      savePrefs();
      applyAppearance();
    });
  });
  $('#setTone').addEventListener('change', event => {
    prefs.tone = event.target.value;
    savePrefs();
    $('#toneSelect').value = prefs.tone;
  });
  $('#setDepth').addEventListener('change', event => {
    prefs.depth = event.target.value;
    savePrefs();
  });
  $('#setNoOpen').addEventListener('change', event => {
    prefs.noOpen = event.target.checked;
    savePrefs();
  });
  document.querySelectorAll('#engineSeg [data-engine]').forEach(button => {
    button.addEventListener('click', () => {
      prefs.engine = button.dataset.engine;
      savePrefs();
      syncSettings();
      renderTitlebar();
      setEngineTest('', 'Sin probar todavía.');
    });
  });
  $('#geminiKey').addEventListener('input', event => {
    keys.gemini = event.target.value.trim();
    saveKeys();
  });
  $('#geminiModel').addEventListener('change', event => {
    prefs.geminiModel = event.target.value;
    savePrefs();
  });
  $('#openaiBase').addEventListener('input', event => {
    prefs.openaiBase = event.target.value.trim();
    savePrefs();
  });
  $('#openaiModel').addEventListener('input', event => {
    prefs.openaiModel = event.target.value.trim();
    savePrefs();
  });
  $('#openaiKey').addEventListener('input', event => {
    keys.openai = event.target.value.trim();
    saveKeys();
  });
  $('#bToggleGeminiKey').addEventListener('click', () => {
    const input = $('#geminiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  $('#bToggleOpenaiKey').addEventListener('click', () => {
    const input = $('#openaiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  $('#bTestGemini').addEventListener('click', () => runTestAI('gemini'));
  $('#bTestOpenai').addEventListener('click', () => runTestAI('openai'));
  $('#bCheckServer').addEventListener('click', () => checkReader(true));
  $('#setTargetName').addEventListener('input', event => {
    prefs.targetName = event.target.value;
    savePrefs();
  });
  $('#setTargetUrl').addEventListener('input', event => {
    prefs.targetUrl = event.target.value.trim();
    savePrefs();
  });
  $('#updateRun').addEventListener('click', runLibraryUpdate);
  $('#updateInput').addEventListener('input', () => {
    const value = $('#updateInput').value.trim();
    const label = detectLabel(value);
    $('#updateDetect').textContent = label.html;
  });
  $('#updateInput').addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      runLibraryUpdate();
    }
  });
  $('#bExportLib').addEventListener('click', exportLibrary);
  $('#bImportLib').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (file) importFile(file);
    event.target.value = '';
  });
  $('#bClearAll').addEventListener('click', clearAllData);

  /* --- Publicación --- */
  $('#helpCopy').addEventListener('click', event => copyHtml(event.currentTarget));
  $('#helpDownload').addEventListener('click', downloadHtml);
  $('#helpPreviewTab').addEventListener('click', openPreviewTab);
  $('#helpOpenTarget').addEventListener('click', openTargetSite);
  $('#bCopyTitle').addEventListener('click', copyPostTitle);

  /* --- Imagen --- */
  $('#imageGrid').addEventListener('click', event => {
    const button = event.target.closest('[data-image-url]');
    if (button) chooseImage(button.dataset.imageUrl);
  });

  /* --- Toast --- */
  $('#toastAction').addEventListener('click', () => {
    if (typeof toastActionFn === 'function') toastActionFn();
    $('#toast').classList.remove('show');
    toastActionFn = null;
  });

  /* --- Teclado global --- */
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (state.activeSheet) {
        event.preventDefault();
        closeSheet(state.activeSheet);
        return;
      }
      if (state.analyzing) {
        event.preventDefault();
        cancelCapture();
        return;
      }
      if (document.body.classList.contains('sidebar-open')) {
        closeSidebar();
        return;
      }
      if (document.body.dataset.mv === 'library') {
        setMobileView('editor');
        return;
      }
      if ($('#libSearch').value) {
        $('#libSearch').value = '';
        renderLibrary();
      }
      return;
    }

    const meta = event.metaKey || event.ctrlKey;
    if (!meta) return;
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      copyHtml($('#bCopy'));
    } else if (key === 'n') {
      event.preventDefault();
      newPost();
    } else if (key === 's') {
      event.preventDefault();
      saveCurrentToLibrary(false);
      persistDraftNow();
    } else if (key === 'enter') {
      event.preventDefault();
      if (!state.analyzing) runCapture();
    } else if (key === '\\') {
      event.preventDefault();
      if (isWideLayout()) toggleSidebarCollapsed();
      else if (document.body.classList.contains('sidebar-open')) closeSidebar();
      else openSidebar();
    }
  });

  /* --- Cambios de color del sistema --- */
  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (prefs.appearance === 'auto') applyAppearance();
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }

  /* --- Persistencia al cerrar --- */
  window.addEventListener('beforeunload', () => {
    try { localStorage.setItem(STORAGE.draft, JSON.stringify(S)); } catch (error) { /* noop */ }
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 900px)').matches) closeSidebar(true);
    applySidebarState();
  });
}

/* ============================================================
   Inicialización
   ============================================================ */
function init() {
  applyAppearance();
  applySidebarState();
  captureInput.value = '';
  renderForm();
  renderLibrary();
  renderTitlebar();
  renderCapture();
  syncSettings();
  syncHelp();
  setPreviewView('preview');
  setDevice('desktop');
  setMobileView('editor');
  bindEvents();
  initPreview();
  refreshDetection();
  autoResize(captureInput, 230);
  checkReader(false);
  setInterval(renderTitlebar, 60000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
