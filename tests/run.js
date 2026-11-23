#!/usr/bin/env node
/**
 * Postinga — tests automatizados
 *
 * Ejecutar:  npm test   (o)  node tests/run.js
 *
 * Carga los módulos del navegador dentro de un contexto de Node y verifica
 * extracción, análisis y generación de HTML. Sin dependencias externas.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

/* ============================================================
   Mini framework
   ============================================================ */
let passed = 0;
const failures = [];
let group = '';

function describe(name, fn) {
  group = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
  fn();
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (error) {
    failures.push({ group, name, message: error && error.message ? error.message : String(error) });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      \x1b[31m${error && error.message ? error.message : error}\x1b[0m`);
  }
}

const asyncGroups = [];

function describeAsync(name, fn) {
  asyncGroups.push({ name, fn });
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (error) {
    failures.push({ group, name, message: error && error.message ? error.message : String(error) });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      \x1b[31m${error && error.message ? error.message : error}\x1b[0m`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Se esperaba un valor verdadero.');
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Valores distintos'}\n      esperado: ${JSON.stringify(expected)}\n      recibido: ${JSON.stringify(actual)}`);
  }
}

function includes(haystack, needle, message) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${message || 'No se encontró el texto'}: ${JSON.stringify(needle)}`);
  }
}

function notIncludes(haystack, needle, message) {
  if (String(haystack).includes(needle)) {
    throw new Error(`${message || 'No debería incluir'}: ${JSON.stringify(needle)}`);
  }
}

function matches(value, regex, message) {
  if (!regex.test(String(value))) {
    throw new Error(`${message || 'No coincide con el patrón'}: ${regex} en ${JSON.stringify(String(value).slice(0, 160))}`);
  }
}

/* ============================================================
   Entorno del navegador simulado
   ============================================================ */
function createContext() {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    Intl,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    RegExp,
    Object,
    Array,
    Set,
    Map,
    Promise,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    fetch: () => Promise.reject(new Error('fetch no disponible en los tests')),
    localStorage: (() => {
      const store = new Map();
      return {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key),
        clear: () => store.clear()
      };
    })(),
    location: { protocol: 'file:', href: 'file:///tests/run.js' },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, click() {}, setAttribute() {} }),
      addEventListener: () => {},
      body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {} }
    },
    window: { matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
    requestAnimationFrame: fn => setTimeout(fn, 0),
    navigator: { clipboard: { writeText: () => Promise.resolve() } }
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  ['js/constants.js', 'js/extract.js', 'js/analyze.js', 'js/generator.js', 'js/ai.js'].forEach(file => {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  });
  return context;
}

const ctx = createContext();
const run = expression => vm.runInContext(expression, ctx);

const htmlFixture = fs.readFileSync(path.join(FIXTURES, 'sample-page.html'), 'utf8');
const jinaFixture = fs.readFileSync(path.join(FIXTURES, 'sample-jina.md'), 'utf8');

ctx.htmlFixture = htmlFixture;
ctx.jinaFixture = jinaFixture;

function analyzeWith(expression) {
  return run(`analyze(${expression})`);
}

/* ============================================================
   Utilidades
   ============================================================ */
describe('Utilidades (constants.js)', () => {
  test('esc() neutraliza el HTML', () => {
    equal(run(`esc('<img src=x onerror="alert(1)">')`), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  test('esc() escapa comillas simples y ampersands', () => {
    equal(run(`esc("a & b 'c'")`), 'a &amp; b &#39;c&#39;');
  });

  test('safeHttpUrl() acepta http y https', () => {
    equal(run(`safeHttpUrl('https://ejemplo.com/a?b=1')`), 'https://ejemplo.com/a?b=1');
    equal(run(`safeHttpUrl('http://ejemplo.com')`), 'http://ejemplo.com/');
  });

  test('safeHttpUrl() bloquea javascript:, data: y basura', () => {
    equal(run(`safeHttpUrl('javascript:alert(1)')`), '');
    equal(run(`safeHttpUrl('data:text/html,<script>')`), '');
    equal(run(`safeHttpUrl('no es una url')`), '');
    equal(run(`safeHttpUrl('')`), '');
  });

  test('hostOf() limpia el www', () => {
    equal(run(`hostOf('https://www.ejemplo.com/x')`), 'ejemplo.com');
  });

  test('palette() resuelve acento y fondo de destacado', () => {
    const dark = run(`palette('dark', 'violeta')`);
    equal(dark.accent, '#bf5af2');
    equal(dark.mode, 'dark');
    assert(dark.hlBg.startsWith('rgba('), 'hlBg debería ser rgba');
    const light = run(`palette('light', 'azul')`);
    equal(light.mode, 'light');
    equal(light.accent, '#0071e3');
  });

  test('readableOn() elige texto legible sobre el acento', () => {
    equal(run(`readableOn('#ffd60a')`), '#0a0a0a');
    equal(run(`readableOn('#0058b8')`), '#ffffff');
  });

  test('normalizePostState() repara un estado incompleto', () => {
    const result = run(`normalizePostState({ theme: 'raro', info: { items: [null, { name: 'X', color: 'inexistente' }] }, links: { btns: [{ label: 'L', url: 'https://a.com' }] } })`);
    equal(result.theme, 'light');
    equal(result.info.items.length, 1);
    equal(result.info.items[0].color, 'gris');
    equal(result.links.btns.length, 1);
    equal(result.sep.length, 3);
    assert(result.id, 'debería generar un id');
  });

  test('getP/setP navegan rutas anidadas', () => {
    equal(run(`(() => { const o = { a: { b: [{ c: 1 }] } }; setP(o, 'a.b.0.c', 9); return getP(o, 'a.b.0.c'); })()`), 9);
  });

  test('truncate() corta en un límite de palabra', () => {
    const out = run(`truncate('uno dos tres cuatro cinco seis siete', 20)`);
    assert(out.length <= 21, `largo inesperado: ${out.length}`);
    notIncludes(out, '  ', 'no debería dejar espacios dobles');
  });

  test('slugify() genera un nombre de archivo seguro', () => {
    equal(run(`slugify('¡Hola, Mundo! 2026')`), 'hola-mundo-2026');
  });
});

/* ============================================================
   Extracción
   ============================================================ */
describe('Extracción (extract.js)', () => {
  test('detectInput() reconoce una URL sola', () => {
    const result = run(`detectInput('https://ejemplo.com/post')`);
    equal(result.kind, 'url');
    equal(result.url, 'https://ejemplo.com/post');
  });

  test('detectInput() completa el esquema de un dominio', () => {
    const result = run(`detectInput('ejemplo.com/algo')`);
    equal(result.kind, 'url');
    equal(result.url, 'https://ejemplo.com/algo');
  });

  test('detectInput() reconoce texto largo', () => {
    const result = run(`detectInput('Esto es un texto largo con varias palabras que no es una URL ni tampoco HTML.')`);
    equal(result.kind, 'text');
  });

  test('detectInput() reconoce HTML', () => {
    const result = run(`detectInput(${JSON.stringify('<html><body><p>hola</p></body></html>')})`);
    equal(result.kind, 'html');
  });

  test('decodeEntities() resuelve entidades con nombre y numéricas', () => {
    equal(run(`decodeEntities('caf&eacute; &amp; t&eacute; &#8212; &quot;ok&quot;')`), 'café & té — "ok"');
  });

  test('htmlToText() elimina scripts, estilos y navegación', () => {
    const text = run(`htmlToText(htmlFixture)`);
    notIncludes(text, 'esto no debe aparecer', 'no debería incluir el contenido del script');
    notIncludes(text, 'color: red', 'no debería incluir el CSS');
    includes(text, 'Sylenth1 is a virtual analog', 'debería conservar el cuerpo');
    includes(text, '# Oscillators', 'debería convertir los h2 en encabezados markdown');
    includes(text, '•', 'debería conservar las viñetas');
  });

  test('htmlToText() no deja líneas repetidas ni vacías de más', () => {
    const text = run(`htmlToText(htmlFixture)`);
    notIncludes(text, '\n\n\n', 'no debería haber más de una línea en blanco seguida');
    const lines = text.split('\n').filter(Boolean);
    equal(new Set(lines).size, lines.length, 'no debería haber líneas duplicadas');
  });

  test('extractMeta() lee Open Graph, canonical y autor', () => {
    const meta = run(`extractMeta(htmlFixture, 'https://www.lennardigital.com/sylenth1/')`);
    equal(meta.title, 'Sylenth1 | LennarDigital');
    includes(meta.description, 'virtual analog VSTi');
    equal(meta.siteName, 'LennarDigital');
    equal(meta.author, 'LennarDigital');
    equal(meta.canonical, 'https://www.lennardigital.com/sylenth1/');
    equal(meta.image, 'https://www.lennardigital.com/sylenth1/screenshot3.jpg');
  });

  test('rankImages() descarta logos, píxeles y avatares', () => {
    const ranked = run(`(() => {
      const source = 'https://www.lennardigital.com/sylenth1/';
      const meta = extractMeta(htmlFixture, source);
      const text = htmlToText(htmlFixture);
      return rankImages({ ...meta, baseUrl: source }, text).map(image => image.url);
    })()`);
    const urls = ranked.join(' ');
    notIncludes(urls, 'logo', 'no debería incluir el logo');
    notIncludes(urls, 'pixel', 'no debería incluir el píxel de seguimiento');
    assert(ranked.length >= 1, 'debería quedar al menos una imagen usable');
    includes(ranked[0], 'screenshot', `la primera debería ser la captura: ${ranked[0]}`);
  });

  test('extractMeta() interpreta JSON-LD', () => {
    const meta = run(`extractMeta(htmlFixture, 'https://www.lennardigital.com/sylenth1/')`);
    equal(meta.ld.type, 'SoftwareApplication');
    equal(meta.ld.price, '139');
    equal(meta.ld.priceCurrency, 'EUR');
    equal(meta.ld.softwareVersion, '3.0');
    equal(meta.ld.rating, '4.8');
  });

  test('extractMeta() reúne anclas con su texto', () => {
    const meta = run(`extractMeta(htmlFixture, 'https://www.lennardigital.com/sylenth1/')`);
    const downloads = meta.anchors.find(anchor => anchor.url.endsWith('/downloads/'));
    assert(downloads, 'debería encontrar el enlace de descargas');
    equal(downloads.text, 'Downloads');
  });

  test('parseReaderMarkdown() separa cabecera y contenido', () => {
    const parsed = run(`parseReaderMarkdown(jinaFixture, 'https://ejemplo.com/celeste')`);
    equal(parsed.title, 'Celeste — Un plataformas indie que vale la pena');
    equal(parsed.url, 'https://ejemplo.com/celeste');
    includes(parsed.text, 'Celeste es un juego de plataformas');
    notIncludes(parsed.text, 'Markdown Content:', 'no debería conservar la cabecera');
  });

  test('parseReaderMarkdown() extrae imágenes y enlaces', () => {
    const parsed = run(`parseReaderMarkdown(jinaFixture, 'https://ejemplo.com/celeste')`);
    includes(parsed.meta.images.map(image => image.url).join(' '), 'celeste-cover.jpg');
    includes(parsed.meta.anchors.map(anchor => anchor.url).join(' '), 'store.steampowered.com');
  });

  test('looksLikeHtml() distingue HTML de texto', () => {
    equal(run(`looksLikeHtml('<html><body><p>x</p></body></html>')`), true);
    equal(run(`looksLikeHtml('Un texto normal sin etiquetas pero bastante largo como para no confundir.')`), false);
  });
});

/* ============================================================
   Análisis
   ============================================================ */
describe('Análisis (analyze.js)', () => {
  test('analiza HTML: título, imagen, características y ficha', () => {
    const post = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/', noOpen: true }`);
    equal(post.hero.title, 'Sylenth1');
    includes(post.hero.img, 'screenshot3.jpg');
    assert(post.info.items.length >= 3, `se esperaban 3+ características, hay ${post.info.items.length}`);
    assert(post.info.specs.length >= 2, `se esperaban 2+ datos, hay ${post.info.specs.length}`);
    assert(post.info.paras.length > 200, 'debería haber párrafos');
    equal(post.source.type, 'software');
  });

  test('la ficha usa claves normalizadas y evita duplicados', () => {
    const post = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/' }`);
    const keys = post.info.specs.map(spec => spec.k);
    equal(new Set(keys).size, keys.length, 'no debería haber claves repetidas');
    includes(keys.join(' | '), 'Formatos');
  });

  test('los enlaces preferidos son descargas y el sitio oficial', () => {
    const post = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/' }`);
    const urls = post.links.btns.map(button => button.url);
    assert(urls.length >= 1, 'debería haber al menos un enlace');
    assert(urls[0].includes('downloads'), `el primero debería ser la descarga: ${urls[0]}`);
    equal(post.links.btns[0].style, 'primary');
    assert(urls.some(url => url === 'https://www.lennardigital.com/sylenth1/'), 'debería incluir el sitio oficial');
  });

  test('descarta enlaces sociales y de login', () => {
    const post = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/' }`);
    const urls = post.links.btns.map(button => button.url).join(' ');
    notIncludes(urls, 'facebook', 'no debería incluir Facebook');
    notIncludes(urls, 'login', 'no debería incluir el login');
  });

  test('analiza el markdown de un lector', () => {
    const post = analyzeWith(`{ text: jinaFixture, sourceUrl: 'https://ejemplo.com/celeste', noOpen: true }`);
    equal(post.hero.title, 'Celeste — Un plataformas indie que vale la pena');
    assert(post.info.items.length >= 3, `se esperaban 3+ características, hay ${post.info.items.length}`);
    equal(post.source.type, 'game');
    includes(post.links.btns.map(button => button.url).join(' '), 'store.steampowered.com');
  });

  test('clasifica las etiquetas según el contenido', () => {
    const post = analyzeWith(`{ text: jinaFixture, sourceUrl: 'https://ejemplo.com/celeste' }`);
    const tags = post.info.items.map(item => item.tag).join(' ');
    matches(tags, /JUEGO|CONTENIDO|FUNCIONES|DISEÑO|RENDIMIENTO/, 'debería asignar etiquetas temáticas');
  });

  test('traduce los encabezados en inglés', () => {
    const post = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/' }`);
    const names = post.info.items.map(item => item.name).join(' | ');
    matches(names, /Osciladores|Filtros|Modulación/, `debería traducir los nombres: ${names}`);
  });

  test('analiza texto plano sin metadatos sin romperse', () => {
    const plain = [
      'Taladro percutor inalámbrico 20V',
      '',
      'Este taladro liviano trae un motor sin escobillas que entrega más potencia con menos batería. Su mandril metálico de 13 mm acepta mechas de distintas medidas sin patinar.',
      '',
      'Es ideal para trabajos de instalación y muebles porque pesa menos de dos kilos y el agarre de goma reduce la fatiga en jornadas largas.',
      '',
      '## Características',
      '**Motor sin escobillas**: entrega hasta 60 Nm de torque con menor consumo.',
      '**Dos velocidades**: 0-450 y 0-1800 RPM para distintas tareas.',
      '**Batería de 4 Ah**: rinde varias horas de trabajo continuo.',
      '',
      'Marca: Bosch',
      'Modelo: GSR 20V',
      'Peso: 1.8 kg'
    ].join('\n');
    const post = analyzeWith(`{ text: ${JSON.stringify(plain)} }`);
    assert(post.hero.title.length > 3, 'debería detectar un título');
    includes(post.hero.title, 'Taladro');
    assert(post.info.items.length >= 2, `se esperaban 2+ características, hay ${post.info.items.length}`);
    const keys = post.info.specs.map(spec => spec.k).join(' | ');
    matches(keys, /Marca|Modelo|Peso/, `debería detectar la ficha: ${keys}`);
  });

  test('lanza un error claro con contenido insuficiente', () => {
    let message = '';
    try {
      run(`analyze({ text: 'corto' })`);
    } catch (error) {
      message = error.message;
    }
    matches(message, /suficiente contenido|no pudimos encontrar/i, 'debería avisar que falta contenido');
  });

  test('respeta la profundidad rápida', () => {
    const full = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/', depth: 'completo' }`);
    const quick = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/', depth: 'rapido' }`);
    assert(quick.info.items.length <= full.info.items.length, 'rápido no debería generar más ítems');
    assert(quick.info.specs.length <= 4, 'rápido debería limitar la ficha a 4 filas');
  });

  test('quita los signos de apertura cuando se pide', () => {
    const text = '## Qué es y cómo funciona?\n\nEs una herramienta muy útil para el trabajo diario y sirve para organizar tareas de todo tipo sin complicaciones.';
    const withOpen = analyzeWith(`{ text: ${JSON.stringify(text)}, noOpen: false }`);
    const without = analyzeWith(`{ text: ${JSON.stringify(text)}, noOpen: true }`);
    assert(withOpen.info.paras.includes('¿') || withOpen.info.hlTitle.includes('¿'), 'sin la opción debería conservar ¿');
    notIncludes(without.info.paras, '¿', 'con la opción no debería haber ¿');
    notIncludes(without.info.hlTitle, '¿', 'con la opción no debería haber ¿ en el destacado');
  });

  test('el destacado no repite el subtítulo', () => {
    const post = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/' }`);
    const clean = value => run(`normalizeCompare(${JSON.stringify(value || '')})`);
    assert(clean(post.info.hlText) !== clean(post.hero.sub), 'el destacado no debería ser igual al subtítulo');
  });

  test('los marcadores de formato quedan balanceados', () => {
    const post = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/' }`);
    const text = post.info.paras;
    equal((text.match(/\*\*/g) || []).length % 2, 0, 'los ** deberían estar balanceados');
    equal((text.match(/\[\[/g) || []).length, (text.match(/\]\]/g) || []).length, 'los [[ ]] deberían estar balanceados');
  });

  test('nunca inventa una imagen que no existe en la fuente', () => {
    const post = analyzeWith(`{ text: 'Un texto sin ninguna imagen pero con suficiente contenido como para analizar sin problemas y obtener un resultado razonable.' }`);
    equal(post.hero.img, '');
  });

  test('countFilledFields() cuenta los campos cargados', () => {
    const post = analyzeWith(`{ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/' }`);
    ctx.postFixture = post;
    const count = run(`countFilledFields(postFixture)`);
    assert(count > 12, `se esperaban más de 12 campos, hay ${count}`);
  });
});

