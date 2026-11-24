/**
 * Postinga
 * Constantes, paletas de salida, plantillas y utilidades compartidas.
 * Sin dependencias: este archivo se carga como script clásico.
 */

/* ============================================================
   Tipografía (se usa dentro del HTML que se pega en Taringa)
   ============================================================ */
const FONT_DISPLAY = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif";
const FONT_TEXT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

/* ============================================================
   Etiquetas de las características
   ============================================================ */
const COLORS = [
  ['naranja', 'Naranja'],
  ['azul', 'Azul'],
  ['rojo', 'Rojo'],
  ['amarillo', 'Amarillo'],
  ['violeta', 'Violeta'],
  ['verde', 'Verde'],
  ['rosa', 'Rosa'],
  ['gris', 'Gris']
];

// [fondo, texto] para cada color, según la paleta del post.
const TAGS = {
  light: {
    naranja: ['#fff0dc', '#9a4d00'],
    azul: ['#e4efff', '#0058b8'],
    rojo: ['#ffe6e2', '#b3261e'],
    amarillo: ['#fff6cc', '#755900'],
    violeta: ['#f0e7ff', '#6330b8'],
    verde: ['#ddf6e5', '#146b33'],
    rosa: ['#ffe4ed', '#b0124a'],
    gris: ['#eeeef2', '#48484d']
  },
  dark: {
    naranja: ['#3a2a12', '#ffb340'],
    azul: ['#12294a', '#6db3ff'],
    rojo: ['#3d1b18', '#ff8a80'],
    amarillo: ['#3a3210', '#ffd60a'],
    violeta: ['#2d1b45', '#cf8cff'],
    verde: ['#12301f', '#5be584'],
    rosa: ['#3d1526', '#ff7aa2'],
    gris: ['#2c2c2e', '#c7c7cc']
  }
};

/* ============================================================
   Acentos del post
   ============================================================ */
const ACCENTS = {
  azul: ['Azul', { light: '#0071e3', dark: '#0a84ff' }],
  violeta: ['Violeta', { light: '#6d4aff', dark: '#bf5af2' }],
  rosa: ['Rosa', { light: '#d6206b', dark: '#ff375f' }],
  naranja: ['Naranja', { light: '#c25a00', dark: '#ff9f0a' }],
  verde: ['Verde', { light: '#0a7b3e', dark: '#30d158' }],
  grafito: ['Grafito', { light: '#1d1d1f', dark: '#f5f5f7' }]
};

/* ============================================================
   Paletas del post (todo va inline en el HTML final)
   ============================================================ */
const PAL = {
  light: {
    win: '#ffffff',
    border: '#e3e3e8',
    line: '#ececf0',
    bar: '#f6f6f8',
    barTx: '#86868b',
    hero: '#ffffff',
    title: '#1d1d1f',
    sub: '#6e6e73',
    imgB: '#e5e5ea',
    imgSh: 'rgba(0,0,0,0.18)',
    shadow: 'rgba(15,15,20,0.10)',
    para: '#424245',
    card: '#ffffff',
    cardB: '#e5e5ea',
    row: '#ededf1',
    cardTx: '#6e6e73',
    b2: '#f5f5f7',
    b2B: '#d2d2d7',
    b2T: '#1d1d1f',
    pv: '#ffffff'
  },
  dark: {
    win: '#1c1c1e',
    border: '#38383a',
    line: '#38383a',
    bar: '#2c2c2e',
    barTx: '#98989d',
    hero: '#1c1c1e',
    title: '#f5f5f7',
    sub: '#98989d',
    imgB: '#3a3a3c',
    imgSh: 'rgba(0,0,0,0.55)',
    shadow: 'rgba(0,0,0,0.46)',
    para: '#c7c7cc',
    card: '#2c2c2e',
    cardB: '#3a3a3c',
    row: '#38383a',
    cardTx: '#a1a1a6',
    b2: '#2c2c2e',
    b2B: '#48484a',
    b2T: '#f5f5f7',
    pv: '#000000'
  }
};

/* ============================================================
   Contenido de ejemplo (primer arranque)
   ============================================================ */
