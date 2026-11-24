/**
 * Postinga
 * Capa de extracción: HTML → texto/meta, markdown → datos y lectura de URLs
 * con varios lectores de respaldo.
 */

/* ============================================================
   Entidades y limpieza básica
   ============================================================ */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—',
  ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', deg: '°', euro: '€', pound: '£',
  yen: '¥', times: '×', divide: '÷', check: '✓', star: '★', rarr: '→', larr: '←', uarr: '↑',
  darr: '↓', frac12: '½', frac14: '¼', sup2: '²', sup3: '³', para: '¶', sect: '§',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', uuml: 'ü', ccedil: 'ç', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª'
};

function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (whole, code) => {
    if (code.charAt(0) === '#') {
      const hex = code.charAt(1).toLowerCase() === 'x';
      const number = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(number) || number < 1 || number > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(number);
      } catch (error) {
        return whole;
      }
    }
    const named = ENTITIES[code.toLowerCase()];
    return named == null ? whole : named;
  });
}

function stripTags(value) {
  return decodeEntities(String(value ?? '').replace(/<[^>]*>/g, ' '));
}

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripMarkdownInline(value) {
  return collapse(
    decodeEntities(String(value ?? '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[*_`~#>]+/g, '')
      .replace(/\[\[([^\]]+)\]\]/g, '$1'))
  );
}

function looksLikeHtml(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return false;
  if (/^<!doctype html/i.test(text) || /^<html[\s>]/i.test(text)) return true;
  const matches = text.match(/<(?:html|head|body|div|p|article|main|section|header|footer|h1|h2|h3|ul|ol|li|table|meta|script|style|a|img)\b/gi);
  return Boolean(matches && matches.length >= 2 && text.length > 40);
}

function parseAttributes(tag) {
  const attrs = {};
  const source = String(tag ?? '');
  const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = regex.exec(source))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function resolveUrl(value, baseUrl) {
  const raw = String(value ?? '').trim();
  if (!raw || /^(?:data|blob|javascript|mailto|tel):/i.test(raw)) return '';
  try {
    const resolved = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    return (resolved.protocol === 'http:' || resolved.protocol === 'https:') ? resolved.href : '';
  } catch (error) {
    return '';
  }
}

/* ============================================================
   Descarga directa
   Algunos servicios no entregan el archivo en el enlace compartido: primero
   abren su portal y desde ahí se baja. Estas reglas devuelven el enlace que
   descarga el archivo de una.
   ============================================================ */
const DIRECT_DOWNLOAD_RULES = [
  {
    id: 'onedrive',
    label: 'OneDrive',
    // Los enlaces cortos de OneDrive aceptan download=1 y devuelven el archivo.
    test: host => /(^|\.)1drv\.ms$/i.test(host),
    convert(url) {
      if (url.searchParams.get('download') === '1') return '';
      url.searchParams.set('download', '1');
      return url.href;
    }
  }
];

/**
 * Devuelve el enlace en su forma de descarga directa.
 * `changed` indica si hubo que transformarlo; `service` nombra el servicio.
 */
function toDirectDownload(rawUrl) {
  const safe = safeHttpUrl(rawUrl);
  if (!safe) return { url: String(rawUrl ?? ''), changed: false, service: '' };

  let parsed;
  try {
    parsed = new URL(safe);
  } catch (error) {
    return { url: safe, changed: false, service: '' };
  }

  const host = parsed.hostname.replace(/^www\./i, '');
  for (const rule of DIRECT_DOWNLOAD_RULES) {
    if (!rule.test(host)) continue;
    const converted = rule.convert(parsed);
    if (!converted) return { url: safe, changed: false, service: rule.label };
    return { url: converted, changed: converted !== safe, service: rule.label };
  }
  return { url: safe, changed: false, service: '' };
}

function isDirectDownload(url) {
  const result = toDirectDownload(url);
  return Boolean(result.service) && !result.changed;
}

function sameUrl(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const clean = url => url.origin.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '') + url.search;
    return clean(ua) === clean(ub);
  } catch (error) {
    return false;
  }
}

/* ============================================================
   HTML → texto legible
   ============================================================ */