/* ============================================================
   Generador
   ============================================================ */
describe('Generador (generator.js)', () => {
  test('build() arma el post por defecto', () => {
    const html = run(`build(DEF)`);
    assert(html.length > 3000, 'el HTML debería ser extenso');
    includes(html, 'Bienvenidos', 'debería incluir el primer separador');
    includes(html, 'Links de Descarga', 'debería incluir el separador de enlaces');
  });

  test('todo el estilo va inline: sin <style> ni flex', () => {
    const html = run(`build(DEF)`);
    notIncludes(html, '<style', 'no debería incluir bloques de estilo');
    notIncludes(html, '<link', 'no debería depender de hojas externas');
    notIncludes(html, 'display: flex', 'el flex no es confiable al pegar');
    includes(html, 'style="', 'debería usar estilos inline');
  });

  test('la única clase propia es links-ocultos', () => {
    const html = run(`build(DEF)`);
    const classes = [...html.matchAll(/class="([^"]*)"/g)].map(match => match[1]);
    equal(new Set(classes).size <= 1, true, `clases inesperadas: ${classes.join(', ')}`);
    if (classes.length) equal(classes[0], 'links-ocultos');
  });

  test('no usa tablas (el sitio les dibuja grilla al pegarlas)', () => {
    const html = run(`build(DEF)`);
    notIncludes(html, '<table', 'no debería haber tablas');
    notIncludes(html, '<td', 'no debería haber celdas');
    notIncludes(html, '<tr', 'no debería haber filas');
    notIncludes(html, '<svg', 'no debería depender de SVG inline');
  });

  test('los separadores se arman con bloques en línea', () => {
    const html = run(`build(DEF)`);
    includes(html, 'display: inline-block', 'las líneas del separador deberían ser bloques en línea');
    includes(html, 'text-transform: uppercase', 'el separador lleva su propio estilo');
    // Un separador vacío deja solo la línea
    const empty = run(`build(normalizePostState(Object.assign({}, DEF, { sep: ['', 'Info', ''] })))`);
    includes(empty, 'height: 1px', 'sin texto debería quedar una línea');
  });

  test('los puntos de la ventana son glifos, no círculos por CSS', () => {
    const html = run(`build(DEF)`);
    equal((html.match(/●/g) || []).length, 6, 'deberían ser 3 puntos por cada una de las 2 ventanas');
    includes(html, '#ff5f57');
    includes(html, '#febc2e');
    includes(html, '#28c840');
  });

  test('escapa el contenido para evitar inyección', () => {
    const evil = run(`build(normalizePostState({
      hero: { title: '<script>alert(1)</script>', sub: '"><img onerror=alert(1)>', img: 'javascript:alert(1)', win: 'x' },
      info: { win: 'y', greet: 'z', paras: 'p', hlTitle: 'a', hlText: 'b', listTitle: 'c',
        items: [{ tag: 'T', color: 'azul', name: '<b>x</b>', desc: '<i>y</i>' }],
        specTitle: 'd', specs: [{ k: '<x>', v: '<y>' }] },
      links: { title: 't', text: 'u', hide: false, btns: [{ label: '<b>l</b>', url: 'https://ok.com', style: 'primary' }] }
    }))`);
    notIncludes(evil, '<script', 'no debería emitir un script');
    notIncludes(evil, 'javascript:', 'no debería emitir javascript:');
    notIncludes(evil, '<img onerror', 'no debería emitir el img con onerror');
    includes(evil, '&lt;script&gt;', 'debería escapar el script');
    includes(evil, '&lt;b&gt;x&lt;/b&gt;', 'debería escapar el HTML de los ítems');
  });

  test('ignora URLs inválidas en los botones', () => {
    const html = run(`build(normalizePostState({
      hero: { title: 'T', sub: 's', win: 'w' },
      info: { win: 'i', greet: '', paras: 'p', hlTitle: '', hlText: '', listTitle: '', items: [], specTitle: '', specs: [] },
      links: { title: 'L', text: '', hide: false, btns: [
        { label: 'Malo', url: 'javascript:alert(1)', style: 'primary' },
        { label: 'Bueno', url: 'https://ejemplo.com', style: 'secondary' }
      ] }
    }))`);
    notIncludes(html, 'javascript:', 'no debería incluir el enlace inválido');
    includes(html, 'https://ejemplo.com/', 'debería conservar el enlace válido');
    notIncludes(html, 'Malo', 'no debería mostrar el botón inválido');
  });

  test('envuelve los enlaces en links-ocultos cuando corresponde', () => {
    const html = run(`build(DEF)`);
    includes(html, 'class="links-ocultos"', 'debería envolver los enlaces');
  });

  test('la barra de ventana simula los controles de macOS', () => {
    const html = run(`build(DEF)`);
    includes(html, '#ff5f57', 'debería estar el punto rojo');
    includes(html, '#febc2e', 'debería estar el punto amarillo');
    includes(html, '#28c840', 'debería estar el punto verde');
  });

  test('el modo claro y el oscuro generan paletas distintas', () => {
    const dark = run(`build(Object.assign({}, DEF, { theme: 'dark' }))`);
    const light = run(`build(Object.assign({}, DEF, { theme: 'light' }))`);
    assert(dark !== light, 'deberían ser distintos');
    includes(dark, '#1c1c1e', 'debería usar el fondo oscuro');
    includes(light, '#ffffff', 'debería usar el fondo claro');
  });

  test('build() devuelve vacío si no hay nada que publicar', () => {
    equal(run(`build(normalizePostState({ hero: { title: '', sub: '', img: '', win: '' }, info: { greet: '', paras: '', hlTitle: '', hlText: '', items: [], specs: [] }, links: { btns: [] } }))`), '');
  });

  test('un separador vacío deja una línea simple', () => {
    const html = run(`build(normalizePostState(Object.assign({}, DEF, { sep: ['', 'Info', ''] })))`);
    includes(html, 'height: 1px', 'debería quedar una línea divisoria');
  });

  test('no repite el título del separador en mayúsculas por CSS externo', () => {
    const html = run(`build(DEF)`);
    includes(html, 'text-transform: uppercase', 'el separador debería llevar su propio estilo');
  });

  test('buildStats() cuenta los elementos del post', () => {
    const stats = run(`buildStats(build(DEF), DEF)`);
    assert(stats.chars > 3000, 'debería contar los caracteres');
    equal(stats.items, 4, 'debería contar 4 características');
    equal(stats.specs, 4, 'debería contar 4 filas de ficha');
    equal(stats.buttons, 2, 'debería contar 2 botones');
    equal(stats.empty, false);
  });

  test('buildPreviewDocument() prepara el marco de vista previa', () => {
    const doc = run(`buildPreviewDocument('<p>hola</p>', palette('dark', 'azul'))`);
    includes(doc, '<!doctype html>', 'debería ser un documento completo');
    includes(doc, '<p>hola</p>', 'debería incluir el contenido');
    includes(doc, 'data-preview-theme="dark"', 'debería marcar el tema');
    includes(doc, 'links-ocultos', 'debería estilar la clase de enlaces ocultos');
  });

  test('el HTML generado no contiene marcadores sin procesar', () => {
    const html = run(`build(DEF)`);
    notIncludes(html, '**', 'no deberían quedar asteriscos de negrita');
    notIncludes(html, '[[', 'no deberían quedar corchetes de acento');
    notIncludes(html, 'undefined', 'no debería aparecer undefined');
    notIncludes(html, 'NaN', 'no debería aparecer NaN');
    notIncludes(html, '[object Object]', 'no debería aparecer un objeto sin formatear');
  });

  test('el flujo completo de análisis a HTML funciona', () => {
    const html = run(`build(analyze({ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/', noOpen: true }))`);
    assert(html.length > 3000, 'debería generar un post extenso');
    includes(html, 'Sylenth1', 'debería incluir el título detectado');
    notIncludes(html, '<script', 'no debería incluir scripts');
    const urls = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    assert(urls.length >= 1, 'debería haber enlaces');
    urls.forEach(url => {
      assert(/^https?:\/\//.test(url), `URL no permitida en la salida: ${url}`);
    });
  });
});

/* ============================================================
   Instalable: iconos y manifest
   ============================================================ */
describe('Instalable (iconos y manifest)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  test('la página declara favicon, ícono de iOS y manifest', () => {
    includes(html, 'assets/favicon.ico', 'falta el favicon .ico');
    includes(html, 'assets/icon.svg', 'falta el ícono vectorial');
    includes(html, 'assets/apple-touch-icon.png', 'falta el ícono de iOS');
    includes(html, 'manifest.webmanifest', 'falta el manifest');
    includes(html, 'name="theme-color"', 'falta el color de la barra del sistema');
  });

  test('los archivos de ícono existen y no están vacíos', () => {
    ['assets/favicon.ico', 'assets/icon.svg', 'assets/icon-maskable.svg',
     'assets/apple-touch-icon.png', 'assets/icon-192.png', 'assets/icon-512.png'].forEach(rel => {
      const file = path.join(ROOT, rel);
      assert(fs.existsSync(file), `falta ${rel}`);
      assert(fs.statSync(file).size > 200, `${rel} está vacío`);
    });
  });

  test('el manifest es JSON válido y declara lo necesario', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    equal(manifest.name.includes('Postinga'), true, 'debería nombrar al producto');
    equal(manifest.short_name, 'Postinga');
    equal(manifest.display, 'standalone', 'debería abrirse como app');
    equal(manifest.start_url, './', 'debería arrancar en la raíz relativa');
    equal(manifest.scope, './', 'el alcance debe ser relativo para que funcione en GitHub Pages');
    assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'deberían declararse íconos');
    const sizes = manifest.icons.map(icon => icon.sizes).join(' ');
    includes(sizes, '192x192');
    includes(sizes, '512x512');
    const purposes = manifest.icons.map(icon => icon.purpose).join(' ');
    includes(purposes, 'maskable', 'falta un ícono maskable para Android');
    manifest.icons.forEach(icon => {
      assert(fs.existsSync(path.join(ROOT, icon.src)), `el manifest apunta a ${icon.src}, que no existe`);
    });
  });

  test('el manifest funciona en una subcarpeta (GitHub Pages)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    notIncludes(manifest.start_url, '/postinga', 'no debería tener la ruta absoluta del repo');
    assert(!String(manifest.start_url).startsWith('/'), 'start_url debería ser relativo');
    manifest.icons.forEach(icon => {
      assert(!String(icon.src).startsWith('/'), `el ícono ${icon.src} debería ser relativo`);
    });
  });
});