const DEF = {
  id: 'demo-sylenth1',
  theme: 'dark',
  accent: 'azul',
  locked: { hero: false, info: false, items: false, specs: false, links: false },
  sep: [
    '👋 Bienvenidos',
    'ℹ️ Información',
    '📥 Links de Descarga'
  ],
  source: {
    url: 'https://www.lennardigital.com/sylenth1/',
    siteName: 'lennardigital.com',
    type: 'software',
    images: []
  },
  hero: {
    win: 'LennarDigital Sylenth1 — Vista previa',
    img: 'https://www.lennardigital.com/sylenth1/screenshot3.jpg',
    title: 'LennardDigital Sylenth1',
    sub: 'Sintetizador analógico virtual VSTi / AU / AAX con más de 2500 presets.'
  },
  info: {
    win: 'Ficha técnica — LennarDigital Sylenth1',
    greet: 'Qué hacés, maquinola del diseño sonoro.',
    paras: 'Pocos sintetizadores de software lograron estar a la altura de la calidez y la calidad sonora de un equipo analógico real, y [[LennardDigital Sylenth1]] es uno de ellos. Pensado desde el punto de vista del productor, combina una interfaz intuitiva con una pegada que sigue marcando el ritmo en la música electrónica y urbana.\n\nHoy te traigo el repaso completo por el **Sylenth1**, una bestia polifónica de 16 notas capaz de disparar hasta **512 voces de oscilador y 32 filtros en tiempo real** sin despeinar el procesador de tu PC o Mac.',
    hlTitle: 'Por qué sigue siendo un estándar en el estudio?',
    hlText: 'Por tres motivos concretos: **calidez y nitidez analógica desde los subgraves (0.01 Hz) hasta los agudos más cristalinos**, **código escrito con instrucciones SSE ultrarrápidas** y **más de 2500 presets incluidos**.',
    listTitle: 'Arquitectura y motor de sonido',
    items: [
      {
        tag: 'OSCILADORES',
        color: 'naranja',
        name: '4 Osciladores Alias-Free al Unísono (hasta 512 voces)',
        desc: 'Generan formas de onda analógicas en estéreo completo con hasta 8 voces al unísono por oscilador (32 voces por nota y 512 voces simultáneas en 16 notas de polifonía).'
      },
      {
        tag: 'FILTROS',
        color: 'azul',
        name: '2 Secciones de Filtros Analógicos de 4 Etapas',
        desc: 'Modos Lowpass, Bandpass y Highpass con pendientes de 12 dB o 24 dB, saturación no lineal integrada y control Filter Drive para llevar la resonancia más allá de la auto-oscilación.'
      },
      {
        tag: 'MODULACIÓN',
        color: 'violeta',
        name: '4 Envolventes ADSR, 2 LFOs y 16 Slots de Modulación',
        desc: 'Dos LFOs con 11 formas de onda distintas, 4 envolventes ADSR por nota y 16 ranuras con 24 parámetros asignables, además de velocidad, keytrack, rueda de modulación y MIDI Learn.'
      },
      {
        tag: 'MASTER FX',
        color: 'verde',
        name: 'Arpegiador + 7 Efectos Master en Panel LCD',
        desc: 'Arpegiador por pasos con 10 modos melódicos, acompañado por Distorsión (5 modos con oversampling 4x), Phaser de 6 etapas, Chorus/Flanger de 4 etapas, EQ, Delay Ping-Pong, Reverb y Compresor estéreo.'
      }
    ],
    specTitle: 'Requisitos y compatibilidad oficial',
    specs: [
      { k: 'Formatos', v: 'VSTi, AU (Audio Units) y AAX.' },
      { k: 'Windows', v: 'Windows 7, 8, 10 y 11 (32 / 64-bit).' },
      { k: 'macOS', v: 'macOS 10.9 o superior (nativo ARM Apple Silicon e Intel).' },
      { k: 'Hardware mínimo', v: 'CPU con soporte SSE (Intel Pentium III / AMD XP o superior, todos los Mac Intel y M1/M2+) y 128 MB de RAM.' }
    ]
  },
  links: {
    title: 'Descargalo desde el sitio oficial',
    text: 'LennardDigital ofrece una versión demo gratuita para Windows y macOS:',
    hide: true,
    btns: [
      {
        label: 'Descargar Demo en lennardigital.com',
        url: 'https://www.lennardigital.com/downloads/',
        style: 'primary'
      },
      {
        label: 'Ver especificaciones en lennardigital.com',
        url: 'https://www.lennardigital.com/sylenth1/specs.php',
        style: 'secondary'
      }
    ]
  }
};