function htmlToText(html) {
  let source = String(html ?? '');
  if (!source) return '';

  source = source.replace(/<!--[\s\S]*?-->/g, ' ');

  // Bloques que no aportan contenido al post.
  const blocked = ['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'object', 'embed', 'form', 'select', 'textarea', 'button', 'nav', 'footer', 'aside'];
  blocked.forEach(tag => {
    source = source.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  });

  source = source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n---\n')
    .replace(/<h([1-6])\b[^>]*>/gi, (match, level) => `\n\n${'#'.repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<blockquote\b[^>]*>/gi, '\n\n')
    .replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<(?:p|div|section|article|main|header|figure|figcaption|dl|dt|dd|tr)\b[^>]*>/gi, '\n\n')
    .replace(/<\/(?:p|div|section|article|main|header|figure|figcaption|dl|dt|dd|tr)>/gi, '\n\n')
    .replace(/<\/(?:td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');

  source = decodeEntities(source)
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  const lines = source.split('\n');
  const clean = [];
  let previous = '';
  for (const line of lines) {
    if (!line) {
      if (clean.length && clean[clean.length - 1] !== '') clean.push('');
      continue;
    }
    if (line === previous) continue;
    if (/^[|\-–—_•\s]+$/.test(line) && line.replace(/[|\-–—_•\s]/g, '').length === 0) continue;
    clean.push(line);
    previous = line;
  }

  return clean.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ============================================================
   JSON-LD
   ============================================================ */
function flattenJsonLd(node, output = []) {
  if (!node) return output;
  if (Array.isArray(node)) {
    node.forEach(item => flattenJsonLd(item, output));
    return output;
  }
  if (typeof node !== 'object') return output;
  if (node['@graph']) flattenJsonLd(node['@graph'], output);
  if (node['@type'] || node.name || node.headline || node.description) output.push(node);
  return output;
}

function firstText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstText(item);
      if (text) return text;
    }
    return '';
  }
  if (typeof value === 'object') {
    return firstText(value.name || value['@value'] || value.title || value.url || '');
  }
  return '';
}

function collectImages(value, output = []) {
  if (!value) return output;
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) || value.startsWith('//')) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectImages(item, output));
    return output;
  }
  if (typeof value === 'object') {
    if (value.url) collectImages(value.url, output);
    if (value.contentUrl) collectImages(value.contentUrl, output);
    if (value['@id'] && /^https?:/i.test(value['@id'])) output.push(value['@id']);
  }
  return output;
}

function extractJsonLd(html) {
  const blocks = [];
  const regex = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) {
    let json = match[1].trim();
    if (!json) continue;
    try {
      blocks.push(JSON.parse(json));
    } catch (error) {
      try {
        blocks.push(JSON.parse(json.replace(/,\s*([}\]])/g, '$1')));
      } catch (inner) {
        // JSON-LD roto: se ignora.
      }
    }
  }
  if (!blocks.length) return {};

  const nodes = flattenJsonLd(blocks);
  const score = node => {
    const type = String(node['@type'] || '').toLowerCase();
    if (/product|softwareapplication|videogame|movie|tvseries|book|musicalbum/.test(type)) return 5;
    if (/article|newsarticle|blogposting|webpage/.test(type)) return 3;
    return 1;
  };
  nodes.sort((a, b) => score(b) - score(a));
  const main = nodes[0] || {};

  const offers = Array.isArray(main.offers) ? main.offers[0] : main.offers || {};
  const rating = main.aggregateRating || {};
  const author = firstText(main.author);
  const publisher = firstText(main.publisher);

  return {
    type: firstText(main['@type']),
    name: firstText(main.name || main.headline),
    description: firstText(main.description),
    images: collectImages(main.image),
    datePublished: firstText(main.datePublished || main.dateCreated),
    dateModified: firstText(main.dateModified),
    author,
    publisher,
    price: offers.price != null ? String(offers.price) : '',
    priceCurrency: offers.priceCurrency || '',
    availability: offers.availability || '',
    category: firstText(main.applicationCategory || main.genre || main.category),
    operatingSystem: firstText(main.operatingSystem),
    softwareVersion: firstText(main.softwareVersion),
    fileFormat: firstText(main.fileFormat),
    language: firstText(main.inLanguage),
    duration: firstText(main.duration),
    players: firstText(main.numberOfPlayers || main.gamePlatform),
    contentRating: firstText(main.contentRating),
    rating: rating.ratingValue != null ? String(rating.ratingValue) : '',
    ratingCount: rating.ratingCount || rating.reviewCount || ''
  };
}

/* ============================================================
   Metadatos del HTML
   ============================================================ */
function extractMeta(html, baseUrl = '') {
  const source = String(html ?? '');
  const meta = {};
  const metas = {};
  const regex = /<meta\b[^>]*>/gi;
  let match;
  while ((match = regex.exec(source))) {
    const attrs = parseAttributes(match[0]);
    const key = String(attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    const value = attrs.content;
    if (key && value) {
      if (!(key in metas)) metas[key] = value;
    }
  }

  const titleTag = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const h1Tag = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const canonicalTag = source.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i);
  const canonicalAttrs = canonicalTag ? parseAttributes(canonicalTag[0]) : {};
  const htmlLang = (source.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i) || [])[1] || '';

  const ld = extractJsonLd(source);

  const images = [];
  const pushImage = (url, score, alt = '') => {
    const resolved = resolveUrl(url, baseUrl);
    if (!resolved) return;
    images.push({ url: resolved, score, alt: decodeEntities(alt || '') });
  };

  if (metas['og:image:secure_url']) pushImage(metas['og:image:secure_url'], 1000);
  if (metas['og:image']) pushImage(metas['og:image'], 980);
  if (metas['twitter:image'] || metas['twitter:image:src']) pushImage(metas['twitter:image'] || metas['twitter:image:src'], 900);
  (ld.images || []).forEach(url => pushImage(url, 850));
  const linkImage = source.match(/<link\b[^>]*rel\s*=\s*["'][^"']*image_src[^"']*["'][^>]*>/i);
  if (linkImage) {
    const attrs = parseAttributes(linkImage[0]);
    pushImage(attrs.href, 800);
  }

  const imgRegex = /<img\b[^>]*>/gi;
  while ((match = imgRegex.exec(source))) {
    const attrs = parseAttributes(match[0]);
    let src = attrs.src || attrs['data-src'] || attrs['data-original'] || attrs['data-lazy-src'] || '';
    if (!src && attrs['data-srcset']) src = attrs['data-srcset'].split(',')[0].trim();
    if (!src && attrs.srcset) {
      const options = attrs.srcset.split(',').map(part => part.trim()).filter(Boolean);
      const best = options.map(part => {
        const bits = part.split(/\s+/);
        return { url: bits[0], weight: parseInt(bits[1] || '0', 10) || 0 };
      }).sort((a, b) => b.weight - a.weight)[0];
      if (best) src = best.url;
    }
    if (!src) continue;
    const width = parseInt(attrs.width || '0', 10) || 0;
    const height = parseInt(attrs.height || '0', 10) || 0;
    let score = 100;
    if (width >= 600 || height >= 400) score += 60;
    if (width && width < 160) score -= 80;
    if (attrs.alt) score += 5;
    pushImage(src, score, attrs.alt);
  }

  // Deduplicar conservando el mejor puntaje.
  const byUrl = new Map();
  images.forEach(image => {
    const current = byUrl.get(image.url);
    if (!current || image.score > current.score) byUrl.set(image.url, image);
    else if (!current.alt && image.alt) current.alt = image.alt;
  });
  const imageList = Array.from(byUrl.values()).sort((a, b) => b.score - a.score);

  // Anclas (útiles para detectar descargas y enlaces oficiales).
  const anchors = [];
  const anchorRegex = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = anchorRegex.exec(source))) {
    const attrs = parseAttributes(match[0]);
    const href = resolveUrl(attrs.href, baseUrl);
    if (!href) continue;
    const text = collapse(decodeEntities(match[1].replace(/<[^>]*>/g, ' ')));
    const label = text || attrs.title || attrs['aria-label'] || '';
    anchors.push({ url: href, text: label });
    if (anchors.length > 400) break;
  }

  const title = cleanSpace(
    decodeEntities(metas['og:title'] || metas['twitter:title'] || ld.name || (titleTag ? stripTags(titleTag[1]) : ''))
  );

  return {
    title,
    ogTitle: metas['og:title'] || '',
    description: cleanSpace(decodeEntities(
      metas['og:description'] || metas['twitter:description'] || metas.description || ld.description || ''
    )),
    image: imageList[0] ? imageList[0].url : '',
    images: imageList,
    siteName: cleanSpace(decodeEntities(metas['og:site_name'] || '')),
    canonical: resolveUrl(canonicalAttrs.href || '', baseUrl),
    published: metas['article:published_time'] || metas['datePublished'] || ld.datePublished || '',
    author: cleanSpace(decodeEntities(metas.author || ld.author || '')),
    keywords: cleanSpace(decodeEntities(metas.keywords || '')),
    h1: h1Tag ? cleanSpace(stripTags(h1Tag[1])) : '',
    type: metas['og:type'] || '',
    lang: htmlLang,
    ld,
    anchors
  };
}

/* ============================================================
   Markdown de lectores (Jina Reader)
   ============================================================ */
function parseReaderMarkdown(markdown, fallbackUrl = '') {
  const source = String(markdown ?? '').replace(/\r\n?/g, '\n');
  const header = {};
  let contentStart = 0;
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(Title|URL Source|Published Time|Markdown Content):\s*(.*)$/i);
    if (!match) continue;
    header[match[1].toLowerCase()] = match[2].trim();
    contentStart = i + 1;
    if (/^markdown content$/i.test(match[1])) {
      contentStart = i + 1;
      break;
    }
  }

  const hasHeader = Object.keys(header).length > 0;
  const body = hasHeader ? lines.slice(contentStart).join('\n').trim() : source.trim();
  const pageUrl = fallbackUrl || header['url source'] || '';

  const imageCandidates = [];
  const markdownImages = [...source.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g)];
  markdownImages.forEach(match => {
    imageCandidates.push({ url: match[2], alt: match[1], score: 500 });
  });
  const linkedImages = [...source.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+\.(?:png|jpe?g|webp|avif)(?:\?[^\s)]*)?)\)/gi)];
  linkedImages.forEach(match => {
    imageCandidates.push({ url: match[1], alt: '', score: 520 });
  });
  const plainImages = [...source.matchAll(/(https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|webp|avif)(?:\?[^\s"'<>)]*)?)/gi)];
  plainImages.forEach(match => {
    imageCandidates.push({ url: match[1], alt: '', score: 300 });
  });

  const uniqueImages = [];
  const seen = new Set();
  imageCandidates.forEach(image => {
    if (seen.has(image.url)) return;
    seen.add(image.url);
    uniqueImages.push(image);
  });
  uniqueImages.sort((a, b) => b.score - a.score);

  const anchors = [...source.matchAll(/\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/g)]
    .map(match => ({ url: match[2], text: collapse(match[1]) }))
    .filter(anchor => !/^!/.test(anchor.text))
    .slice(0, 300);

  return {
    title: cleanSpace(decodeEntities(header.title || '')),
    url: pageUrl,
    published: header['published time'] || '',
    text: body,
    meta: {
      title: cleanSpace(decodeEntities(header.title || '')),
      description: '',
      image: uniqueImages[0] ? uniqueImages[0].url : '',
      images: uniqueImages,
      siteName: pageUrl ? hostOf(pageUrl) : '',
      canonical: '',
      published: header['published time'] || '',
      author: '',
      keywords: '',
      h1: '',
      type: '',
      lang: '',
      ld: {},
      anchors
    }
  };
}

/* ============================================================
   Detección de la entrada del usuario
   ============================================================ */
function detectInput(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'empty', text: '', url: '' };

  const urlOnly = text.match(/^(https?:\/\/[^\s]+)$/i) || text.match(/^((?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)$/i);
  if (urlOnly && !/\s/.test(text)) {
    let candidate = urlOnly[1];
    if (!/^https?:\/\//i.test(candidate)) candidate = 'https://' + candidate;
    if (safeHttpUrl(candidate)) return { kind: 'url', text, url: safeHttpUrl(candidate) };
  }

  if (looksLikeHtml(text)) return { kind: 'html', text, url: '' };

  const firstUrl = text.match(/https?:\/\/[^\s<>"')]+/i);
  const urlInFirstLine = firstUrl && firstUrl.index < 220 ? safeHttpUrl(firstUrl[0]) : '';

  return { kind: 'text', text, url: urlInFirstLine };
}

function extractMarkdownLinks(text) {
  const links = [];
  const regex = /\[([^\]]{1,160})\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = regex.exec(String(text ?? '')))) {
    const url = resolveUrl(match[2], '');
    if (url) links.push({ url, text: stripMarkdownInline(match[1]) });
    if (links.length > 250) break;
  }
  return links;
}

function extractRawUrls(text) {
  const urls = [];
  const regex = /https?:\/\/[^\s<>"')\]]+/g;
  let match;
  while ((match = regex.exec(String(text ?? '')))) {
    const url = safeHttpUrl(match[0].replace(/[.,;:!?]+$/, ''));
    if (url) urls.push(url);
    if (urls.length > 250) break;
  }
  return urls;
}

/* ============================================================
   Varias fuentes a la vez
   El recuadro acepta una mezcla: uno o más links sueltos, texto pegado
   y/o HTML. Esto separa cada cosa para poder leerlas y combinarlas.
   ============================================================ */
const DOMAIN_ONLY = /^(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?$/i;

function parseSources(raw) {
  const source = String(raw ?? '').replace(/\r\n?/g, '\n');
  const urls = [];
  const rest = [];

  source.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      rest.push('');
      return;
    }

    // Una línea que es solo un link
    if (/^https?:\/\/\S+$/i.test(trimmed)) {
      const safe = safeHttpUrl(trimmed);
      if (safe) {
        urls.push(safe);
        return;
      }
    }

    // Una línea que es solo un dominio (ejemplo.com/algo)
    if (DOMAIN_ONLY.test(trimmed) && trimmed.length <= 200 && !trimmed.includes(' ')) {
      const safe = safeHttpUrl('https://' + trimmed);
      if (safe) {
        urls.push(safe);
        return;
      }
    }

    rest.push(line);
  });

  const text = rest.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const unique = [...new Set(urls)];

  return {
    urls: unique,
    text,
    isHtml: Boolean(text) && looksLikeHtml(text),
    isEmpty: !unique.length && !text
  };
}

/* ============================================================
   Lectura de URLs
   ============================================================ */
const READER_STATE = {
  promise: null,
  checkedAt: 0,
  available: false,
  version: ''
};

function linkAbortController(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let finished = false;
  const timer = setTimeout(() => {
    if (!finished) {
      try { controller.abort(new Error('timeout')); } catch (error) { controller.abort(); }
    }
  }, timeoutMs);

  const onAbort = () => {
    try { controller.abort(parentSignal.reason || new Error('abort')); } catch (error) { controller.abort(); }
  };

  if (parentSignal) {
    if (parentSignal.aborted) onAbort();
    else parentSignal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    dispose() {
      finished = true;
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener('abort', onAbort);
    }
  };
}

async function checkLocalReader(force = false) {
  const now = Date.now();
  if (!force && READER_STATE.promise && now - READER_STATE.checkedAt < 30000) {
    return READER_STATE.promise;
  }
  const canCheck = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  if (!canCheck) {
    READER_STATE.available = false;
    READER_STATE.version = '';
    READER_STATE.checkedAt = now;
    return Promise.resolve(false);
  }

  const timeout = linkAbortController(null, 900);
  READER_STATE.checkedAt = now;
  READER_STATE.promise = fetch('/api/health', { signal: timeout.signal, cache: 'no-store' })
    .then(async response => {
      if (!response.ok) return false;
      const data = await response.json().catch(() => ({}));
      READER_STATE.available = Boolean(data && data.ok);
      READER_STATE.version = String(data.version || '');
      return READER_STATE.available;
    })
    .catch(() => {
      READER_STATE.available = false;
      READER_STATE.version = '';
      return false;
    })
    .finally(() => timeout.dispose());

  return READER_STATE.promise;
}

function fetchWithTimeout(url, options, timeoutMs, parentSignal) {
  const timeout = linkAbortController(parentSignal, timeoutMs);
  return fetch(url, { ...options, signal: timeout.signal }).finally(() => timeout.dispose());
}

async function readTextResponse(response, maxChars = 2500000) {
  const text = await response.text();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function looksBlocked(text) {
  const sample = String(text ?? '').slice(0, 6000);
  if (!sample.trim()) return true;
  if (/<title>\s*(just a moment|attention required|access denied|403 forbidden|are you a robot)/i.test(sample)) return true;
  if (/(enable javascript and cookies to continue|verify you are human|cf-challenge|captcha)/i.test(sample) && sample.length < 4000) return true;
  if (/^\s*\{?\s*"error"/i.test(sample) && sample.length < 600) return true;
  return false;
}

async function tryLocalReader(url, context) {
  if (!READER_STATE.available) return null;
  context.onStage('Leyendo con el servidor local…');
  try {
    const response = await fetchWithTimeout(
      `/api/fetch?url=${encodeURIComponent(url)}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
      20000,
      context.signal
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || !data.ok) return null;
    const finalUrl = resolveUrl(data.finalUrl || data.url || url, '') || url;

    if (data.html && data.html.length >= 120) {
      if (looksBlocked(data.html)) return null;
      const html = data.html;
      const meta = extractMeta(html, finalUrl);
      return {
        provider: 'local',
        html,
        text: htmlToText(html),
        meta,
        finalUrl
      };
    }

    if (data.text && data.text.length >= 120) {
      const firstLine = data.text.split('\n').map(line => line.trim()).find(Boolean) || '';
      const possibleTitle = firstLine.length <= 110 && !/[.!?…]$/.test(firstLine) ? firstLine : '';
      return {
        provider: 'local',
        html: '',
        text: data.text,
        meta: {
          title: possibleTitle,
          description: '',
          image: '',
          images: [],
          siteName: hostOf(finalUrl),
          canonical: '',
          published: '',
          author: '',
          keywords: '',
          h1: '',
          type: '',
          lang: '',
          ld: {},
          anchors: []
        },
        finalUrl
      };
    }

    return null;
  } catch (error) {
    if (error && error.name === 'AbortError' && context.signal && context.signal.aborted) throw error;
    return null;
  }
}