/* ============================================================
   Descarga directa
   ============================================================ */
describe('Descarga directa (extract.js)', () => {
  const ONEDRIVE = 'https://1drv.ms/u/c/0b9716597a367d7b/IQAoB79xoPAgQ7v-PjvHimVhAV7_wKVmaGPwonZyt5eQzVg?e=UVr8sg';

  test('toDirectDownload() convierte un enlace corto de OneDrive', () => {
    const result = run(`toDirectDownload(${JSON.stringify(ONEDRIVE)})`);
    equal(result.changed, true);
    equal(result.service, 'OneDrive');
    includes(result.url, 'download=1');
    includes(result.url, 'e=UVr8sg', 'debería conservar el token original');
  });

  test('toDirectDownload() conserva los parámetros existentes', () => {
    const result = run(`toDirectDownload('https://1drv.ms/u/s!ABC123?e=TOKEN')`);
    const parsed = new URL(result.url);
    equal(parsed.searchParams.get('e'), 'TOKEN');
    equal(parsed.searchParams.get('download'), '1');
  });

  test('toDirectDownload() es idempotente', () => {
    const once = run(`toDirectDownload(${JSON.stringify(ONEDRIVE)})`).url;
    ctx.onceDirect = once;
    const twice = run(`toDirectDownload(onceDirect)`);
    equal(twice.changed, false, 'no debería volver a cambiar');
    equal(twice.url, once);
    equal(twice.service, 'OneDrive');
  });

  test('toDirectDownload() no toca otros sitios', () => {
    const result = run(`toDirectDownload('https://ejemplo.com/archivo.zip')`);
    equal(result.changed, false);
    equal(result.service, '');
    equal(result.url, 'https://ejemplo.com/archivo.zip');
  });

  test('toDirectDownload() no rompe con una URL inválida', () => {
    const result = run(`toDirectDownload('no es una url')`);
    equal(result.changed, false);
    equal(result.url, 'no es una url');
  });

  test('isDirectDownload() distingue el enlace ya convertido', () => {
    equal(run(`isDirectDownload(${JSON.stringify(ONEDRIVE)})`), false, 'el original todavía no es directo');
    equal(run(`isDirectDownload(${JSON.stringify(ONEDRIVE.replace('?e=', '?download=1&e='))})`), true);
  });

  test('el analizador guarda el enlace ya convertido', () => {
    const text = [
      'Kit de batería virtual para producir',
      '',
      'Este kit trae muestras de batería acústica grabadas en estudio y organizadas por categoría para trabajar rápido en cualquier proyecto.',
      '',
      'Descargar: ' + ONEDRIVE
    ].join('\n');
    const post = analyzeWith(`{ text: ${JSON.stringify(text)} }`);
    const urls = post.links.btns.map(button => button.url);
    assert(urls.length >= 1, 'debería detectar el enlace');
    const target = urls.find(url => url.includes('1drv.ms'));
    assert(target, `debería estar el enlace de OneDrive: ${urls.join(' ')}`);
    includes(target, 'download=1', 'debería guardarse como descarga directa');
    const last = post.links.btns.find(button => button.url === target);
    equal(last.style, 'primary', 'una descarga debería ser el botón principal');
  });
});