/* Estructura vacía para "Nuevo post" */
const BLANK = {
  id: null,
  theme: 'light',
  accent: 'azul',
  locked: { hero: false, info: false, items: false, specs: false, links: false },
  sep: ['👋 Bienvenidos', 'ℹ️ Información', '📥 Links de Descarga'],
  source: { url: '', siteName: '', type: 'generic', images: [] },
  hero: { win: '', img: '', title: '', sub: '' },
  info: {
    win: '',
    greet: '',
    paras: '',
    hlTitle: '',
    hlText: '',
    listTitle: 'Características principales',
    items: [],
    specTitle: 'Especificaciones',
    specs: []
  },
  links: { title: 'Enlaces oficiales', text: '', hide: true, btns: [] }
};

/* Creadores de filas nuevas */
const NEW = {
  'info.items': () => ({ tag: 'DESTACADO', color: 'verde', name: 'Nueva característica', desc: '' }),
  'info.specs': () => ({ k: 'Dato', v: '' }),
  'links.btns': () => ({ label: 'Nuevo enlace', url: 'https://', style: 'secondary' })
};

/* Secciones del post que se pueden bloquear para no pisarlas al analizar */
const LOCKABLE_SECTIONS = ['hero', 'info', 'items', 'specs', 'links'];

const SECTION_LABELS = {
  hero: 'Portada',
  info: 'Información',
  items: 'Características',
  specs: 'Ficha técnica',
  links: 'Enlaces'
};

function isSectionLocked(post, section) {
  return Boolean(post && post.locked && post.locked[section]);
}

function lockedSections(post) {
  return LOCKABLE_SECTIONS.filter(section => isSectionLocked(post, section));
}

function lockedSectionsLabel(post) {
  const list = lockedSections(post).map(section => SECTION_LABELS[section]);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1];
}

/**
 * Combina el resultado del análisis con el post actual respetando los candados.
 * Devuelve solo el contenido que se aplica: portada, información, enlaces y origen.
 */
function mergeSections(current, incoming) {
  const base = current || {};
  const next = incoming || {};
  const currentInfo = base.info || {};
  const nextInfo = next.info || {};

  const info = { ...nextInfo };
  if (isSectionLocked(base, 'info')) {
    ['win', 'greet', 'paras', 'hlTitle', 'hlText'].forEach(field => {
      info[field] = currentInfo[field];
    });
  }
  if (isSectionLocked(base, 'items')) {
    info.items = clone(currentInfo.items || []);
    info.listTitle = currentInfo.listTitle;
  }
  if (isSectionLocked(base, 'specs')) {
    info.specs = clone(currentInfo.specs || []);
    info.specTitle = currentInfo.specTitle;
  }

  return {
    hero: clone(isSectionLocked(base, 'hero') ? (base.hero || BLANK.hero) : (next.hero || BLANK.hero)),
    info,
    links: clone(isSectionLocked(base, 'links') ? (base.links || BLANK.links) : (next.links || BLANK.links)),
    source: clone(next.source || base.source || BLANK.source)
  };
}

/* Separadores clásicos que se restauran con un clic */
const CLASSIC_SEPARATORS = ['👋 Bienvenidos', 'ℹ️ Información', '📥 Links de Descarga'];

/* ============================================================
   Utilidades
   ============================================================ */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const clone = value => JSON.parse(JSON.stringify(value));

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function safeHttpUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let candidate = raw;
  if (candidate.startsWith('//')) candidate = 'https:' + candidate;
  try {
    const url = new URL(candidate);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
  } catch (error) {
    return '';
  }
}

function hostOf(value) {
  const url = safeHttpUrl(value);
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch (error) {
    return '';
  }
}

function isHttpUrl(value) {
  return Boolean(safeHttpUrl(value));
}