async function tryJinaReader(url, context) {
  context.onStage('Leyendo con Jina Reader…');
  const target = 'https://r.jina.ai/' + url;
  try {
    const response = await fetchWithTimeout(
      target,
      {
        headers: {
          Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.5',
          'X-Return-Format': 'markdown'
        },
        cache: 'no-store'
      },
      26000,
      context.signal
    );
    if (!response.ok) return null;
    const text = await readTextResponse(response);
    if (!text || text.length < 120 || looksBlocked(text)) return null;

    if (looksLikeHtml(text) && !/^Title:/im.test(text.slice(0, 600))) {
      const meta = extractMeta(text, url);
      return { provider: 'jina', html: text, text: htmlToText(text), meta, finalUrl: url };
    }

    const parsed = parseReaderMarkdown(text, url);
    if (!parsed.text || parsed.text.length < 120) return null;
    const meta = { ...parsed.meta, description: '' };
    return {
      provider: 'jina',
      html: '',
      text: parsed.text,
      meta,
      finalUrl: parsed.url || url
    };
  } catch (error) {
    if (error && error.name === 'AbortError' && context.signal && context.signal.aborted) throw error;
    return null;
  }
}

async function tryHtmlProxy(url, context, provider, buildUrl, timeoutMs = 16000) {
  context.onStage(`Leyendo con ${provider}…`);
  try {
    const response = await fetchWithTimeout(
      buildUrl(url),
      { headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5' }, cache: 'no-store' },
      timeoutMs,
      context.signal
    );
    if (!response.ok) return null;
    const html = await readTextResponse(response);
    if (!html || html.length < 160 || looksBlocked(html)) return null;
    const meta = extractMeta(html, url);
    return { provider, html, text: htmlToText(html), meta, finalUrl: url };
  } catch (error) {
    if (error && error.name === 'AbortError' && context.signal && context.signal.aborted) throw error;
    return null;
  }
}

async function tryDirect(url, context) {
  context.onStage('Leyendo directo del sitio…');
  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' }, credentials: 'omit', cache: 'no-store' },
      13000,
      context.signal
    );
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (/image\/|application\/pdf|application\/zip|octet-stream/i.test(contentType)) return null;
    const html = await readTextResponse(response);
    if (!html || html.length < 160 || looksBlocked(html)) return null;
    const meta = extractMeta(html, url);
    return { provider: 'directo', html, text: htmlToText(html), meta, finalUrl: url };
  } catch (error) {
    if (error && error.name === 'AbortError' && context.signal && context.signal.aborted) throw error;
    return null;
  }
}