/* ============================================================
   Candados por sección
   ============================================================ */
describe('Candados por sección (constants.js)', () => {
  function makePost(variant) {
    const old = variant === 'viejo';
    return {
      id: 'x',
      locked: { hero: false, info: false, items: false, specs: false, links: false },
      hero: { win: 'W', img: 'https://img.com/1.jpg', title: old ? 'Título viejo' : 'Título nuevo', sub: old ? 'Sub viejo' : 'Sub nuevo' },
      info: {
        win: 'I',
        greet: old ? 'Saludo viejo' : 'Saludo nuevo',
        paras: old ? 'Párrafo viejo' : 'Párrafo nuevo',
        hlTitle: old ? 'HL viejo' : 'HL nuevo',
        hlText: old ? 'Texto viejo' : 'Texto nuevo',
        listTitle: old ? 'Lista vieja' : 'Lista nueva',
        items: [{ tag: 'A', color: 'azul', name: old ? 'Item viejo' : 'Item nuevo', desc: 'd' }],
        specTitle: old ? 'Ficha vieja' : 'Ficha nueva',
        specs: [{ k: 'K', v: old ? 'V viejo' : 'V nuevo' }]
      },
      links: { title: old ? 'Links viejos' : 'Links nuevos', text: 't', hide: true, btns: [{ label: old ? 'Viejo' : 'Nuevo', url: 'https://' + (old ? 'viejo' : 'nuevo') + '.com', style: 'primary' }] },
      source: { url: 'https://' + (old ? 'viejo' : 'nuevo') + '.com', images: [] }
    };
  }

  ctx.lockedBase = makePost('viejo');
  ctx.lockedNext = makePost('nuevo');

  const mergeWith = flags => {
    ctx.lockedFlags = flags;
    return run(`mergeSections(
      { ...lockedBase, locked: { hero: false, info: false, items: false, specs: false, links: false, ...lockedFlags } },
      lockedNext
    )`);
  };

  test('sin candados se reemplaza todo', () => {
    const out = mergeWith({});
    equal(out.hero.title, 'Título nuevo');
    equal(out.info.paras, 'Párrafo nuevo');
    equal(out.info.items[0].name, 'Item nuevo');
    equal(out.info.specs[0].v, 'V nuevo');
    equal(out.links.title, 'Links nuevos');
  });

  test('portada bloqueada se conserva', () => {
    const out = mergeWith({ hero: true });
    equal(out.hero.title, 'Título viejo');
    equal(out.hero.img, 'https://img.com/1.jpg');
    equal(out.info.paras, 'Párrafo nuevo', 'el resto debería actualizarse');
  });

  test('información bloqueada conserva textos pero actualiza ítems', () => {
    const out = mergeWith({ info: true });
    equal(out.info.paras, 'Párrafo viejo');
    equal(out.info.greet, 'Saludo viejo');
    equal(out.info.hlTitle, 'HL viejo');
    equal(out.info.items[0].name, 'Item nuevo', 'los ítems no están cubiertos por este candado');
    equal(out.info.listTitle, 'Lista nueva');
  });

  test('características bloqueadas conservan la lista y su título', () => {
    const out = mergeWith({ items: true });
    equal(out.info.items[0].name, 'Item viejo');
    equal(out.info.listTitle, 'Lista vieja');
    equal(out.info.specs[0].v, 'V nuevo', 'la ficha debería actualizarse');
    equal(out.info.paras, 'Párrafo nuevo');
  });

  test('ficha bloqueada conserva los datos y su título', () => {
    const out = mergeWith({ specs: true });
    equal(out.info.specs[0].v, 'V viejo');
    equal(out.info.specTitle, 'Ficha vieja');
    equal(out.info.items[0].name, 'Item nuevo');
  });

  test('enlaces bloqueados se conservan', () => {
    const out = mergeWith({ links: true });
    equal(out.links.title, 'Links viejos');
    equal(out.links.btns[0].url, 'https://viejo.com');
  });

  test('el origen se actualiza aunque todo esté bloqueado', () => {
    const out = mergeWith({ hero: true, info: true, items: true, specs: true, links: true });
    equal(out.source.url, 'https://nuevo.com', 'las imágenes nuevas deberían quedar disponibles');
  });

  test('el resultado es una copia, no una referencia', () => {
    const out = mergeWith({ hero: true });
    out.hero.title = 'modificado';
    equal(ctx.lockedBase.hero.title, 'Título viejo', 'no debería mutar el post original');
  });

  test('normalizePostState() normaliza los candados', () => {
    const out = run(`normalizePostState({ hero: { title: 'x' }, locked: { hero: true, info: 'sí', items: 1 } })`);
    equal(out.locked.hero, true);
    equal(out.locked.info, false, 'solo los true cuentan');
    equal(out.locked.items, false);
    equal(out.locked.links, false);
  });

  test('un post viejo sin candados arranca desbloqueado', () => {
    const out = run(`normalizePostState({ hero: { title: 'x' } })`);
    equal(Object.values(out.locked).filter(Boolean).length, 0);
  });

  test('lockedSectionsLabel() nombra las secciones en castellano', () => {
    ctx.lp = run(`normalizePostState({ locked: { hero: true, specs: true } })`);
    equal(run(`lockedSectionsLabel(lp)`), 'Portada y Ficha técnica');
    ctx.lp2 = run(`normalizePostState({ locked: { hero: true } })`);
    equal(run(`lockedSectionsLabel(lp2)`), 'Portada');
    ctx.lp3 = run(`normalizePostState({})`);
    equal(run(`lockedSectionsLabel(lp3)`), '');
  });
});