function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return `rgba(0,113,227,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function luminance(hex) {
  const clean = String(hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0.3;
  const channels = [0, 2, 4].map(offset => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function readableOn(hex) {
  return luminance(hex) > 0.55 ? '#0a0a0a' : '#ffffff';
}

/* Paleta final del post: base + acento resuelto + derivados */
function palette(theme, accentId) {
  const key = theme === 'dark' ? 'dark' : 'light';
  const accent = ACCENTS[accentId] ? accentId : 'azul';
  const base = PAL[key];
  const accentHex = ACCENTS[accent][1][key];
  return {
    ...base,
    mode: key,
    accent: accentHex,
    accentTx: readableOn(accentHex),
    accentSoft: hexToRgba(accentHex, key === 'dark' ? 0.18 : 0.08),
    accentLine: hexToRgba(accentHex, key === 'dark' ? 0.4 : 0.24),
    hlBg: hexToRgba(accentHex, key === 'dark' ? 0.1 : 0.045)
  };
}

/* Texto enriquecido: **negrita** y [[acento]] — escapa todo lo demás */
function fmt(value, paletteValue) {
  return esc(value)
    .replace(/\*\*([^*\n]+)\*\*/g, `<strong style="color: ${paletteValue.title}; font-weight: 700;">$1</strong>`)
    .replace(/\[\[([^\]\n]+)\]\]/g, `<strong style="color: ${paletteValue.accent}; font-weight: 700;">$1</strong>`);
}

function stripOpen(value) {
  return String(value ?? '').replace(/[¿¡]/g, '');
}

function cleanSpace(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function truncate(value, max, ellipsis = '…') {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  const windowText = text.slice(0, max + 1);
  const split = Math.max(
    windowText.lastIndexOf(' '),
    windowText.lastIndexOf(', '),
    windowText.lastIndexOf('. '),
    windowText.lastIndexOf(' — ')
  );
  let cut = split > max * 0.55 ? windowText.slice(0, split) : text.slice(0, max);
  cut = cut.replace(/[\s,;:.\u2013\u2014-]+$/, '');
  return cut ? cut + ellipsis : text.slice(0, max) + ellipsis;
}

function titleCase(value) {
  return String(value ?? '').replace(/\p{L}[\p{L}\p{M}'’]*/gu, word => {
    if (word.length <= 3 && /^(de|del|la|las|el|los|y|o|en|con|por|para|un|una)$/i.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'post';
}

function hash32(value) {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickSeeded(list, seed) {
  if (!Array.isArray(list) || !list.length) return '';
  return list[hash32(seed) % list.length];
}

function relativeTime(timestamp) {
  const ts = Number(timestamp) || 0;
  if (!ts) return 'sin guardar';
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-AR');
}

function debounce(fn, wait = 300) {
  let timer = 0;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

function getP(object, path) {
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
}

function setP(object, path, value) {
  const keys = String(path).split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
  if (target) target[last] = value;
}

function uid(prefix = 'p') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function uidNum() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function wordCount(value) {
  const text = String(value ?? '').trim();
  return text ? text.split(/\s+/).length : 0;
}

function countWordsInHtml(html) {
  return wordCount(String(html ?? '').replace(/<[^>]*>/g, ' '));
}

/* Normaliza estructuras viejas (proyectos guardados con versiones anteriores) */
function normalizePostState(input) {
  const base = clone(BLANK);
  const source = input && typeof input === 'object' ? input : {};
  const out = {
    ...base,
    ...source,
    id: source.id || uid('post'),
    theme: source.theme === 'dark' ? 'dark' : 'light',
    accent: ACCENTS[source.accent] ? source.accent : 'azul',
    sep: Array.isArray(source.sep) ? source.sep.slice(0, 3) : base.sep.slice(),
    source: {
      ...base.source,
      ...(source.source && typeof source.source === 'object' ? source.source : {})
    },
    hero: { ...base.hero, ...(source.hero || {}) },
    info: { ...base.info, ...(source.info || {}) },
    links: { ...base.links, ...(source.links || {}) }
  };
  out.sep = [0, 1, 2].map(i => String(out.sep[i] ?? base.sep[i] ?? ''));
  const locks = source.locked && typeof source.locked === 'object' ? source.locked : {};
  out.locked = {};
  LOCKABLE_SECTIONS.forEach(section => {
    out.locked[section] = locks[section] === true;
  });
  out.info.items = Array.isArray(out.info.items) ? out.info.items.filter(Boolean).map(item => ({
    tag: String(item.tag ?? ''),
    color: COLORS.some(c => c[0] === item.color) ? item.color : 'gris',
    name: String(item.name ?? ''),
    desc: String(item.desc ?? '')
  })) : [];
  out.info.specs = Array.isArray(out.info.specs) ? out.info.specs.filter(Boolean).map(spec => ({
    k: String(spec.k ?? ''),
    v: String(spec.v ?? '')
  })) : [];
  out.links.btns = Array.isArray(out.links.btns) ? out.links.btns.filter(Boolean).map(button => ({
    label: String(button.label ?? ''),
    url: String(button.url ?? ''),
    style: button.style === 'primary' ? 'primary' : 'secondary'
  })) : [];
  return out;
}