async function readUrl(rawUrl, options = {}) {
  const url = safeHttpUrl(rawUrl);
  if (!url) throw new Error('Ese enlace no parece válido. Tiene que empezar con http:// o https://.');

  const controller = options.signal || new AbortController().signal;
  const onStage = typeof options.onStage === 'function' ? options.onStage : () => {};
  const context = { signal: controller, onStage };

  await checkLocalReader(false);

  const providers = [];
  if (READER_STATE.available) providers.push(() => tryLocalReader(url, context));
  providers.push(() => tryJinaReader(url, context));
  providers.push(() => tryHtmlProxy(url, context, 'AllOrigins', target => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(target)));
  providers.push(() => tryHtmlProxy(url, context, 'CodeTabs', target => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(target)));
  providers.push(() => tryDirect(url, context));

  for (const provider of providers) {
    if (controller.aborted) {
      const abortError = new Error('Lectura cancelada.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    const result = await provider();
    if (result && result.text && result.text.length > 120) {
      return { ...result, url };
    }
  }

  const error = new Error('No pudimos leer ese enlace. El sitio puede bloquear lectores externos, necesitar inicio de sesión o no estar disponible.');
  error.code = 'READ_FAILED';
  error.retryWithText = true;
  throw error;
}

async function testReaderServer() {
  const available = await checkLocalReader(true);
  return { available, version: READER_STATE.version };
}