/* ============================================================
   Interfaz (guards estáticos de CSS)
   ============================================================ */
describe('Interfaz (css/style.css)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

  test('los botones de escritorio ganan en especificidad', () => {
    // .icon-btn define display:inline-grid más abajo en el archivo; si los
    // selectores no son más específicos, el menú y el cerrar quedan visibles.
    assert(css.includes('.icon-btn.sidebar-close'), 'falta .icon-btn.sidebar-close');
    assert(css.includes('.icon-btn.only-narrow'), 'falta .icon-btn.only-narrow');
  });

  test('el resumen y el aviso de candados viven fuera del bloque colapsable', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    equal((html.match(/id="captureSummary"/g) || []).length, 1, 'debería haber un solo resumen');
    const summaryAt = html.indexOf('id="captureSummary"');
    const lockAt = html.indexOf('id="lockHint"');
    const bodyAt = html.indexOf('id="captureBody"');
    assert(summaryAt !== -1 && bodyAt !== -1 && lockAt !== -1, 'faltan los contenedores de la captura');
    assert(summaryAt < bodyAt, 'el resumen debe ir antes del cuerpo colapsable');
    assert(lockAt < bodyAt, 'el aviso de candados debe ir antes del cuerpo colapsable');
  });

  test('la app arranca vacía, no con el ejemplo cargado', () => {
    const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    const start = app.indexOf('function loadInitialPost');
    const end = app.indexOf('let prefs = loadPrefs()');
    assert(start !== -1 && end > start, 'no se encontró loadInitialPost');
    const body = app.slice(start, end);
    notIncludes(body, 'DEF', 'el arranque no debería cargar el ejemplo');
    includes(body, 'BLANK', 'debería arrancar con el post vacío');
    includes(app, 'loadExample', 'el ejemplo debería poder cargarse a pedido');
  });

  test('la biblioteca se puede plegar en escritorio', () => {
    const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    includes(html, 'id="bSideToggle"', 'falta el botón de plegado');
    includes(html, 'id="themeToggle"', 'falta el selector de tema en la barra');
    equal((html.match(/id="themeToggle"/g) || []).length, 1, 'debería haber un solo selector de tema en la barra');
    includes(app, 'setAppearance', 'debería existir la función que cambia el tema');
    includes(css, 'sidebar-collapsed', 'falta el estado plegado en CSS');
    includes(app, 'sidebarCollapsed', 'la preferencia debería persistirse');
  });

  test('cada sección bloqueable tiene su candado', () => {
    const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    includes(app, 'data-lock=', 'las cabeceras deberían traer el botón de candado');
    includes(app, 'LOCKABLE_SECTIONS', 'debería usarse la lista de secciones bloqueables');
    includes(app, 'mergeSections(S, post)', 'el análisis debería respetar los candados');
    includes(app, 'mergeSections(entry.state, post)', 'la actualización desde biblioteca también');
    includes(app, 'data-update=', 'la biblioteca debería traer la acción de actualizar');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    includes(html, 'id="updateSheet"', 'falta la hoja de actualización');
    includes(html, 'id="updateRun"', 'falta el botón de actualizar');
  });

  test('la interfaz no depende de módulos ni de build', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    notIncludes(html, 'type="module"', 'no debería usar módulos');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    equal(scripts.length, 6, `se esperaban 6 scripts, hay ${scripts.length}`);
    scripts.forEach(src => {
      assert(fs.existsSync(path.join(ROOT, src)), `falta el archivo ${src}`);
    });
  });
});

const COLOR_IDS = run(`COLORS.map(color => color[0])`);

/* ============================================================
   IA (ai.js)
   ============================================================ */
describe('IA (ai.js)', () => {
  const PROMPT_BASE = run(`analyze({ html: htmlFixture, sourceUrl: 'https://www.lennardigital.com/sylenth1/', noOpen: true })`);
  ctx.promptBase = PROMPT_BASE;

  test('parseJsonLoose() limpia los cercos de markdown', () => {
    const fence = String.fromCharCode(96).repeat(3);
    ctx.jsonFenced = `${fence}json\n{"a":1}\n${fence}`;
    equal(run(`parseJsonLoose(jsonFenced).a`), 1);
    equal(run(`parseJsonLoose('Texto previo {"a":{"b":2}} y algo más').a.b`), 2);
  });

  test('parseJsonLoose() tolera comas finales', () => {
    equal(run(`parseJsonLoose('{"a":[1,2,],}').a.length`), 2);
  });

  test('parseJsonLoose() falla claro si no hay JSON', () => {
    let message = '';
    try {
      run(`parseJsonLoose('no hay json acá')`);
    } catch (error) {
      message = error.message;
    }
    matches(message, /JSON/i, 'debería avisar que no es JSON');
  });

  test('mergeAiPost() respeta el título y el saludo de la IA', () => {
    ctx.aiOut = { hero: { title: 'Título de la IA', sub: 'Subtítulo IA' }, info: { greet: 'Hola IA' } };
    const merged = run(`mergeAiPost(aiOut, promptBase, { noOpen: true })`);
    equal(merged.hero.title, 'Título de la IA');
    equal(merged.info.greet, 'Hola IA');
  });

  test('mergeAiPost() descarta enlaces inventados por la IA', () => {
    ctx.aiOut = {
      hero: { title: 'T' },
      links: { btns: [
        { label: 'Inventado', url: 'https://sitio-inventado.example/x' },
        { label: 'Real', url: 'https://www.lennardigital.com/downloads/' }
      ] }
    };
    const merged = run(`mergeAiPost(aiOut, promptBase, { noOpen: true })`);
    const urls = merged.links.btns.map(button => button.url).join(' ');
    notIncludes(urls, 'sitio-inventado', 'no debería aceptar el enlace inventado');
    includes(urls, 'lennardigital.com', 'debería conservar el enlace real');
  });

  test('mergeAiPost() descarta imágenes inventadas por la IA', () => {
    ctx.aiOut = { hero: { title: 'T', img: 'https://sitio-inventado.example/falsa.jpg' } };
    const merged = run(`mergeAiPost(aiOut, promptBase, { noOpen: true })`);
    notIncludes(merged.hero.img, 'sitio-inventado', 'no debería aceptar la imagen inventada');
  });

  test('mergeAiPost() acepta una imagen que sí venía en la fuente', () => {
    const realImage = PROMPT_BASE.source.images[0];
    assert(realImage, 'la base debería traer imágenes detectadas');
    ctx.realImage = realImage;
    const merged = run(`mergeAiPost({ hero: { title: 'T', img: realImage } }, promptBase, { noOpen: true })`);
    equal(merged.hero.img, realImage);
  });

  test('mergeAiPost() normaliza etiquetas y colores', () => {
    ctx.aiOut = { info: { items: [
      { tag: 'motor', color: 'color-que-no-existe', name: 'A', desc: 'a' },
      { tag: 'Filtros!', color: 'azul', name: 'B', desc: 'b' }
    ] } };
    const merged = run(`mergeAiPost(aiOut, promptBase, { noOpen: true })`);
    equal(merged.info.items[0].tag, 'MOTOR');
    assert(COLOR_IDS.includes(merged.info.items[0].color), `color inválido: ${merged.info.items[0].color}`);
    notIncludes(merged.info.items[1].tag, '!', 'no debería dejar signos en la etiqueta');
  });

  test('mergeAiPost() conserva la ficha del motor local si la IA no aporta', () => {
    ctx.aiOut = { info: { items: [], specs: [] } };
    const merged = run(`mergeAiPost(aiOut, promptBase, { noOpen: true })`);
    assert(merged.info.specs.length >= 1, 'debería conservar la ficha detectada');
    assert(merged.info.items.length >= 1, 'debería conservar las características detectadas');
  });

  test('aiHasKey() entiende los servidores locales sin clave', () => {
    equal(run(`aiHasKey('openai', { openai: '' }, 'http://localhost:11434/v1')`), true);
    equal(run(`aiHasKey('openai', { openai: '' }, 'https://api.openai.com/v1')`), false);
    equal(run(`aiHasKey('gemini', { gemini: 'AIza-x' })`), true);
    equal(run(`aiHasKey('local', {})`), true);
  });

  test('buildAiPrompt() arma un pedido completo y sin fugas', () => {
    const prompt = run(`buildAiPrompt({ sourceText: 'contenido de prueba', baseline: promptBase, options: { tone: 'pro', noOpen: true }, type: 'software', sourceUrl: 'https://x.com/', siteName: 'x.com' })`);
    includes(prompt, 'JSON', 'debería pedir JSON');
    includes(prompt, 'MATERIAL FUENTE', 'debería incluir el material');
    includes(prompt, 'contenido de prueba');
    includes(prompt, 'Informativo', 'debería reflejar el tono elegido');
    includes(prompt, 'No uses los signos de apertura', 'con noOpen debería prohibir los signos de apertura');
  });
});

/* ============================================================
   Servidor (server.js)
   ============================================================ */
function httpRequest(base, method, urlPath) {
  return new Promise(resolve => {
    const target = new URL(urlPath, base);
    const request = http.request({
      host: target.hostname,
      port: target.port,
      method,
      path: target.pathname + target.search
    }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', error => resolve({ status: 0, body: String(error.message) }));
    request.end();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('El servidor no arrancó a tiempo.'));
    }, 9000);
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Local:\s+(http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, base: match[1] });
      }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

describeAsync('Servidor (server.js)', async () => {
  let server;
  try {
    server = await startServer();
  } catch (error) {
    failures.push({ group: 'Servidor (server.js)', name: 'arranque', message: error.message });
    console.log(`  \x1b[31m✗\x1b[0m no arrancó: ${error.message}`);
    return;
  }

  const base = server.base;
  try {
    await testAsync('/api/health responde ok', async () => {
      const res = await httpRequest(base, 'GET', '/api/health');
      equal(res.status, 200);
      equal(JSON.parse(res.body).ok, true);
    });

    await testAsync('sirve la aplicación y todos sus recursos', async () => {
      const index = await httpRequest(base, 'GET', '/');
      equal(index.status, 200);
      includes(index.body, 'Postinga');
      const assets = ['css/style.css', 'js/constants.js', 'js/extract.js', 'js/analyze.js', 'js/generator.js', 'js/ai.js', 'js/app.js', 'assets/icon.svg'];
      for (const asset of assets) {
        const res = await httpRequest(base, 'GET', '/' + asset);
        equal(res.status, 200, `no sirve ${asset}`);
      }
    });

    await testAsync('devuelve 404 en archivos inexistentes', async () => {
      equal((await httpRequest(base, 'GET', '/js/no-existe.js')).status, 404);
    });

    await testAsync('no expone archivos ocultos ni dependencias', async () => {
      equal((await httpRequest(base, 'GET', '/.git/config')).status, 404);
      equal((await httpRequest(base, 'GET', '/.env')).status, 404);
      equal((await httpRequest(base, 'GET', '/node_modules/x.js')).status, 404);
    });

    await testAsync('no permite salir del directorio del proyecto', async () => {
      const escapes = [
        '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '/..%2f..%2f..%2f..%2fetc%2fpasswd',
        '/%2e%2e/%2e%2e/%2e%2e/etc/passwd'
      ];
      for (const attempt of escapes) {
        const res = await httpRequest(base, 'GET', attempt);
        notIncludes(res.body, 'root:', `debería filtrar ${attempt}`);
        notIncludes(res.body, '/bin/bash', `debería filtrar ${attempt}`);
      }
    });

    await testAsync('/api/fetch exige el parámetro url', async () => {
      equal((await httpRequest(base, 'GET', '/api/fetch')).status, 400);
    });

    await testAsync('/api/fetch bloquea direcciones internas (SSRF)', async () => {
      const blocked = [
        'http://localhost:8080/',
        'http://127.0.0.1:9/',
        'http://192.168.1.1/',
        'http://10.0.0.1/',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]/',
        'http://0.0.0.0/'
      ];
      for (const target of blocked) {
        const res = await httpRequest(base, 'GET', '/api/fetch?url=' + encodeURIComponent(target));
        equal(res.status, 400, `debería bloquear ${target}`);
        equal(JSON.parse(res.body).ok, false, `debería informar el bloqueo de ${target}`);
      }
    });

    await testAsync('/api/fetch rechaza esquemas y credenciales inseguras', async () => {
      const invalid = ['file:///etc/passwd', 'javascript:alert(1)', 'http://usuario:clave@ejemplo.com/', 'no-es-una-url'];
      for (const target of invalid) {
        const res = await httpRequest(base, 'GET', '/api/fetch?url=' + encodeURIComponent(target));
        equal(res.status, 400, `debería rechazar ${target}`);
      }
    });

    await testAsync('/api/fetch informa el fallo de un dominio inexistente', async () => {
      const res = await httpRequest(base, 'GET', '/api/fetch?url=' + encodeURIComponent('https://dominio-que-no-existe-9f8a7b.example/'));
      equal(res.status, 502);
      equal(JSON.parse(res.body).ok, false);
    });

    await testAsync('responde 405 y 404 donde corresponde', async () => {
      equal((await httpRequest(base, 'POST', '/api/fetch?url=https://x.com/')).status, 405);
      equal((await httpRequest(base, 'GET', '/api/desconocido')).status, 404);
    });
  } finally {
    if (server.child) server.child.kill();
  }
});

/* ============================================================
   Resumen
   ============================================================ */
/* ============================================================
   Resumen
   ============================================================ */
function printSummary() {
  console.log('');
  if (failures.length) {
    console.log(`\x1b[31m${failures.length} test(s) fallaron\x1b[0m de ${passed + failures.length}.`);
    failures.forEach(failure => {
      console.log(`  · [${failure.group}] ${failure.name}`);
      console.log(`    ${failure.message.split('\n')[0]}`);
    });
    process.exitCode = 1;
  } else {
    console.log(`\x1b[32m${passed} tests pasaron\x1b[0m.`);
  }
}

(async () => {
  for (const entry of asyncGroups) {
    group = entry.name;
    console.log(`\n\x1b[1m${entry.name}\x1b[0m`);
    try {
      await entry.fn();
    } catch (error) {
      failures.push({ group: entry.name, name: 'bloque completo', message: error && error.message ? error.message : String(error) });
      console.log(`  \x1b[31m✗\x1b[0m el bloque falló: ${error && error.message}`);
    }
  }
  printSummary();
})();
