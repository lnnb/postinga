/**
 * Postinga
 * Analizador heurístico local.
 * Toma un texto, un HTML o el resultado de un lector de URLs y arma
 * una estructura completa de post: portada, cuerpo, características,
 * ficha técnica y enlaces. No inventa datos: si algo no está, lo omite.
 */

/* ============================================================
   Diccionarios y patrones
   ============================================================ */
const GENERIC_HEADINGS = new Set([
  'introduction', 'introduccion', 'overview', 'resumen', 'description', 'descripcion',
  'features', 'caracteristicas', 'funciones', 'key features', 'main features',
  'specifications', 'specs', 'especificaciones', 'technical specifications',
  'system requirements', 'requirements', 'requisitos', 'compatibility', 'compatibilidad',
  'conclusion', 'conclusiones', 'comments', 'comentarios', 'related posts', 'articulos relacionados',
  'faq', 'preguntas frecuentes', 'gallery', 'galeria', 'screenshots', 'capturas',
  'download', 'downloads', 'descarga', 'descargas', 'pricing', 'precios', 'precio',
  'about', 'acerca de', 'sobre nosotros', 'contact', 'contacto', 'support', 'soporte',
  'documentation', 'documentacion', 'tutorial', 'tutoriales', 'reviews', 'resenas',
  'the basics', 'getting started', 'primeros pasos', 'how it works', 'como funciona',
  'pros and cons', 'ventajas y desventajas', 'our verdict', 'veredicto',
  'enlaces', 'links', 'recursos', 'resources', 'fuentes', 'sources'
]);

const JUNK_LINE_PATTERNS = [
  /^(aceptar|rechazar|configurar|gestionar|personalizar)( (todas? )?(las )?cookies)?$/i,
  /^(accept|reject|manage|configure)( all)?( cookies)?$/i,
  /^(skip to content|ir al contenido|saltar al contenido|volver arriba|back to top|top)$/i,
  /^(publicidad|anuncio|advertisement|advertising|sponsored|patrocinado|promocionado)$/i,
  /^(comentarios|comments|deja un comentario|leave a comment)$/i,
  /^(articulos relacionados|related posts|te puede interesar|quizas te interese|mas leidos|sigue leyendo)$/i,
  /^(compartir|share|share this|comparte|tweet|whatsapp|telegram)(\s|:)?$/i,
  /^(inicio|home|menu|buscar|search|ingresar|iniciar sesion|registrarse|mi cuenta|log in|sign in)$/i,
  /^(contacto|contact|about|acerca de|privacidad|privacy|terminos|terms|legal|aviso legal|cookies)$/i,
  /^(todos los derechos reservados|all rights reserved)/i,
  /copyright\s*(©|\(c\))?\s*\d{4}/i,
  /^(siguiente|anterior|next|previous|pagina siguiente|pagina anterior)$/i,
  /^(leer mas|read more|ver mas|see more|continue reading)$/i,
  /^(suscripcion|suscribete|suscribite|newsletter|boletin|recibi novedades|get the newsletter)$/i
];

const DENY_SPEC_KEYS = new Set([
  'leer', 'leermas', 'ver', 'vermas', 'compartir', 'fuente', 'fuentes', 'foto', 'fotos', 'imagen',
  'imagenes', 'video', 'videos', 'nota', 'notas', 'tags', 'etiquetas', 'autor del post', 'publicado por',
  'categoria del post', 'comentarios', 'menu', 'inicio', 'home', 'siguiente', 'anterior', 'descargar',
  'note', 'read', 'see', 'source', 'image', 'video', 'share', 'posted by', 'tags', 'category'
]);

const SPEC_KEY_RULES = [
  [/^(sistemas? operativos?|plataformas?|sistema|os|compatibilidad( de sistemas)?|supported platforms?)$/i, 'Plataformas'],
  [/^(formatos?|format|formatos? soportados?|file formats?|compatibilidad de formatos?)$/i, 'Formatos'],
  [/^(requisitos?( (del|de) sistema)?|requerimientos?( (del|de) sistema)?|system requirements?|minimum requirements?)$/i, 'Requisitos'],
  [/^(hardware( (minimo|requerido))?|procesador( requerido)?|cpu|memoria( ram)?|ram|gpu|graficos?|graphics)$/i, 'Hardware'],
  [/^(tamano|tamano del archivo|peso|espacio( (en disco|requerido))?|size|file size|instalacion)$/i, 'Tamaño'],
  [/^(precio|price|costo|coste|valor|desde|starting at)$/i, 'Precio'],
  [/^(licencia|license|tipo de licencia|license type)$/i, 'Licencia'],
  [/^(idioma(s)?|language|languages|lenguaje)$/i, 'Idioma'],
  [/^(version|build|version actual)$/i, 'Versión'],
  [/^(desarrollador(es)?|developer|fabricante|maker|editor(ial)?|publisher|autor(es)?|creador(es)?|studio|estudio)$/i, 'Desarrollador'],
  [/^(fecha( de (lanzamiento|publicacion))?|lanzamiento|release( date)?|publicado|published|fecha)$/i, 'Lanzamiento'],
  [/^(genero(s)?|genre|categoria|category|tipo|type)$/i, 'Género'],
  [/^(publico|audiencia|edad( recomendada)?|rating|clasificacion|content rating)$/i, 'Clasificación'],
  [/^(duracion|duration|runtime|tiempo de juego|playtime)$/i, 'Duración'],
  [/^(jugadores|players|modos? de juego|game modes?)$/i, 'Jugadores'],
  [/^(web|sitio( web| oficial)?|website|url|pagina( oficial)?)$/i, 'Sitio web'],
  [/^(puntuacion|score|rating|nota)$/i, 'Puntuación'],
  [/^(procesador|processor)$/i, 'Procesador'],
  [/^(memoria|memory)$/i, 'Memoria'],
  [/^(disco|storage)$/i, 'Almacenamiento'],
  [/^(modelo|model)$/i, 'Modelo'],
  [/^(color(es)?|colours?)$/i, 'Colores'],
  [/^(peso|weight)$/i, 'Peso']
];

const TAG_RULES = [
  { tag: 'IA', color: 'violeta', re: /\b(inteligencia artificial|\bIA\b|IA generativa|machine learning|deep learning|gpt|chatgpt|modelos? de lenguaje|neural|generative ai)\b/i },
  { tag: 'SEGURIDAD', color: 'rojo', re: /\b(seguridad|privacidad|encriptaci[oó]n|cifrado|2fa|autenticaci[oó]n|protecci[oó]n|antivirus|contrase[nñ]as?|privacy)\b/i },
  { tag: 'PRECIO', color: 'amarillo', re: /\b(precio|precios|gratis|gratuit[oa]s?|suscripci[oó]n|planes?|pago|licencia|descuento|oferta|pricing|subscription)\b|(?<!alias-)\bfree\b/i },
  { tag: 'RENDIMIENTO', color: 'naranja', re: /\b(rendimiento|performance|r[aá]pid[oa]|velocidad|latencia|cpu|gpu|optimizaci[oó]n|optimizado|fps|potencia|fluidez|motor)\b/i },
  { tag: 'OSCILADORES', color: 'naranja', re: /\b(oscilador(es)?|oscillators?|unison|waveform|forma de onda|alias-free)\b/i },
  { tag: 'FILTROS', color: 'azul', re: /\b(filtros?|filters?|ecualizaci[oó]n|equalizer|eq|frecuencia|resonancia|lowpass|highpass|bandpass)\b/i },
  { tag: 'EFECTOS', color: 'verde', re: /\b(efectos?|effects?|reverb|delay|chorus|flanger|phaser|distorsi[oó]n|compresor|compressor|saturaci[oó]n|oversampling)\b/i },
  { tag: 'MODULACIÓN', color: 'violeta', re: /\b(modulaci[oó]n|modulation|lfo|adsr|envolventes?|envelopes?|arpegiador|arpeggiator|midi|automation|automatizaci[oó]n)\b/i },
  { tag: 'SONIDOS', color: 'amarillo', re: /\b(presets?|sonidos?|sounds?|librer[ií]a|library|patches?|samples?|instrumentos?|voices?|voces)\b/i },
  { tag: 'INTERFAZ', color: 'rosa', re: /\b(interfaz|interface|ui\b|ux\b|pantalla|screen|panel|dise[nñ]o visual|drag( and| &) drop|arrastrar y soltar)\b/i },
  { tag: 'COMPATIBILIDAD', color: 'azul', re: /\b(compatibilidad|compatible|windows|macos|linux|android|ios|vst[0-9i]*|aax|audio units?|clap|plugin|integraci[oó]n|api|exporta|importa)\b/i },
  { tag: 'DISEÑO', color: 'rosa', re: /\b(dise[nñ]o|design|estilo|style|est[eé]tica|animaciones?|animations?|tema|theme)\b/i },
  { tag: 'JUEGO', color: 'verde', re: /\b(juego|game|gameplay|multijugador|multiplayer|co-?op|niveles?|levels?|personajes?|characters?|historia|story|mundo abierto|open world|gr[aá]ficos)\b/i },
  { tag: 'CONTENIDO', color: 'azul', re: /\b(contenido|content|cap[ií]tulos?|episodios?|temporadas?|art[ií]culos?|textos?|libro|book|guion|script|direcci[oó]n|reparto|cast)\b/i },
  { tag: 'SOPORTE', color: 'gris', re: /\b(soporte|support|ayuda|help|documentaci[oó]n|docs|tutorial|comunidad|community|actualizaci[oó]n|update|mantenimiento)\b/i },
  { tag: 'AUTOMATIZACIÓN', color: 'violeta', re: /\b(automatizaci[oó]n|automation|flujo de trabajo|workflow|plantillas?|templates?|scripts?|macros?)\b/i },
  { tag: 'PRODUCTIVIDAD', color: 'verde', re: /\b(productividad|productivity|eficiencia|efficiency|organizaci[oó]n|gesti[oó]n|colaboraci[oó]n|equipos?)\b/i },
  { tag: 'FUNCIONES', color: 'verde', re: /\b(funci[oó]n|funciones|function|herramienta|tool|caracter[ií]stica|feature|incluye|permite|soporta|gesti[oó]n)\b/i }
];

const TAG_COLOR_ROTATION = ['azul', 'violeta', 'naranja', 'verde', 'rosa', 'amarillo', 'gris', 'azul'];

const SOCIAL_HOSTS = [
  'facebook.com', 'fb.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com', 'pinterest.com',
  'linkedin.com', 'reddit.com', 'telegram.me', 't.me', 'wa.me', 'whatsapp.com', 'snapchat.com',
  'threads.net', 'tumblr.com', 'discord.gg', 'discord.com'
];

const BAD_LINK_PATTERNS = /\b(login|signin|sign-in|signin|signup|sign-up|register|account|cart|checkout|privacy|terms|cookies|legal|newsletter|subscribe|unsubscribe|share|sharer|intent|logout|password|mailto:|javascript:)/i;
const IMAGE_EXT = /\.(?:png|jpe?g|webp|avif|gif|svg|bmp|tiff)(?:\?|#|$)/i;
const FILE_EXT = /\.(?:exe|dmg|pkg|msi|deb|rpm|apk|xapk|zip|rar|7z|tar|gz|iso|torrent|epub|pdf|mp3|flac|wav|mp4|mkv)(?:\?|#|$)/i;
const DOWNLOAD_HINT = /\b(download|downloads|descargar|descarga|descargas|demo|trial|prueba|free|gratis|setup|installer|instalador|buy|purchase|comprar|store|tienda|steam|itch|apps\.apple|play\.google|releases)\b/i;
const DOCS_HINT = /\b(docs?|documentation|documentaci[oó]n|manual|user guide|guia|guide|help|soporte|support|faq|wiki|knowledge base|tutorial)\b/i;
const VIDEO_HINT = /\b(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)\b/i;
const STORE_HOSTS = [
  ['steam', /store\.steampowered\.com|steampowered\.com/i],
  ['App Store', /apps\.apple\.com/i],
  ['Google Play', /play\.google\.com/i],
  ['itch.io', /itch\.io/i],
  ['GOG', /gog\.com/i],
  ['Epic Games', /epicgames\.com/i]
];

const TYPE_HINTS = {
  software: [
    [/\b(vst3?|vsti|aax|clap|audio units?|plugin|sintetizador|synth|synthesizer|daw|sampler|efectos? de audio)\b/i, 6],
    [/\b(software|programa|aplicaci[oó]n|app\b|instalador|instalar|licencia|suscripci[oó]n|versi[oó]n)\b/i, 2],
    [/\b(descargar|download|setup|\.dmg|\.exe|\.apk)\b/i, 2],
    [/\b(windows|macos|linux|android|ios)\b/i, 1]
  ],
  game: [
    [/\b(videojuego|juego|gameplay|jugabilidad|multijugador|co-?op)\b/i, 6],
    [/\b(steam|playstation|ps4|ps5|xbox|nintendo switch|consola|gamer)\b/i, 4],
    [/\b(niveles?|personajes?|mundo abierto|dlc)\b/i, 2]
  ],
  movie: [
    [/\b(pel[ií]cula|film|largometraje|estreno|taquilla)\b/i, 6],
    [/\b(serie|temporada|episodios?|netflix|hbo|prime video|disney\+|star\+)\b/i, 5],
    [/\b(director|directora|reparto|protagonista|guion|trailer)\b/i, 3]
  ],
  music: [
    [/\b([aá]lbum|disco|single|sencillo|canci[oó]n|spotify|apple music|artista|banda|tour|gira|vinilo)\b/i, 6],
    [/\b(estudio|grabaci[oó]n|productor musical|remix)\b/i, 2]
  ],
  book: [
    [/\b(libro|novela|ensayo|poemario|autor|autora|editorial|isbn|tapa dura|ebook)\b/i, 6]
  ],
  hardware: [
    [/\b(procesador|tarjeta gr[aá]fica|placa madre|gpu|cpu|benchmark|rtx|ryzen|smartphone|tablet|notebook|auriculares|teclado|mouse|monitor)\b/i, 4],
    [/\b(an[aá]lisis|review|rese[nñ]a|unboxing|especificaciones t[eé]cnicas)\b/i, 2]
  ],
  tutorial: [
    [/\b(c[oó]mo|como|paso a paso|tutorial|gu[ií]a|trucos|tips|configurar|instalaci[oó]n)\b/i, 4]
  ],
  news: [
    [/\b(seg[uú]n|declar[oó]|anunci[oó]|informe|noticia|reporte|fuentes?|confirm[oó])\b/i, 2]
  ]
};

const TYPE_COPY = {
  software: {
    list: ['Qué trae debajo del capó?', 'Funciones que marcan la diferencia', 'Características principales'],
    specs: ['Requisitos y compatibilidad', 'Ficha técnica'],
    highlight: ['Por qué vale la pena probarlo?', 'Qué lo hace distinto?', 'Vale la pena sumarlo?'],
    cta: ['Descargalo desde el sitio oficial', 'Bajalo desde la fuente oficial', 'Descarga y enlaces oficiales'],
    ctaText: ['Te dejo el acceso oficial para que lo pruebes:', 'Elegí la opción que te sirva:', 'Todo lo que necesitás, a un clic:']
  },
  game: {
    list: ['Qué ofrece el juego?', 'Mecánicas y puntos fuertes', 'Características principales'],
    specs: ['Ficha técnica y requisitos', 'Especificaciones del juego'],
    highlight: ['Vale la pena jugarlo?', 'Qué tiene de especial?', 'Qué lo hace distinto?'],
    cta: ['Conseguilo desde el sitio oficial', 'Links oficiales del juego', 'Descarga y tiendas oficiales'],
    ctaText: ['Elegí tu plataforma y entrá al enlace oficial:', 'Te dejo los accesos oficiales:', 'Acá tenés los links para conseguirlo:']
  },
  movie: {
    list: ['De qué se trata?', 'Detalles y puntos fuertes', 'Lo que tenés que saber'],
    specs: ['Ficha técnica', 'Datos de la película'],
    highlight: ['Vale la pena verla?', 'Qué la hace distinta?', 'Qué tiene para contar?'],
    cta: ['Dónde verla', 'Links oficiales', 'Trailer y más información'],
    ctaText: ['Te dejo los accesos oficiales:', 'Elegí dónde verla:', 'Más info y tráiler oficial:']
  },
  music: {
    list: ['Qué tiene este material?', 'Detalles del proyecto', 'Lo más destacado'],
    specs: ['Ficha técnica', 'Datos del lanzamiento'],
    highlight: ['Vale la pena escucharlo?', 'Qué lo hace distinto?', 'Qué tiene de especial?'],
    cta: ['Escuchalo en las plataformas', 'Links oficiales', 'Escucha y descarga oficial'],
    ctaText: ['Elegí tu plataforma:', 'Te dejo los accesos oficiales:', 'Disponible acá:']
  },
  book: {
    list: ['De qué se trata?', 'Detalles del libro', 'Lo más destacado'],
    specs: ['Ficha del libro', 'Datos de la obra'],
    highlight: ['Vale la pena leerlo?', 'Qué lo hace distinto?', 'De qué se trata?'],
    cta: ['Conseguilo en el sitio oficial', 'Links de compra y más info', 'Dónde encontrarlo'],
    ctaText: ['Te dejo los accesos oficiales:', 'Elegí dónde conseguirlo:', 'Más información y compra:']
  },
  hardware: {
    list: ['Qué tiene de nuevo?', 'Puntos fuertes del equipo', 'Características principales'],
    specs: ['Especificaciones técnicas', 'Ficha técnica'],
    highlight: ['Vale la pena el cambio?', 'Qué tan bueno es?', 'Qué lo hace distinto?'],
    cta: ['Más info y precio oficial', 'Links oficiales', 'Especificaciones y compra'],
    ctaText: ['Te dejo los enlaces oficiales:', 'Para ver precios y disponibilidad:', 'Toda la info oficial acá:']
  },
  tutorial: {
    list: ['Qué vas a aprender?', 'Paso a paso', 'Los puntos clave'],
    specs: ['Requisitos y datos', 'Antes de empezar'],
    highlight: ['Por qué te puede servir?', 'Qué vas a lograr?', 'Vale la pena aprenderlo?'],
    cta: ['Recursos y enlaces útiles', 'Links del tutorial', 'Material complementario'],
    ctaText: ['Te dejo los recursos mencionados:', 'Enlaces útiles:', 'Descargas y referencias:']
  },
  news: {
    list: ['Los puntos clave', 'Qué tenés que saber?', 'Los detalles'],
    specs: ['Datos y contexto', 'Ficha de la noticia'],
    highlight: ['Qué pasó?', 'Qué tenés que saber?', 'Cuál es la clave?'],
    cta: ['Fuente original y más info', 'Links relacionados', 'Seguí la información'],
    ctaText: ['Te dejo la fuente original:', 'Más información en:', 'Links para profundizar:']
  },
  generic: {
    list: ['Qué trae debajo del capó?', 'Lo más destacado', 'Características principales'],
    specs: ['Especificaciones y datos', 'Ficha técnica'],
    highlight: ['Por qué vale la pena tenerlo en cuenta?', 'Qué tenés que saber?', 'Qué lo hace distinto?'],
    cta: ['Más información y enlaces oficiales', 'Links oficiales', 'Todo en un solo lugar'],
    ctaText: ['Te dejo los accesos oficiales:', 'Elegí la opción que te sirva:', 'Más info en los siguientes enlaces:']
  }
};

const GREETINGS = {
  taringa: [
    'Buenas, gente. Hoy les traigo algo que vale la pena.',
    'Qué onda, taringueros. Arrancamos con todo.',
    'Buenas, buenísimas. Se viene un aporte de los buenos.',
    'Epa, comunidad. Prestá atención que esto promete.',
    'Hola, hola. Te dejo algo que está muy bueno.',
    'Che, mirá lo que encontré. Va con todo el detalle.',
    'Buenas. Hoy hay material para el que le gusta esto.',
    'Qué hacés. Te traigo algo que no tiene desperdicio.'
  ],
  gamer: [
    'Wacho, preparate que esto se pone bueno.',
    'Buenas, gamers. Hoy hay material para viciar.',
    'Atención, jugadores: esto les puede interesar.',
    'Buenas, comunidad. Agarrate que arrancamos.'
  ],
  pro: [
    'Hola. Te comparto un repaso completo por {title}.',
    'Buenas. A continuación, los datos clave de {title}.',
    'Presentamos un resumen estructurado de {title}.',
    'Hola. Acá tenés la información esencial de {title}.'
  ]
};

const PARAGRAPH_LEADS = {
  taringa: [
    'Hoy te traigo [[{title}]].',
    'Vamos con [[{title}]].',
    'Te presento [[{title}]].',
    'Arrancamos con [[{title}]].',
    'Hoy toca [[{title}]].',
    'Se viene [[{title}]].'
  ],
  gamer: ['Vamos con [[{title}]].', 'Hoy toca [[{title}]].', 'Arrancamos con [[{title}]].'],
  pro: ['[[{title}]] a fondo.', 'Hoy analizamos [[{title}]].', 'Todo sobre [[{title}]].']
};

const CTA_PARAGRAPHS = {
  taringa: [
    'Abajo te dejo la ficha técnica y los enlaces oficiales.',
    'Más abajo está el detalle de las características y los links.',
    'Al final tenés todos los datos y los enlaces.',
    'Abajo está todo: características, datos y links.',
    'Seguí leyendo que abajo está el detalle completo y los accesos.'
  ],
  gamer: ['Abajo están los detalles y los links oficiales.', 'Más abajo tenés la ficha y los enlaces.', 'Al final queda todo el detalle y los accesos.'],
  pro: ['A continuación, las características, la ficha técnica y los enlaces oficiales.', 'Más abajo se detallan las especificaciones y los enlaces.', 'Al final encontrarás la ficha técnica y los enlaces.']
};

const HIGHLIGHT_LEADS = {
  taringa: ['Lo más destacado:', 'Lo mejor de todo:', 'La posta:', 'Lo que más se destaca:', 'Los puntos fuertes:', 'Lo que hay que saber:'],
  gamer: ['Lo más picante:', 'Los puntos fuertes:', 'Lo mejor:'],
  pro: ['Aspectos destacados:', 'Puntos clave:', 'Lo más relevante:']
};

/* Cómo se titula la ventana de información, según lo que se haya detectado. */
const INFO_WINDOW_LABELS = {
  software: 'Ficha técnica',
  hardware: 'Ficha técnica',
  game: 'Ficha del juego',
  movie: 'Ficha de la película',
  music: 'Ficha del disco',
  book: 'Ficha del libro',
  tutorial: 'Guía paso a paso',
  news: 'Resumen',
  generic: 'Información'
};

const SPEC_ORDER = ['Formatos', 'Plataformas', 'Requisitos', 'Hardware', 'Procesador', 'Memoria', 'Almacenamiento', 'Tamaño', 'Precio', 'Licencia', 'Desarrollador', 'Autor', 'Artista', 'Dirección', 'Lanzamiento', 'Publicado', 'Género', 'Clasificación', 'Duración', 'Jugadores', 'Idioma', 'Versión', 'Puntuación', 'Sitio web', 'Modelo', 'Colores'];

const NAME_TRANSLATIONS = {
  oscillators: 'Osciladores',
  oscillator: 'Oscilador',
  filters: 'Filtros',
  filter: 'Filtro',
  modulation: 'Modulación',
  performance: 'Rendimiento',
  'master fx': 'Efectos Master',
  arpeggiator: 'Arpegiador',
  distortion: 'Distorsión',
  equalizer: 'Ecualizador',
  compressor: 'Compresor',
  features: 'Características',
  'key features': 'Funciones clave',
  requirements: 'Requisitos',
  compatibility: 'Compatibilidad',
  specifications: 'Especificaciones',
  interface: 'Interfaz',
  presets: 'Presets',
  sounds: 'Sonidos',
  effects: 'Efectos',
  download: 'Descarga',
  support: 'Soporte',
  documentation: 'Documentación',
  overview: 'Vista general',
  security: 'Seguridad',
  performance_optimization: 'Optimización',
  installation: 'Instalación',
  integration: 'Integración',
  'getting started': 'Primeros pasos',
  'how it works': 'Cómo funciona'
};

/* ============================================================
   Helpers de texto
   ============================================================ */
function normalizeCompare(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isJunkLine(line) {
  const text = String(line ?? '').trim();
  if (text.length < 2) return true;
  if (text.length > 220) return false;
  return JUNK_LINE_PATTERNS.some(pattern => pattern.test(text));
}

function accentClean(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function splitSentences(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  let raw = [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      raw = Array.from(new Intl.Segmenter('es', { granularity: 'sentence' }).segment(text))
        .map(part => part.segment.trim())
        .filter(Boolean);
    } catch (error) {
      raw = [];
    }
  }
  if (!raw.length) {
    const parts = [];
    let start = 0;
    const regex = /[.!?…]+(?=\s|$)/g;
    let match;
    while ((match = regex.exec(text))) {
      const end = match.index + match[0].length;
      parts.push(text.slice(start, end).trim());
      start = end;
    }
    if (start < text.length) parts.push(text.slice(start).trim());
    raw = parts.filter(Boolean);
  }

  const merged = [];
  for (const sentence of raw) {
    const previous = merged[merged.length - 1];
    const startsLower = /^[a-záéíóúñü(]/.test(sentence);
    const previousOpen = previous && /[,;–—-]$/.test(previous);
    if (previous && (startsLower || previousOpen)) merged[merged.length - 1] = `${previous} ${sentence}`;
    else merged.push(sentence);
  }
  return merged;
}

function formatDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function clipAtBoundary(value, max, ellipsis = '…') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max + 1);
  const split = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf(', '), slice.lastIndexOf('. '));
  let cut = split > max * 0.6 ? slice.slice(0, split) : text.slice(0, max);
  cut = cut.replace(/[\s,;:.\u2013\u2014-]+$/, '');
  return cut ? cut + ellipsis : text.slice(0, max) + ellipsis;
}

function joinNatural(values) {
  const list = values.filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} y ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

function balanceMarkers(value) {
  let text = String(value ?? '');
  if ((text.match(/\*\*/g) || []).length % 2 !== 0) {
    text = text.replace(/\*\*([^*]*)$/, '$1');
  }
  const openCount = (text.match(/\[\[/g) || []).length;
  const closeCount = (text.match(/\]\]/g) || []).length;
  if (openCount > closeCount) text = text.replace(/\[\[([^\[\]]*)$/, '$1');
  if (closeCount > openCount) text = text.replace(/\]\]$/, '');
  return text;
}

function localizeName(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const key = normalizeCompare(raw);
  if (NAME_TRANSLATIONS[key]) return NAME_TRANSLATIONS[key];
  const single = raw.match(/^([A-Za-z][A-Za-z0-9/+&' -]{1,40})$/);
  if (single) {
    const translated = NAME_TRANSLATIONS[normalizeCompare(single[1])];
    if (translated) return translated;
  }
  return raw;
}

function cleanName(value) {
  let name = String(value ?? '')
    .replace(/^[\s•▪▸◦‣*–—-]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
    .replace(/[\s:;,.!?–—-]+$/, '')
    .trim();
  name = localizeName(name);
  if (name.length > 85) name = clipAtBoundary(name, 82, '');
  name = name.replace(/[\s,;:.\u2013\u2014-]+$/, '');
  if (name && name.length <= 2) return '';
  return name;
}

function cleanDescription(value) {
  let desc = String(value ?? '')
    .replace(/\b(leer m[aá]s|read more|ver m[aá]s|see more|más informaci[oó]n)\b\.?\s*$/i, '')
    .replace(/\s*\[\s*\]\s*$/,'')
    .replace(/^[\s•▪▸◦‣*–—-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!desc) return '';
  if (desc.length > 300) desc = clipAtBoundary(desc, 290, '…');
  if (!/[.!?…]$/.test(desc) && desc.length > 12) desc += '.';
  if (desc.charAt(0) === desc.charAt(0).toLowerCase()) {
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);
  }
  return desc;
}

function genericHeading(value) {
  return GENERIC_HEADINGS.has(normalizeCompare(value));
}

const NON_FEATURE_NAMES = /^(lo mejor|lo peor|en resumen|en conclusi[oó]n|resumen|conclusi[oó]n|nota|ojo|atenci[oó]n|importante|tip|consejo|aviso|record[aá]|aclaraci[oó]n|la posta|la data|el dato|lo bueno|lo malo|dato extra|dato de color)$/i;

/* Nombres que en realidad son una frase entera, no una etiqueta de característica. */
function looksLikeSentence(name) {
  const text = cleanSpace(name);
  if (!text) return true;
  if (/\b(que|como|cual|cuando|donde|porque|aunque|mientras)\b/i.test(text)) return true;
  if (/^(url source|title|published time|markdown content|image \d+)/i.test(text)) return true;
  return wordCount(text) > 5;
}

/* Una línea de ficha es corta y sin conectores: "Memoria: 4 GB de RAM".
   Una frase larga que menciona "60 MB" es prosa, no una ficha. */
function isSpecBullet(value) {
  const text = String(value ?? '');
  if (wordCount(text) > 14) return false;
  return /(\bwindows\b|\bmacos\b|\blinux\b|\bandroid\b|\bios\b|\bvst[0-9i]*\b|\baax\b|\bau\b|\bram\b|\bmemoria\b|\bcpu\b|\bprocesador\b|\bgpu\b|\d+\s*(?:gb|mb|tb)\b|\bprecio\b|\busd\b|\beur\b|\bgratis\b|\blicencia\b|\bversi[oó]n\b)/i.test(text)
    && text.length < 170;
}

// Valores que delatan una ficha técnica y no una característica redactada.
function looksLikeSpecValue(value) {
  const text = String(value ?? '');
  if (text.length > 90) return false;
  return /(\bwindows\b|\bmacos\b|\blinux\b|\bandroid\b|\bios\b|\bvst[0-9i]*\b|\baax\b|\bau\b|\bram\b|\bmemoria\b|\bcpu\b|\bprocesador\b|\bgpu\b|\d+\s*(?:gb|mb|tb)\b|\bprecio\b|\busd\b|\beur\b|\bgratis\b|\blicencia\b)/i.test(text);
}

function safeRatio(part, whole) {
  return whole ? Math.max(0, Math.min(1, part / whole)) : 0;
}

function similarText(a, b) {
  const left = new Set(normalizeCompare(a).split(' ').filter(word => word.length > 2));
  const right = new Set(normalizeCompare(b).split(' ').filter(word => word.length > 2));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach(word => { if (right.has(word)) overlap++; });
  return overlap / Math.min(left.size, right.size);
}

/* ============================================================
   Bloques
   ============================================================ */
function buildBlocks(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  const lines = source.split('\n');
  const blocks = [];
  let previous = null;
  let group = -1;
  let inGroup = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].replace(/[ \t\f\v]+/g, ' ').trim();
    if (!rawLine) {
      inGroup = false;
      previous = null;
      continue;
    }
    if (/^(?:=+|-{3,}|\*{3,}|_{3,})$/.test(rawLine)) {
      inGroup = false;
      previous = null;
      continue;
    }
    if (isJunkLine(rawLine)) {
      inGroup = false;
      previous = null;
      continue;
    }

    const heading = rawLine.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const textValue = stripMarkdownInline(heading[2]);
      if (textValue.length >= 2) {
        blocks.push({ type: 'heading', level: heading[1].length, text: textValue, raw: heading[2] });
        previous = null;
        inGroup = false;
        continue;
      }
    }

    const bullet = rawLine.match(/^(?:[•▪▸◦‣]|[-*–—](?=\s)|\d{1,2}[.)](?=\s))\s+(.+)$/);
    if (bullet) {
      if (!inGroup) {
        group += 1;
        inGroup = true;
      }
      const textValue = stripMarkdownInline(bullet[1]);
      if (textValue.length >= 3) {
        blocks.push({ type: 'bullet', group, text: textValue, raw: bullet[1] });
        previous = null;
      }
      continue;
    }

    inGroup = false;

    // "**Nombre**: descripción" o "Nombre: descripción extensa" → característica.
    const featureLine = rawLine.match(/^(?:\*\*([^*]{2,90})\*\*|([\p{Lu}0-9][^:–—|]{2,70}?))\s*(?::|–|—|\s-\s)\s*(.{30,})$/u);
    if (featureLine) {
      const rawName = featureLine[1] || featureLine[2] || '';
      const rawDesc = featureLine[3] || '';
      const name = cleanName(rawName);
      const desc = cleanDescription(rawDesc);
      const wordsInName = wordCount(name);
      if (name && desc && wordsInName <= 8 && name.length <= 48 && !NON_FEATURE_NAMES.test(name) && !genericHeading(name) && !looksLikeSentence(name) && !looksLikeSpecValue(rawDesc)) {
        blocks.push({ type: 'feature', name, desc, text: `${name}: ${desc}`, raw: rawLine });
        previous = null;
        continue;
      }
    }

    const boldHeading = rawLine.match(/^\*\*(.{2,90}?)\*\*:?\s*$/);
    if (boldHeading && !/[.!?]$/.test(boldHeading[1])) {
      blocks.push({ type: 'heading', level: 3, text: stripMarkdownInline(boldHeading[1]), raw: boldHeading[1] });
      previous = null;
      continue;
    }

    if (previous && previous.type === 'paragraph' && onlyContinuation(previous.raw, rawLine)) {
      previous.raw += ' ' + rawLine;
      previous.text = stripMarkdownInline(previous.raw);
      continue;
    }

    const textValue = stripMarkdownInline(rawLine);
    if (textValue.length >= 2) {
      const block = { type: 'paragraph', text: textValue, raw: rawLine };
      blocks.push(block);
      previous = block;
    }
  }

  return blocks;
}

function onlyContinuation(previousRaw, nextRaw) {
  const prev = String(previousRaw ?? '').trim();
  const next = String(nextRaw ?? '').trim();
  if (!prev || !next) return false;
  if (/[.!?…:;]$/.test(prev)) return false;
  if (/^[A-ZÁÉÍÓÚÑÜ][\wáéíóúñü]+(?:\s|$)/.test(next) && prev.length < 55) return false;
  if (/^[¿¡"“«(\d]/.test(next)) return /[,;–—-]$/.test(prev);
  return /^[a-záéíóúñü]/.test(next) || /[,;–—-]$/.test(prev) || prev.length > 85;
}

/* ============================================================
   Título, descripción, imágenes
   ============================================================ */
/* Palabras que son títulos de sección, nunca el título del post. */
const SEPARATOR_WORDS = new Set([
  'bienvenidos', 'bienvenidas', 'bienvenido', 'bienvenida',
  'informacion', 'informacion general',
  'links de descarga', 'link de descarga', 'descarga', 'descargas',
  'requisitos', 'caracteristicas', 'caracteristicas principales',
  'especificaciones', 'detalles', 'ficha tecnica', 'enlaces',
  'links', 'recursos', 'contenido', 'introduccion', 'presentacion',
  'empezamos', 'comenzamos', 'a continuacion', 'resumen',
  'instalacion', 'como se usa', 'como funciona', 'notas'
]);

function stripSymbols(value) {
  return String(value ?? '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Es una etiqueta de sección? ("👋 Bienvenidos", "i️ Información", "Links de Descarga") */
function isSectionLabel(value) {
  const text = normalizeCompare(stripSymbols(value));
  if (!text || text.length <= 2) return true;
  if (SEPARATOR_WORDS.has(text)) return true;
  const words = text.split(' ');

  // "i️ Información": el emoji ℹ️ suele quedar como una letra suelta adelante.
  if (words.length === 2 && words[0].length <= 1 && SEPARATOR_WORDS.has(words[1])) return true;

  // "⚙️ Requisitos y compatibilidad", "Características principales"
  if (SEPARATOR_WORDS.has(words[0]) && text.length <= 30) return true;

  return false;
}

/** ¿Es un resto de las barras de ventana del propio post? ("X — Vista previa", "Información de X.rtf") */
function isWindowArtifact(value) {
  const text = cleanSpace(value);
  if (!text) return true;
  if (/(?:—|–|-)\s*vista\s*previa\s*$/i.test(text)) return true;
  if (/\.(?:rtf|txt|docx?|pages)$/i.test(text)) return true;
  if (/^(?:informaci[oó]n|ficha|gu[ií]a|resumen|detalles|especificaciones)\s+de\s+.+/i.test(text)) return true;
  return false;
}

function isBadTitle(value) {
  if (badTitle(value) || isSectionLabel(value) || isWindowArtifact(value)) return true;
  // "Duración: 166 minutos" es una fila de la ficha, no un título.
  const specLine = cleanSpace(value).match(/^([^:：]{2,28})\s*[:：]\s*(.+)$/);
  if (specLine) {
    const rawKey = cleanSpace(specLine[1]);
    const plainKey = normalizeCompare(rawKey);
    if (SPEC_KEY_RULES.some(([regex]) => regex.test(rawKey) || (plainKey && regex.test(plainKey)))) return true;
  }
  return false;
}

function badTitle(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length < 2) return true;
  if (/^(just a moment|attention required|access denied|403 forbidden|404 not found|page not found|not found|error|loading|untitled|sin t[ií]tulo|home|inicio)\.?$/i.test(text)) return true;
  if (/cloudflare|verify you are human|captcha|enable javascript/i.test(text)) return true;
  if ((text.match(/https?:\/\//g) || []).length > 1) return true;
  return false;
}

function cleanTitle(value, siteName = '', sourceUrl = '') {
  let title = cleanSpace(decodeEntities(stripMarkdownInline(value)));
  if (!title) return '';
  title = title.replace(/^[\s"'“”«»]+|[\s"'“”«»]+$/g, '');
  title = title.replace(/^(?:home|inicio|portada)\s*[|»›•]\s*/i, '');

  const host = hostOf(sourceUrl);
  const hostToken = host.split('.')[0] || '';
  const siteToken = String(siteName || '').replace(/\.(?:com|net|org|com\.ar|es|io|co|dev|app|me)(?:\.\w+)?$/i, '').trim();
  const siteParts = [siteToken, hostToken].filter(Boolean).map(part => normalizeCompare(part)).filter(Boolean);
  const isSiteSegment = segment => siteParts.some(site => site && normalizeCompare(segment).includes(site));
  const isGenericSegment = segment => /^(official|oficial|website|sitio oficial|home|inicio|youtube|wikipedia|amazon|steam|spotify|netflix|imdb|github|taringa|facebook|instagram)$/i.test(segment.trim());

  const pipeSegments = title.split(/\s*(?:\||•|»|›)\s*/).map(part => part.trim()).filter(Boolean);
  if (pipeSegments.length > 1) {
    const scored = pipeSegments.map((segment, index) => {
      let score = Math.min(segment.length, 80) / 12;
      if (isSiteSegment(segment)) score -= 18;
      if (isGenericSegment(segment)) score -= 30;
      if (segment.length < 4) score -= 8;
      if (index === 0) score += 1.5;
      return { segment, score };
    });
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].segment.length >= 3) title = scored[0].segment;
  }

  const dashMatch = title.match(/^(.{2,120}?)\s+[–—-]\s+(.{2,120})$/);
  if (dashMatch) {
    const left = dashMatch[1].trim();
    const right = dashMatch[2].trim();
    const rightIsSite = isSiteSegment(right) || isGenericSegment(right);
    const leftIsSite = isSiteSegment(left) || isGenericSegment(left);
    if (rightIsSite && !leftIsSite) title = left;
    else if (leftIsSite && !rightIsSite) title = right;
  }

  title = title
    .replace(/\s*[|•»›]\s*$/g, '')
    .replace(/\s*[–—-]\s*(?:official|oficial|sitio oficial|website|home)\s*$/i, '')
    .replace(/\s*\((?:official|oficial)[^)]*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (title.length > 100) title = clipAtBoundary(title, 96, '…');
  return title;
}

function fallbackTitle(sourceUrl) {
  const host = hostOf(sourceUrl);
  if (!host) return 'Nuevo aporte';
  const label = host.split('.')[0].replace(/[-_]+/g, ' ');
  return titleCase(label || 'Nuevo aporte');
}

function pickTitle(meta, blocks, sourceUrl) {
  const candidates = [];
  const push = (value, score) => {
    const cleaned = cleanTitle(value, meta.siteName || '', sourceUrl);
    if (cleaned && !isBadTitle(cleaned)) candidates.push({ value: cleaned, score });
  };

  if (meta.ogTitle) push(meta.ogTitle, 140);
  if (meta.title) push(meta.title, 130);
  if (meta.ld && meta.ld.name) push(meta.ld.name, 135);
  if (meta.h1) push(meta.h1, 120);

  const h1 = blocks.find(block => block.type === 'heading' && block.level === 1);
  if (h1) push(h1.text, 110);

  // En texto pegado a mano, la primera línea corta y sin punto final suele ser el
  // título. Va por encima de los subtítulos posteriores (## Osciladores, ## Filtros…).
  const firstBlock = blocks[0];
  // En un bloque "Nombre: descripción" se usa la línea original, sin el punto
  // que agrega la limpieza, para no descartar un título válido.
  const firstLine = firstBlock && firstBlock.type === 'feature'
    ? (firstBlock.raw || firstBlock.text)
    : (firstBlock ? firstBlock.text : '');
  if (
    firstBlock &&
    firstLine.length >= 3 &&
    firstLine.length <= 100 &&
    !/^https?:\/\//i.test(firstLine) &&
    !/[.!?…:]$/.test(firstLine) &&
    !genericHeading(stripMarkdownInline(firstLine))
  ) {
    push(firstLine, 100);
  }

  // Antes de rendirse con los comodines, se intenta deducir el producto del cuerpo.
  if (!candidates.length) {
    const guessed = guessNameFromBlocks(blocks);
    if (guessed) push(guessed, 80);
  }

  if (!candidates.length) {
    const firstHeading = blocks.find(block => block.type === 'heading' && block.text.length >= 6 && block.text.length <= 100 && !genericHeading(block.text) && !isBadTitle(block.text));
    if (firstHeading) push(firstHeading.text, 75);
  }

  if (!candidates.length) {
    const firstParagraph = blocks.find(block => block.type === 'paragraph'
      && block.text.length >= 6 && block.text.length <= 110
      && !isSpecBullet(block.text));
    if (firstParagraph && !/^https?:/i.test(firstParagraph.text) && !isBadTitle(firstParagraph.text)) {
      push(firstParagraph.text.replace(/[.!?…]+$/, ''), /[.!?…]$/.test(firstParagraph.text) ? 42 : 55);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].value : fallbackTitle(sourceUrl);
}

/**
 * Último recurso para el título: deduce el nombre del producto desde el cuerpo.
 * Reconoce "Te presento soothe2 de oeksound" y nombres con versión (Sylenth1, Serum 2).
 */
function guessNameFromBlocks(blocks) {
  const NOISE = /^(windows|win|macos|mac|osx|linux|android|ios|vst|vst2|vst3|vsti|aax|au|clap|bit|bits|gb|mb|tb|khz|hz|ghz|core|ryzen|intel|amd|apple|silicon|m1|m2|m3|pro|max|ultra|native|universal|demo|trial|full|free|https?)$/i;
  const paragraphs = blocks
    .filter(block => block.type === 'paragraph' && block.text.length > 40)
    .slice(0, 5)
    .map(block => block.text.replace(/\s+/g, ' ').trim());
  if (!paragraphs.length) return '';

  const tidy = value => cleanName(String(value ?? '').replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/g, ''));

  // "Te presento soothe2 de oeksound" → "oeksound soothe2"
  const STOP_WORD = /^(la|el|los|las|un|una|unos|unas|este|esta|estos|estas|nuevo|nueva|nuestro|nuestra|gran|mejor|peor|mismo|misma|toda|todo)$/i;
  const looksLikeName = value => Boolean(value)
    && value.length >= 2 && value.length <= 28
    && !NOISE.test(value)
    && !isSectionLabel(value)
    && !STOP_WORD.test(String(value).split(/\s+/)[0]);

  for (const text of paragraphs) {
    const match = text.match(/\b(?:te traigo|te presento|les traigo|les presento|vamos con|repaso (?:completo )?(?:por|de)|analizamos|probamos|hablamos de)\s+([\p{L}\p{N}][\p{L}\p{N}.+'’-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}.+'’-]*){0,3})/iu);
    if (!match) continue;
    const parts = match[1].split(/\s+de\s+/i).map(tidy).filter(Boolean);
    const validos = parts.filter(looksLikeName);
    if (validos.length >= 2) {
      const juntos = `${validos[1]} ${validos[0]}`;
      if (juntos.length <= 60) return juntos;
    }
    if (validos.length) return validos[0];
  }

  // Nombres con número de versión: "soothe2", "Sylenth1", "Serum 2".
  // Se exige que las letras y el número vayan juntos, o que la palabra empiece
  // en mayúscula, para no confundir "unos 60" con un producto.
  for (const text of paragraphs) {
    const pegados = text.match(/\b[A-Za-z][A-Za-z-]*\d+(?:\.\d+)?\b/g) || [];
    const conEspacio = text.match(/\b[A-Z][a-z]{2,}\s\d{1,2}\b/g) || [];
    for (const raw of [...pegados, ...conEspacio]) {
      const candidate = tidy(raw);
      if (!candidate || candidate.length < 4) continue;
      // "Windows 11" o "macOS 12" son plataformas, no productos.
      const base = candidate.replace(/\s*\d+(?:\.\d+)?$/, '').trim();
      if (NOISE.test(candidate) || NOISE.test(base)) continue;
      if (isSectionLabel(candidate)) continue;
      return candidate;
    }
  }

  return '';
}

function sentenceFromParagraph(paragraph, max = 200) {
  const sentences = splitSentences(paragraph);
  if (!sentences.length) return '';
  let sentence = sentences[0];
  if (sentence.length < 55 && sentences[1]) sentence += ' ' + sentences[1];
  return clipAtBoundary(sentence, max, '…');
}

function pickDescription(meta, blocks, title, sourceUrl, type) {
  const candidates = [];
  const push = (value, score) => {
    const text = cleanSpace(decodeEntities(stripMarkdownInline(value)))
      .replace(/\s*(leer m[aá]s|read more|ver m[aá]s)\s*$/i, '')
      .trim();
    if (!text || text.length < 35) return;
    if (/cookie|privacy policy|all rights reserved|suscrib|newsletter/i.test(text) && text.length < 160) return;
    candidates.push({ value: text, score });
  };

  if (meta.ld && meta.ld.description) push(meta.ld.description, 82);
  if (meta.description) push(meta.description, 80);
  if (meta.ogDescription) push(meta.ogDescription, 88);

  const titleNorm = normalizeCompare(title);
  blocks
    .filter(block => block.type === 'paragraph' && block.text.length >= 55 && !/^https?:/i.test(block.text))
    .slice(0, 10)
    .forEach((block, index) => {
      const sentence = sentenceFromParagraph(block.text, 210);
      if (!sentence) return;
      let score = 78 - index * 2;
      if (normalizeCompare(sentence).includes(titleNorm)) score += 16;
      if (sentence.length >= 80 && sentence.length <= 200) score += 8;
      if (sentence.length < 55) score -= 20;
      if (type === 'movie' && /spoiler|final|muere|termina/i.test(sentence)) score -= 25;
      candidates.push({ value: sentence, score });
    });

  if (!candidates.length) return '';

  candidates.sort((a, b) => b.score - a.score);
  let description = candidates[0].value;
  if (candidates[0].score < 70) description = candidates[0].value;
  description = description.replace(/\s+/g, ' ').trim();
  if (description.length > 185) description = clipAtBoundary(description, 178, '…');
  if (!/[.!?…]$/.test(description) && !description.endsWith('…')) description += '.';
  return description;
}

function imageLooksUnusable(url, alt = '') {
  const value = String(url || '');
  if (!value) return true;
  if (/^data:/i.test(value)) return true;
  if (/\.svg(?:\?|#|$)/i.test(value)) return true;
  if (/\b(doubleclick|google-analytics|googletagmanager|facebook\.com\/tr|pixel|tracking|beacon)\b/i.test(value)) return true;
  const keywords = /(logo|favicon|sprite|icon[-_]|icons?\/|avatar|emoji|badge|placeholder|blank|spacer|1x1|transparent|loading)/i;
  if (keywords.test(value)) return true;
  if (alt && /^(logo|icon|favicon|avatar|sprite|badge|separator)$/i.test(String(alt).trim())) return true;
  return false;
}

function rankImages(meta, text) {
  const map = new Map();
  const add = (url, score, alt = '') => {
    const resolved = resolveUrl(url, meta.baseUrl || '');
    if (!resolved) return;
    if (imageLooksUnusable(resolved, alt)) return;
    const current = map.get(resolved);
    if (!current || score > current.score) map.set(resolved, { url: resolved, score, alt });
    else if (!current.alt && alt) current.alt = alt;
  };

  if (meta.image) add(meta.image, 980);
  if (Array.isArray(meta.images)) {
    meta.images.forEach(image => {
      if (typeof image === 'string') add(image, 700);
      else if (image && image.url) add(image.url, image.score || 600, image.alt || '');
    });
  }

  [...extractMarkdownLinks(text).map(link => link.url), ...extractRawUrls(text)]
    .filter(url => IMAGE_EXT.test(url))
    .forEach(url => add(url, /thumb|small|mini|medium/i.test(url) ? 260 : 420));

  const list = Array.from(map.values()).map(image => {
    let score = image.score;
    if (/(thumb|thumbnail|small|mini|medium|_s\.|_xs\.)/i.test(image.url)) score = Math.min(score, 340);
    if (/\/\d{2,3}x\d{2,3}\//.test(image.url)) score -= 60;
    if (/(large|full|original|hero|cover|featured)/i.test(image.url)) score += 50;
    if (/(screenshot|screen[-_]?shot|captura|preview|product|interface)/i.test(image.url + ' ' + image.alt)) score += 35;
    if (/(blackwhite|black-and-white|monochrome)/i.test(image.url)) score -= 25;
    if (/\.gif(?:\?|#|$)/i.test(image.url)) score -= 25;
    return { ...image, score };
  });

  list.sort((a, b) => b.score - a.score);
  return list.slice(0, 12);
}

/* ============================================================
   Detección de tipo de contenido
   ============================================================ */
function detectType(text, meta) {
  const haystack = [
    text,
    meta.title || '',
    meta.description || '',
    meta.keywords || '',
    meta.ld && meta.ld.type ? meta.ld.type : '',
    meta.ld && meta.ld.category ? meta.ld.category : ''
  ].join(' ').toLowerCase();

  const ldType = String(meta.ld && meta.ld.type || '').toLowerCase();
  const scores = { software: 0, game: 0, movie: 0, music: 0, book: 0, hardware: 0, tutorial: 0, news: 0, generic: 0 };

  if (/softwareapplication|mobileapplication|webapplication|product/.test(ldType)) scores.software += 10;
  if (/videogame/.test(ldType)) scores.game += 14;
  if (/movie|tvseries|episode|creativework/.test(ldType)) scores.movie += 12;
  if (/musicalbum|musicrecording|musicgroup/.test(ldType)) scores.music += 12;
  if (/book|publicationissue/.test(ldType)) scores.book += 12;

  Object.keys(TYPE_HINTS).forEach(type => {
    TYPE_HINTS[type].forEach(([regex, weight]) => {
      if (regex.test(haystack)) scores[type] += weight;
    });
  });

  let best = 'generic';
  let bestScore = 0;
  Object.keys(scores).forEach(type => {
    if (scores[type] > bestScore) {
      bestScore = scores[type];
      best = type;
    }
  });
  if (bestScore < 4) return 'generic';
  if (best === 'movie' && !/\b(pel[ií]cula|serie|temporada|episodio|film)\b/i.test(haystack)) return 'generic';
  return best;
}

/* ============================================================
   Características
   ============================================================ */
function splitFeature(text) {
  let value = stripMarkdownInline(text)
    .replace(/^[\s•▪▸◦‣*–—-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return null;

  value = value.replace(/^(?:[A-Z][a-z]+:\s*)?(?:leer m[aá]s|read more)\.?$/i, '');
  const separator = value.match(/^(.{2,78}?)\s*(?::|–|—|\s-\s|\s\|\s)\s*(.{12,})$/);
  if (separator) {
    const name = cleanName(separator[1]);
    const desc = cleanDescription(separator[2]);
    if (name && !genericHeading(name) && desc && normalizeCompare(name) !== normalizeCompare(desc)) {
      return { name, desc };
    }
  }

  const sentences = splitSentences(value);
  if (sentences.length >= 2) {
    const name = cleanName(sentences[0]);
    const desc = cleanDescription(sentences.slice(1).join(' '));
    if (name && name.length <= 85) {
      if (desc && desc.length >= 20) return { name, desc };
      return { name, desc: cleanDescription(value) };
    }
  }

  if (value.length <= 90) {
    return { name: cleanName(value), desc: '' };
  }

  // Frase larga sin separador: se usa como descripción y se genera un nombre corto.
  const firstClause = value.split(/[,;]\s/)[0];
  if (firstClause.length >= 22 && firstClause.length <= 78) {
    return { name: cleanName(firstClause), desc: cleanDescription(value) };
  }
  return { name: '', desc: cleanDescription(value) };
}

function maybeLocalizePair(name, desc) {
  if (NAME_TRANSLATIONS[normalizeCompare(name)]) return NAME_TRANSLATIONS[normalizeCompare(name)];
  return name;
}

function classifyTag(name, desc, index) {
  const text = `${name} ${desc}`;
  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) return { tag: rule.tag, color: rule.color };
  }
  return { tag: 'DESTACADO', color: TAG_COLOR_ROTATION[index % TAG_COLOR_ROTATION.length] };
}

function diversifyColors(items) {
  const usage = {};
  const colors = COLORS.map(item => item[0]);
  items.forEach(item => {
    usage[item.color] = (usage[item.color] || 0) + 1;
    if (usage[item.color] <= 2) return;
    const alternative = colors.find(color => color !== item.color && (usage[color] || 0) < 2);
    if (alternative) {
      usage[item.color] -= 1;
      item.color = alternative;
      usage[alternative] = (usage[alternative] || 0) + 1;
    }
  });
  return items;
}

function buildHeadingPairGroup(blocks) {
  const items = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== 'heading') continue;
    if (block.level < 2 || block.level > 4) continue;
    if (genericHeading(block.text)) continue;
    if (block.text.length < 3 || block.text.length > 75) continue;

    let nextIndex = i + 1;
    while (nextIndex < blocks.length && blocks[nextIndex].type === 'heading') break;
    const next = blocks[nextIndex];
    if (!next || next.type !== 'paragraph') continue;
    if (next.text.length < 50) continue;
    if (isSpecBullet(next.text)) continue;

    const name = cleanName(block.text);
    if (!name) continue;
    const desc = clipAtBoundary(cleanDescription(next.text), 290, '…');
    if (!desc || desc.length < 35) continue;
    if (items.some(item => similarText(item.name, name) > 0.72)) continue;
    items.push({ name, desc, origin: 'heading' });
  }
  return items;
}

function buildBulletGroups(blocks) {
  const groups = new Map();
  blocks.forEach(block => {
    if (block.type !== 'bullet') return;
    if (!groups.has(block.group)) groups.set(block.group, []);
    groups.get(block.group).push(block.text);
  });

  const result = [];
  groups.forEach(rawItems => {
    const cleaned = rawItems
      .map(item => item.replace(/\s+/g, ' ').trim())
      .filter(item => item.length >= 8)
      .filter(item => !/^https?:\/\//i.test(item));
    if (cleaned.length < 2) return;

    const specRatio = cleaned.filter(isSpecBullet).length / cleaned.length;
    if (specRatio >= 0.6) return;

    const usable = cleaned.filter(item => !isSpecBullet(item));
    if (usable.length < 2) return;

    const withSeparator = usable.filter(item => /(?::|–|—|\s-\s|\s\|\s)/.test(item)).length;
    const avgWords = usable.reduce((sum, item) => sum + wordCount(item), 0) / usable.length;
    let score = 55 + usable.length * 4 + withSeparator * 5;
    if (avgWords < 3.5) score -= 35;
    if (avgWords >= 8) score += 8;
    if (usable.some(item => /\b(descargar|download|comprar|buy|inicio|home|contacto)\b/i.test(item))) score -= 15;

    result.push({ items: usable, score, origin: 'bullets' });
  });

  return result;
}

function extractFeatures(blocks, maxItems) {
  const headingItems = buildHeadingPairGroup(blocks);
  const featureItems = blocks
    .filter(block => block.type === 'feature' && block.name && block.desc)
    .map(block => ({ name: block.name, desc: block.desc, origin: 'feature' }));
  const bulletGroups = buildBulletGroups(blocks).sort((a, b) => b.score - a.score);
  const bestBullets = bulletGroups[0] || null;

  let primary = null;
  let primaryType = '';

  if (headingItems.length >= 3) {
    // Secciones desarrolladas: la mejor fuente posible.
    primary = headingItems;
    primaryType = 'heading';
  } else if (featureItems.length >= 2) {
    // Listas explícitas "Nombre: descripción".
    primary = featureItems;
    primaryType = 'feature';
  } else if (bestBullets && bestBullets.items.length >= 2) {
    primary = bestBullets.items.map(text => ({ ...(splitFeature(text) || {}), origin: 'bullets' })).filter(item => item.name || item.desc);
    primaryType = 'bullets';
    if (headingItems.length && headingItems.length > primary.length) {
      primary = headingItems;
      primaryType = 'heading';
    }
  } else if (featureItems.length) {
    primary = featureItems;
    primaryType = 'feature';
  } else if (headingItems.length) {
    primary = headingItems;
    primaryType = 'heading';
  }

  if (!primary || !primary.length) return [];

  const items = [];
  const pushItem = (candidate) => {
    const name = cleanName(candidate.name || '');
    let desc = cleanDescription(candidate.desc || '');
    if (!name && !desc) return;
    if (desc && normalizeCompare(desc) === normalizeCompare(name)) desc = '';
    if (name && /^(leer m[aá]s|read more|ver m[aá]s|descargar|download|comprar|ir a|volver)$/i.test(name)) return;
    if (name && items.some(item => similarText(item.name, name) > 0.75)) return;
    if (!name && items.some(item => similarText(item.desc, desc) > 0.8)) return;
    const tagInfo = classifyTag(name, desc, items.length);
    items.push({ tag: tagInfo.tag, color: tagInfo.color, name, desc });
  };

  primary.forEach(candidate => {
    if (items.length >= maxItems) return;
    pushItem(candidate);
  });

  // Si el grupo principal fue corto, se completa con otras fuentes.
  if (items.length < maxItems && primaryType !== 'bullets' && bestBullets) {
    for (const raw of bestBullets.items) {
      if (items.length >= maxItems) break;
      const parsed = splitFeature(raw);
      if (!parsed) continue;
      if (!parsed.name && !parsed.desc) continue;
      if (items.some(item => similarText(item.name, parsed.name) > 0.6)) continue;
      pushItem(parsed);
    }
  }

  if (items.length < maxItems && primaryType !== 'feature') {
    for (const candidate of featureItems) {
      if (items.length >= maxItems) break;
      if (items.some(item => similarText(item.name, candidate.name) > 0.7)) continue;
      pushItem(candidate);
    }
  }

  if (items.length < 2 && headingItems.length) {
    headingItems.forEach(candidate => {
      if (items.length >= maxItems) return;
      if (items.some(item => similarText(item.name, candidate.name) > 0.7)) return;
      pushItem(candidate);
    });
  }

  return diversifyColors(items).slice(0, maxItems);
}

/* ============================================================
   Ficha técnica
   ============================================================ */
function normalizeSpecKey(key) {
  const cleaned = cleanSpace(String(key ?? '')).replace(/:+$/, '').replace(/\s*[–—-]\s*$/, '').trim();
  if (!cleaned) return '';
  const plain = normalizeCompare(cleaned);
  for (const [regex, normalized] of SPEC_KEY_RULES) {
    if (regex.test(cleaned) || (plain && regex.test(plain))) return normalized;
  }
  const normalized = normalizeCompare(cleaned);
  if (!normalized || DENY_SPEC_KEYS.has(normalized)) return '';
  if (cleaned.length > 28) return '';
  if (wordCount(cleaned) > 4) return '';
  if (/[.!?]$/.test(cleaned)) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function cleanSpecValue(value) {
  let text = cleanSpace(stripMarkdownInline(value))
    .replace(/\s*(leer m[aá]s|read more|ver m[aá]s|comprar|buy now)\s*$/i, '')
    .replace(/\s*[|•»]\s*$/g, '')
    .trim();
  if (text.length > 180) text = clipAtBoundary(text, 170, '…');
  return text;
}

function formatDuration(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const iso = raw.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso && (iso[1] || iso[2] || iso[3])) {
    const days = Number(iso[1] || 0);
    const hours = Number(iso[2] || 0) + days * 24;
    const minutes = Number(iso[3] || 0);
    return [hours ? `${hours} h` : '', minutes ? `${minutes} min` : ''].filter(Boolean).join(' ');
  }
  if (/^\d+$/.test(raw)) return `${Math.floor(Number(raw) / 60)} h ${Number(raw) % 60} min`.replace('0 h ', '');
  return raw;
}

function formatLanguage(value) {
  const code = String(value ?? '').trim().toLowerCase();
  const map = {
    es: 'Español', 'es-ar': 'Español', 'es-es': 'Español', en: 'Inglés', 'en-us': 'Inglés', 'en-gb': 'Inglés',
    pt: 'Portugués', 'pt-br': 'Portugués', fr: 'Francés', de: 'Alemán', it: 'Italiano', ja: 'Japonés', ko: 'Coreano', zh: 'Chino', ru: 'Ruso'
  };
  if (map[code]) return map[code];
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(code)) return code.toUpperCase();
  return String(value ?? '').trim();
}

function formatPrice(price, currency) {
  if (price == null || price === '') return '';
  const number = Number(String(price).replace(',', '.'));
  if (!Number.isFinite(number)) return '';
  if (number === 0) return 'Gratis';
  const symbols = { USD: 'US$', ARS: 'AR$', EUR: '€', GBP: '£', BRL: 'R$', MXN: 'MX$', CLP: 'CLP$', COP: 'COP$' };
  const symbol = symbols[String(currency || '').toUpperCase()] || (currency ? String(currency).toUpperCase() + ' ' : '');
  return `${symbol}${number.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`.trim();
}

function extractSpecs({ text, blocks, meta, sourceUrl, type, maxSpecs }) {
  const specs = [];
  const seen = new Set();
  const ld = meta.ld || {};

  const add = (key, value, priority = 1) => {
    const normalizedKey = normalizeSpecKey(key);
    let normalizedValue = cleanSpecValue(value);
    if (!normalizedKey || !normalizedValue) return;
    if (normalizedValue.length < 2) return;
    if (normalizedKey === 'Sitio web' && !/https?:\/\//i.test(normalizedValue)) normalizedValue = sourceUrl || normalizedValue;
    const same = specs.find(spec => spec.k === normalizedKey);
    if (same) {
      if (priority > same.priority || (priority === same.priority && normalizedValue.length > same.v.length)) {
        same.v = normalizedValue;
        same.priority = priority;
      }
      return;
    }
    specs.push({ k: normalizedKey, v: normalizedValue, priority });
    seen.add(normalizedKey);
  };

  // 1) JSON-LD (muy confiable)
  if (ld.operatingSystem) add('Plataformas', ld.operatingSystem, 5);
  if (ld.applicationCategory || ld.category) add('Género', ld.applicationCategory || ld.category, 5);
  if (ld.softwareVersion) add('Versión', ld.softwareVersion, 5);
  if (ld.fileFormat) add('Formatos', ld.fileFormat, 5);
  if (ld.price) add('Precio', formatPrice(ld.price, ld.priceCurrency), 5);
  if (ld.rating) add('Puntuación', `${ld.rating}${ld.ratingCount ? ` (${formatNumber(ld.ratingCount)} votos)` : ''}`, 4);
  if (ld.datePublished) add(type === 'news' ? 'Publicado' : 'Lanzamiento', formatDate(ld.datePublished), 4);
  const authorKey = type === 'news' || type === 'book' ? 'Autor' : type === 'music' ? 'Artista' : type === 'movie' ? 'Dirección' : 'Desarrollador';
  if (ld.publisher || ld.author) add(authorKey, ld.publisher || ld.author, 4);
  if (ld.language) add('Idioma', formatLanguage(ld.language), 3);
  if (ld.duration) add('Duración', formatDuration(ld.duration), 3);
  if (ld.players) add('Jugadores', ld.players, 3);
  if (ld.contentRating) add('Clasificación', ld.contentRating, 3);

  // 2) Líneas explícitas "Clave: valor"
  const lines = [];
  blocks.forEach(block => {
    if (block.type === 'paragraph' || block.type === 'bullet') lines.push(block.text);
  });
  lines.slice(0, 120).forEach(line => {
    if (line.length > 220) return;
    const match = line.match(/^([^:：]{2,32})\s*[:：]\s*(.{2,180})$/);
    if (match) {
      const rawKey = cleanSpace(match[1]);
      const key = normalizeSpecKey(rawKey);
      const known = SPEC_KEY_RULES.some(([regex]) => regex.test(rawKey));
      const value = cleanSpecValue(match[2]);
      if (key && !DENY_SPEC_KEYS.has(normalizeCompare(rawKey)) && (known || value.length <= 45)) {
        add(key, match[2], 3);
      }
      return;
    }
    if (isSpecBullet(line)) {
      const pair = line.match(/^([^–—]{2,32})\s*[–—]\s*(.{2,140})$/);
      if (pair) add(normalizeSpecKey(pair[1]), pair[2], 3);
    }
  });

  // 3) Metadatos
  if (meta.author && !specs.some(spec => spec.k === authorKey)) add(authorKey, meta.author, 2);
  if (meta.published && !specs.some(spec => /Lanzamiento|Publicado/.test(spec.k))) {
    add(type === 'news' ? 'Publicado' : 'Lanzamiento', formatDate(meta.published), 2);
  }

  // 4) Detección inline
  const platformMap = [
    ['Windows', /\bWindows(?:\s*(?:7|8|10|11|Vista|XP))?\b/i],
    ['macOS', /\b(mac\s?os(?:\s?x)?|macOS|OS X)\b/i],
    ['Linux', /\b(Linux|Ubuntu|Debian|Fedora)\b/i],
    ['Android', /\bAndroid\b/i],
    ['iOS', /\b(iOS|iPadOS)\b/i],
    ['Steam Deck', /\bSteam\s?Deck|SteamOS\b/i],
    ['PlayStation 5', /\b(PS5|PlayStation\s?5)\b/i],
    ['PlayStation 4', /\b(PS4|PlayStation\s?4)\b/i],
    ['Xbox Series X|S', /\bXbox\s?Series\b/i],
    ['Xbox One', /\bXbox\s?One\b/i],
    ['Nintendo Switch', /\bNintendo\s?Switch\b/i]
  ];
  if (!specs.some(spec => spec.k === 'Plataformas')) {
    const platforms = platformMap.filter(([, regex]) => regex.test(text)).map(([name]) => name);
    if (platforms.length) add('Plataformas', platforms.join(' · '), 2);
  }

  if (!specs.some(spec => spec.k === 'Formatos')) {
    const formats = [];
    const formatMap = [
      ['VST3', /\bVST3\b/i], ['VST', /\b(VSTi|VST2|VST)\b/i], ['AU', /\b(Audio Units?|AU)\b/i], ['AAX', /\bAAX\b/i],
      ['CLAP', /\bCLAP\b/i], ['APK', /\.apk\b/i], ['DMG', /\.dmg\b/i], ['EXE', /\.exe\b/i], ['PDF', /\.pdf\b/i],
      ['EPUB', /\.epub\b/i], ['FLAC', /\.flac\b/i], ['WAV', /\.wav\b/i], ['MP3', /\.mp3\b/i], ['MP4', /\.mp4\b/i],
      ['ISO', /\.iso\b/i]
    ];
    formatMap.forEach(([label, regex]) => { if (regex.test(text)) formats.push(label); });
    if (formats.length) add('Formatos', [...new Set(formats)].join(', '), 2);
  }

  if (!specs.some(spec => ['Requisitos', 'Hardware', 'Procesador', 'Memoria', 'Almacenamiento'].includes(spec.k))) {
    const requirements = [];
    const cpu = text.match(/\b(?:CPU|procesador|processor)[^.\n]{0,20}?((?:Intel(?:\s+Core)?\s+i[3579]|AMD\s+Ryzen\s+\d(?:\s+\w+)?|Apple\s+M[1-4](?:\s+(?:Pro|Max|Ultra))?|SSE[2-4]?))[^.\n]{0,10}/i)
      || text.match(/\b((?:Intel(?:\s+Core)?\s+i[3579]|AMD\s+Ryzen\s+\d(?:\s+\w+)?|Apple\s+M[1-4](?:\s+(?:Pro|Max|Ultra))?))\b/i);
    if (cpu && cpu[1]) requirements.push(cpu[1].trim());
    const ram = text.match(/\b(\d{1,3}\s*(?:GB|MB))\s*(?:de\s*)?(?:RAM|memoria)/i)
      || text.match(/\b(?:RAM|memoria)[^.\n]{0,20}?(\d{1,3}\s*(?:GB|MB))/i);
    if (ram) requirements.push(`${ram[1].trim()} de RAM`);
    const storage = text.match(/\b(\d+(?:[.,]\d+)?\s*(?:GB|MB|TB))\s*(?:de\s*)?(?:espacio|disco|almacenamiento)/i)
      || text.match(/\b(?:espacio|disco|almacenamiento)[^.\n]{0,20}?(\d+(?:[.,]\d+)?\s*(?:GB|MB|TB))/i);
    if (storage) requirements.push(`${storage[1].trim()} de espacio`);
    const gpu = text.match(/\b((?:NVIDIA|AMD Radeon|GeForce)\s+(?:GTX|RTX|RX|Radeon)?\s*[A-Z]?\d{2,4}(?:\s+\w+)?)/i);
    if (gpu && gpu[1]) requirements.push(gpu[1].trim());
    if (requirements.length) add('Requisitos', requirements.join(' · '), 2);
  }

  if (!specs.some(spec => spec.k === 'Precio')) {
    const price = text.match(/\b(?:precio|price|desde|cuesta|starting at)[^.\n]{0,24}?((?:USD|ARS|EUR|US\$|AR\$|\$|€)\s?\d[\d.,]*)/i);
    if (price) add('Precio', price[1].replace(/\s+/g, ' '), 2);
    else if (/\b(prueba gratuita|versi[oó]n demo|free trial|versi[oó]n de prueba)\b/i.test(text)) add('Precio', 'Prueba gratis', 1);
    else if (/\b(gratis|gratuito|freeware|c[oó]digo abierto|open source)\b/i.test(text) && (type === 'software' || type === 'generic')) add('Precio', 'Gratis', 1);
  }

  if (!specs.some(spec => spec.k === 'Tamaño')) {
    const size = text.match(/\b(?:tama[ñn]o|peso|size|descarga|instalaci[oó]n)[^.\n]{0,30}?(\d+(?:[.,]\d+)?\s*(?:MB|GB|TB))/i)
      || text.match(/\b(\d+(?:[.,]\d+)?\s*(?:MB|GB|TB))\s*(?:de\s*)?(?:espacio|instalaci[oó]n|descarga)/i);
    if (size) add('Tamaño', size[1].replace(/\s+/g, ' '), 2);
  }

  const ordered = specs
    .filter(spec => spec.v)
    .sort((a, b) => {
      const indexA = SPEC_ORDER.indexOf(a.k);
      const indexB = SPEC_ORDER.indexOf(b.k);
      const orderA = indexA === -1 ? 99 : indexA;
      const orderB = indexB === -1 ? 99 : indexB;
      if (orderA !== orderB) return orderA - orderB;
      return b.priority - a.priority;
    })
    .slice(0, maxSpecs)
    .map(spec => ({ k: spec.k, v: spec.v }));

  return ordered;
}

/* ============================================================
   Enlaces
   ============================================================ */
const LINK_LABEL_TRANSLATIONS = {
  download: 'Descargar', downloads: 'Descargas', buy: 'Comprar', purchase: 'Comprar',
  specifications: 'Especificaciones', specs: 'Especificaciones', features: 'Características',
  documentation: 'Documentación', support: 'Soporte', 'learn more': 'Más información',
  'more information': 'Más información', 'official website': 'Sitio oficial', store: 'Tienda'
};

function cleanLinkLabel(value) {
  const direct = LINK_LABEL_TRANSLATIONS[normalizeCompare(value)];
  if (direct) return direct;
  return cleanSpace(stripMarkdownInline(value))
    .replace(/\b(haz clic aqu[ií]|click here|hac[eé] clic|tap here|link|enlace)\b/gi, '')
    .replace(/^[-–—:•\s]+|[-–—:•\s]+$/g, '')
    .trim();
}

function linkKind(url, anchorText, sourceUrl) {
  const value = String(url || '');
  const text = String(anchorText || '');
  const host = hostOf(value);
  const combined = `${value} ${text}`;

  if (!safeHttpUrl(value)) return null;
  if (IMAGE_EXT.test(value)) return null;
  if (SOCIAL_HOSTS.some(social => host === social || host.endsWith('.' + social))) return null;
  if (BAD_LINK_PATTERNS.test(value) || BAD_LINK_PATTERNS.test(text)) return null;
  if (value.length > 500) return null;

  if (FILE_EXT.test(value)) return { kind: 'file', score: 125 };
  if (DOWNLOAD_HINT.test(combined)) return { kind: 'download', score: 110 };
  if (sameUrl(value, sourceUrl)) return { kind: 'source', score: 70 };
  if (DOCS_HINT.test(combined)) return { kind: 'docs', score: 55 };
  if (VIDEO_HINT.test(combined)) return { kind: 'video', score: 45 };
  const store = STORE_HOSTS.find(([, regex]) => regex.test(host));
  if (store) return { kind: 'store', score: 100, store: store[0] };
  if (host === hostOf(sourceUrl)) return { kind: 'official', score: 40 };
  return { kind: 'other', score: 20 };
}

function makeLinkLabel(entry, kind, sourceUrl) {
  const host = hostOf(entry.url);
  const domain = host.replace(/^www\./, '');
  const raw = cleanLinkLabel(entry.text);
  const generic = !raw || /^(aqu[ií]|ac[aá]|ver|ver m[aá]s|m[aá]s info|m[aá]s informaci[oó]n|leer m[aá]s|read more|download|descargar|click|web|site|p[aá]gina)$/i.test(raw);
  const fileMatch = entry.url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  const ext = fileMatch ? fileMatch[1].toUpperCase() : '';

  if (kind === 'file') {
    if (ext) return `Descargar ${ext} (${domain})`;
    return `Descargar desde ${domain}`;
  }
  if (kind === 'download') {
    if (raw && raw.length >= 4 && raw.length <= 48) return raw;
    if (/win|windows/i.test(entry.url)) return `Descargar para Windows · ${domain}`;
    if (/mac|osx/i.test(entry.url)) return `Descargar para macOS · ${domain}`;
    return `Descargar desde ${domain}`;
  }
  if (kind === 'store') return entry.store === 'Steam' ? 'Ver en Steam' : `Ver en ${entry.store}`;
  if (kind === 'docs') return raw && !generic ? clipAtBoundary(raw, 46, '…') : `Documentación · ${domain}`;
  if (kind === 'video') {
    if (raw && !generic && raw.length < 46) return clipAtBoundary(raw, 46, '…');
    return host.includes('youtube') ? 'Ver video en YouTube' : 'Ver video';
  }
  if (kind === 'source') {
    if (sameUrl(entry.url, sourceUrl)) return `Sitio oficial · ${domain}`;
    return raw && !generic ? clipAtBoundary(raw, 52, '…') : `Más info · ${domain}`;
  }
  if (kind === 'official' || kind === 'other') {
    if (raw && !generic && raw.length >= 4 && raw.length <= 52) return clipAtBoundary(raw, 52, '…');
    return `Ver en ${domain}`;
  }
  return raw || `Ver en ${domain}`;
}

function extractLinks({ text, meta, sourceUrl, type, maxButtons }) {
  const collected = [];
  const add = (url, textValue, bonus = 0) => {
    const resolved = resolveUrl(url, sourceUrl || '');
    if (!resolved) return;

    // Los enlaces con portal intermedio se guardan ya en su forma de descarga
    // directa, así el botón baja el archivo de una.
    const direct = toDirectDownload(resolved);
    const target = direct.changed ? direct.url : resolved;
    const info = linkKind(target, textValue, sourceUrl);
    if (!info) return;

    const kind = direct.changed && info.kind !== 'file' ? 'download' : info.kind;
    const score = direct.changed ? Math.max(info.score, 118) : info.score;

    const existing = collected.find(item => sameUrl(item.url, target));
    if (existing) {
      if (!existing.text && textValue) existing.text = textValue;
      existing.score = Math.max(existing.score, score + bonus);
      return;
    }
    collected.push({
      url: target,
      text: cleanLinkLabel(textValue),
      kind,
      score: score + bonus,
      store: info.store || '',
      direct: direct.changed,
      service: direct.service
    });
  };

  if (Array.isArray(meta.anchors)) {
    meta.anchors.forEach(anchor => add(anchor.url, anchor.text, 4));
  }
  extractMarkdownLinks(text).forEach(link => add(link.url, link.text, 2));
  extractRawUrls(text).forEach(url => add(url, '', 0));

  if (sourceUrl) {
    const sourceDirect = toDirectDownload(sourceUrl);
    const origin = sourceDirect.changed ? sourceDirect.url : sourceUrl;
    if (!collected.some(item => sameUrl(item.url, origin))) {
      const sourceInfo = linkKind(origin, '', sourceUrl) || { kind: 'source', score: 70 };
      collected.push({
        url: origin,
        text: '',
        kind: sourceDirect.changed ? 'download' : 'source',
        score: (sourceDirect.changed ? Math.max(sourceInfo.score, 118) : sourceInfo.score) + 20,
        store: '',
        direct: sourceDirect.changed,
        service: sourceDirect.service
      });
    } else {
      const existing = collected.find(item => sameUrl(item.url, sourceUrl));
      existing.score += 20;
      if (existing.kind === 'file' || existing.kind === 'download') existing.kind = existing.kind;
    }
  }

  collected.sort((a, b) => b.score - a.score);

  const chosen = [];
  const seenHosts = new Set();
  for (const entry of collected) {
    if (chosen.length >= maxButtons) break;
    if (chosen.some(item => sameUrl(item.url, entry.url))) continue;
    const host = hostOf(entry.url);
    if ((entry.kind === 'video' || entry.kind === 'other') && seenHosts.has(host)) continue;
    if (seenHosts.has(host) && chosen.filter(item => hostOf(item.url) === host).length >= 1 && entry.kind !== 'download' && entry.kind !== 'source') continue;
    seenHosts.add(host);
    chosen.push(entry);
  }

  if (!chosen.length) return [];

  // La descarga va primero; si no hay descarga, el sitio oficial.
  const hasDownload = chosen.some(item => item.kind === 'download' || item.kind === 'file');
  chosen.sort((a, b) => {
    const rank = entry => {
      if (entry.kind === 'file' || entry.kind === 'download') return 0;
      if (entry.kind === 'source') return 1;
      if (entry.kind === 'store') return 2;
      if (entry.kind === 'docs') return 3;
      if (entry.kind === 'video') return 4;
      return 5;
    };
    return rank(a) - rank(b);
  });

  const buttons = chosen.map((entry, index) => ({
    label: makeLinkLabel(entry, entry.kind, sourceUrl),
    url: entry.url,
    style: index === 0 ? 'primary' : 'secondary'
  }));

  if (!hasDownload) {
    const sourceIndex = buttons.findIndex(button => sameUrl(button.url, sourceUrl));
    if (sourceIndex > 0) {
      buttons.forEach(button => { button.style = 'secondary'; });
      buttons[sourceIndex].style = 'primary';
    }
  }

  // Evitar etiquetas repetidas.
  const labels = new Set();
  buttons.forEach(button => {
    let label = button.label || 'Ver más';
    let suffix = 2;
    while (labels.has(label.toLowerCase())) {
      label = `${button.label} (${suffix})`;
      suffix += 1;
    }
    labels.add(label.toLowerCase());
    button.label = clipAtBoundary(label, 58, '…');
  });

  return buttons;
}

/* ============================================================
   Párrafos y copy
   ============================================================ */
function pickParagraphs(blocks, title, type, maxParagraphs, priorityText = '') {
  const titleNorm = normalizeCompare(title);
  // Lo que pegaste a mano tiene ventaja: es tu aporte, no el de la página.
  const priorityNorm = priorityText ? normalizeCompare(priorityText) : '';
  const scored = [];

  blocks.forEach((block, index) => {
    if (block.type !== 'paragraph') return;
    let text = block.text.replace(/\s+/g, ' ').trim();
    if (text.length < 60) return;
    if (titleNorm && normalizeCompare(text) === titleNorm) return;
    if (titleNorm.length > 8 && normalizeCompare(text).startsWith(titleNorm) && text.length < 150) return;
    if (text.length > 1200) text = clipAtBoundary(text, 950, '…');
    if (/^(https?:\/\/|www\.)/i.test(text)) return;
    if ((text.match(/https?:\/\//g) || []).length > 1) return;
    if (/^(suscr|newsletter|descarg|comprar|acept|pol[ií]tica de cookies)/i.test(text)) return;
    if (/(cookie|all rights reserved|todos los derechos|aviso legal|privacy policy)/i.test(text) && text.length < 200) return;
    if (isSpecBullet(text)) return;

    const sentences = splitSentences(text);
    if (!sentences.length) return;

    let score = 10;
    score += Math.min(text.length, 400) / 40;
    score += Math.min(sentences.length, 4) * 4;
    if (normalizeCompare(text).includes(titleNorm)) score += 20;
    if (/\b(\d+%|\d{2,4}\s*(?:GB|MB|Hz|bits?|voces?|presets?)|precio|gratis|gratuito)\b/i.test(text)) score += 5;
    if (index < 3) score += 6;
    if (priorityNorm) {
      const key = normalizeCompare(text).slice(0, 120);
      if (key.length > 30 && priorityNorm.includes(key)) score += 50;
    }
    if (text.length < 100) score -= 8;
    if (type === 'movie' && /spoiler|final alternativo|muere|termina/i.test(text)) score -= 16;
    scored.push({ text, score, index });
  });

  scored.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const candidate of scored) {
    if (chosen.length >= maxParagraphs) break;
    if (chosen.some(item => similarText(item.text, candidate.text) > 0.55)) continue;
    const candidateSentences = splitSentences(candidate.text);
    let paragraph = candidateSentences.slice(0, 4).join(' ');
    if (!/[.!?…]$/.test(paragraph)) paragraph = paragraph.replace(/[\s,;:]+$/, '') + '…';
    if (paragraph.length > 720) paragraph = clipAtBoundary(paragraph, 700, '…');
    chosen.push({ text: paragraph, index: candidate.index });
  }

  chosen.sort((a, b) => a.index - b.index);
  return chosen.map(item => item.text);
}

function occurrencesOutsideMarkers(text, needle) {
  const ranges = [];
  const markerRegex = /\[\[[^\]]+\]\]|\*\*[^*]+\*\*/g;
  let marker;
  while ((marker = markerRegex.exec(text))) ranges.push([marker.index, marker.index + marker[0].length]);
  const positions = [];
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  let from = 0;
  while (positions.length < 4) {
    const at = haystack.indexOf(target, from);
    if (at === -1) break;
    if (!ranges.some(([start, end]) => at >= start && at < end)) positions.push(at);
    from = at + target.length;
  }
  return positions;
}

function emphasizeParagraph(text, title, itemNames) {
  let result = String(text || '').replace(/\s+/g, ' ').trim();
  if (!result) return '';

  if (title) {
    const positions = occurrencesOutsideMarkers(result, title);
    if (positions.length) {
      const at = positions[0];
      result = result.slice(0, at) + `[[${result.slice(at, at + title.length)}]]` + result.slice(at + title.length);
    }
  }

  const names = [...new Set(itemNames)]
    .filter(name => name && name.length >= 4 && name.length <= 48)
    .filter(name => !title || !normalizeCompare(title).includes(normalizeCompare(name)))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);

  for (const name of names) {
    const positions = occurrencesOutsideMarkers(result, name);
    if (!positions.length) continue;
    const at = positions[0];
    result = result.slice(0, at) + `**${result.slice(at, at + name.length)}**` + result.slice(at + name.length);
  }

  return balanceMarkers(result);
}

function question(text, noOpen) {
  const clean = String(text ?? '').replace(/^[¿]+/, '').replace(/\?+$/, '') + '?';
  return noOpen ? clean : '¿' + clean;
}

function copyForType(type) {
  return TYPE_COPY[type] || TYPE_COPY.generic;
}

function composeParagraphs({ chosen, title, description, type, tone, itemNames, seed, maxParagraphs }) {
  const paragraphs = [];
  const titleNorm = normalizeCompare(title);
  let pool = chosen.slice();
  let first = pool[0] || '';
  let usedFallback = false;

  // Evita que el subtítulo y el primer párrafo sean exactamente lo mismo.
  if (first && description && normalizeCompare(first) === normalizeCompare(description) && pool.length > 1) {
    pool = pool.slice(1);
    first = pool[0] || '';
  }

  if (!first) {
    usedFallback = true;
    first = description || 'Reúne la información esencial, las características y los enlaces oficiales en un solo lugar.';
  }

  if (!normalizeCompare(first).includes(titleNorm)) {
    const lead = pickSeeded(PARAGRAPH_LEADS[tone] || PARAGRAPH_LEADS.taringa, seed + ':lead').replace('{title}', title);
    first = `${lead} ${first}`;
  }

  first = emphasizeParagraph(first, title, itemNames);
  paragraphs.push(first);

  if (maxParagraphs > 1) {
    if (pool[1]) paragraphs.push(emphasizeParagraph(pool[1], '', itemNames));
    else if (!usedFallback) paragraphs.push(pickSeeded(CTA_PARAGRAPHS[tone] || CTA_PARAGRAPHS.taringa, seed + ':cta'));
  }

  if (maxParagraphs > 2 && pool[2]) {
    paragraphs.push(emphasizeParagraph(pool[2], '', itemNames));
  }

  const seen = new Set();
  const unique = paragraphs
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(paragraph => {
      if (!paragraph) return false;
      const key = normalizeCompare(paragraph).slice(0, 120);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return unique.join('\n\n');
}

function composePost(data) {
  const {
    title, description, type, tone, noOpen, seed, sourceUrl, siteName, provider,
    items, specs, buttons, paragraphs, images
  } = data;

  const copy = copyForType(type);
  const shortTitle = clipAtBoundary(title, 52, '');
  const isPro = tone === 'pro';
  const infoLabel = INFO_WINDOW_LABELS[type] || INFO_WINDOW_LABELS.generic;

  const greetTemplate = pickSeeded(GREETINGS[tone] || GREETINGS.taringa, seed + ':greet');
  const greet = greetTemplate.replace('{title}', title);

  const listTitle = isPro
    ? (type === 'software' ? 'Funcionalidades principales' : type === 'game' ? 'Características del juego' : copy.list[2] || copy.list[0])
    : pickSeeded(copy.list, seed + ':list');

  let specTitle = isPro
    ? (type === 'game' ? 'Especificaciones técnicas' : copy.specs[1] || copy.specs[0])
    : pickSeeded(copy.specs, seed + ':spec');

  // Si la ventana ya dice "Ficha técnica", el bloque de dentro usa otra variante.
  if (normalizeCompare(specTitle) === normalizeCompare(infoLabel)) {
    const alternativa = copy.specs.find(opcion => normalizeCompare(opcion) !== normalizeCompare(infoLabel));
    if (alternativa) specTitle = alternativa;
  }

  const highlightTitleBase = pickSeeded(copy.highlight, seed + ':hl');
  const hlTitle = question(highlightTitleBase, noOpen);

  // El destacado se arma solo con lo que aporta: nombres con sustancia y datos clave.
  const nombreUtil = item => Boolean(item.name)
    && item.name.length >= 4
    && !NON_FEATURE_NAMES.test(item.name)
    && !isSectionLabel(item.name);
  const destacados = items.filter(nombreUtil);
  const datosClave = specs.filter(spec => ['Formatos', 'Plataformas', 'Precio', 'Versión', 'Desarrollador'].includes(spec.k));
  const lead = pickSeeded(HIGHLIGHT_LEADS[tone] || HIGHLIGHT_LEADS.taringa, seed + ':hltext');

  let hlText = '';
  if (destacados.length) {
    const names = destacados.slice(0, 3).map(item => `**${item.name}**`);
    hlText = `${lead} ${joinNatural(names)}.`;
  } else if (datosClave.length) {
    hlText = `${lead} ${datosClave.slice(0, 3).map(spec => `**${spec.k}:** ${spec.v}`).join(' · ')}.`;
  } else if (items.length) {
    const names = items.slice(0, 2).map(item => `**${item.name || item.tag}**`);
    hlText = `${lead} ${joinNatural(names)}.`;
  } else if (specs.length) {
    hlText = `${lead} ${specs.slice(0, 2).map(spec => `**${spec.k}:** ${spec.v}`).join(' · ')}.`;
  } else if (description) {
    hlText = `**${title}**: ${description}`;
  } else {
    hlText = `Todo lo esencial de **${title}** en un solo lugar.`;
  }

  // Un dato más, si todavía entra sin que el destacado se haga eterno.
  const datoExtra = datosClave.find(spec => !hlText.includes(`**${spec.k}:**`));
  if (datoExtra && hlText.length < 150) hlText += ` También: **${datoExtra.k}:** ${datoExtra.v}.`;
  hlText = balanceMarkers(clipAtBoundary(hlText.replace(/\s+/g, ' ').trim(), 225, '…'));

  const hasDownload = buttons.some(button => /descargar|download|demo|trial|prueba/i.test(button.label) || FILE_EXT.test(button.url));
  const linksTitleBase = hasDownload ? pickSeeded(copy.cta, seed + ':cta-title') : (isPro ? 'Enlaces y fuente oficial' : 'Sitio oficial y más info');
  const linksText = pickSeeded(copy.ctaText, seed + ':cta-text');

  const infoTitle = shortTitle ? `${infoLabel} — ${shortTitle}` : infoLabel;
  const heroWin = `${clipAtBoundary(title, 66, '…')} — Vista previa`;

  const paras = composeParagraphs({
    chosen: paragraphs,
    title,
    description,
    type,
    tone,
    noOpen,
    itemNames: items.map(item => item.name).filter(Boolean),
    seed,
    maxParagraphs: data.maxParagraphs
  });

  return {
    hero: {
      win: heroWin,
      img: images[0] || '',
      title,
      sub: description || `Resumen, características y enlaces de ${title}.`
    },
    info: {
      win: infoTitle,
      greet,
      paras,
      hlTitle,
      hlText,
      listTitle,
      items,
      specTitle,
      specs
    },
    links: {
      title: linksTitleBase,
      text: linksText,
      hide: true,
      btns: buttons
    },
    source: {
      url: sourceUrl || '',
      siteName: siteName || hostOf(sourceUrl),
      type,
      provider,
      images: images.slice(0, 12),
      fetchedAt: Date.now()
    }
  };
}

/* ============================================================
   Normalización final
   ============================================================ */
function sanitizeField(value, noOpen) {
  const text = noOpen ? stripOpen(String(value ?? '')) : String(value ?? '');
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, match => (match.includes('\n') ? '\n' : ' '))
    .trim();
}

function finalizePost(post, noOpen) {
  const result = clone(post);
  result.hero.title = sanitizeField(result.hero.title, noOpen);
  result.hero.sub = sanitizeField(result.hero.sub, noOpen);
  result.hero.win = sanitizeField(result.hero.win, noOpen);
  result.info.win = sanitizeField(result.info.win, noOpen);
  result.info.greet = sanitizeField(result.info.greet, noOpen);
  result.info.hlTitle = sanitizeField(result.info.hlTitle, noOpen);
  result.info.hlText = sanitizeField(balanceMarkers(result.info.hlText), noOpen);
  result.info.listTitle = sanitizeField(result.info.listTitle, noOpen);
  result.info.specTitle = sanitizeField(result.info.specTitle, noOpen);
  result.info.paras = (noOpen ? stripOpen(result.info.paras) : result.info.paras)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  result.info.items = result.info.items.map(item => ({
    ...item,
    tag: sanitizeField(item.tag, noOpen).slice(0, 18),
    name: sanitizeField(item.name, noOpen),
    desc: sanitizeField(item.desc, noOpen)
  }));
  result.info.specs = result.info.specs.map(spec => ({
    k: sanitizeField(spec.k, noOpen),
    v: sanitizeField(spec.v, noOpen)
  }));
  result.links.title = sanitizeField(result.links.title, noOpen);
  result.links.text = sanitizeField(result.links.text, noOpen);
  result.links.btns = result.links.btns.map(button => ({
    ...button,
    label: sanitizeField(button.label, noOpen)
  }));
  return result;
}

/* ============================================================
   Análisis principal
   ============================================================ */
function mergeMeta(primary, fallback) {
  const left = primary && typeof primary === 'object' ? primary : {};
  const right = fallback && typeof fallback === 'object' ? fallback : {};
  const merged = { ...right };
  Object.keys(left).forEach(key => {
    const value = left[key];
    if (value == null) return;
    if (typeof value === 'string' && !value.trim()) return;
    if (Array.isArray(value) && !value.length) return;
    merged[key] = value;
  });
  const images = [];
  const seen = new Set();
  [...(left.images || []), ...(right.images || [])].forEach(image => {
    const url = typeof image === 'string' ? image : image && image.url;
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push(typeof image === 'string' ? { url: image, score: 500, alt: '' } : image);
  });
  if (merged.image && !seen.has(merged.image)) images.unshift({ url: merged.image, score: 900, alt: '' });
  merged.images = images;
  const anchors = [];
  const seenUrls = new Set();
  [...(left.anchors || []), ...(right.anchors || [])].forEach(anchor => {
    if (!anchor || !anchor.url || seenUrls.has(anchor.url)) return;
    seenUrls.add(anchor.url);
    anchors.push(anchor);
  });
  merged.anchors = anchors;
  if (!merged.ld) merged.ld = {};
  return merged;
}

function prepareSource(input, options) {
  let text = '';
  let html = '';
  let providedMeta = null;
  let sourceUrl = safeHttpUrl(options.sourceUrl || options.url || '');

  if (input && typeof input === 'object') {
    text = String(input.text || '');
    html = String(input.html || '');
    providedMeta = input.meta && typeof input.meta === 'object' ? input.meta : null;
    sourceUrl = safeHttpUrl(options.sourceUrl || input.url || (providedMeta && (providedMeta.canonical || providedMeta.url)) || '') || sourceUrl;
  } else {
    text = String(input || '');
  }

  let meta = providedMeta ? { ...providedMeta } : {};

  if (!html && looksLikeHtml(text)) html = text;

  if (html) {
    const extracted = extractMeta(html, sourceUrl);
    meta = mergeMeta(meta, extracted);
    const converted = htmlToText(html);
    if (converted.length >= 40) text = converted;
  } else if (/^Title:\s/mi.test(text) && /Markdown Content:/i.test(text)) {
    const parsed = parseReaderMarkdown(text, sourceUrl);
    meta = mergeMeta(meta, parsed.meta);
    text = parsed.text;
    if (!sourceUrl) sourceUrl = safeHttpUrl(parsed.url);
  } else {
    text = String(text).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
  }

  if (!sourceUrl) sourceUrl = safeHttpUrl(meta.canonical || meta.url || '');
  if (!sourceUrl) {
    const firstLine = text.split('\n').map(line => line.trim()).find(Boolean) || '';
    if (/^https?:\/\/\S+$/i.test(firstLine)) sourceUrl = safeHttpUrl(firstLine);
  }
  if (!meta.siteName) meta.siteName = hostOf(sourceUrl);

  return { text, html, meta, sourceUrl, provider: options.provider || 'texto' };
}

function analyze(input, options = {}) {
  // Las opciones se pueden pasar en el segundo argumento o dentro de la entrada.
  // Así `analyze({ html, depth: 'rapido' })` y `analyze({ html }, { depth: 'rapido' })`
  // se comportan igual.
  const provided = options && typeof options === 'object' ? options : {};
  const inline = input && typeof input === 'object' ? input : {};
  const pick = key => (provided[key] !== undefined ? provided[key] : inline[key]);
  const opts = {
    tone: pick('tone'),
    depth: pick('depth'),
    noOpen: pick('noOpen'),
    seed: pick('seed'),
    sourceUrl: provided.sourceUrl || provided.url || inline.sourceUrl || inline.url || '',
    provider: pick('provider'),
    priorityText: pick('priorityText')
  };
  const tone = ['taringa', 'gamer', 'pro'].includes(opts.tone) ? opts.tone : 'taringa';
  const depth = opts.depth === 'rapido' ? 'rapido' : 'completo';
  const noOpen = opts.noOpen !== false;
  const maxItems = depth === 'rapido' ? 3 : 6;
  const maxSpecs = depth === 'rapido' ? 4 : 6;
  const maxParagraphs = depth === 'rapido' ? 2 : 3;
  const maxButtons = depth === 'rapido' ? 2 : 3;

  const prepared = prepareSource(input, opts);
  let { text, meta, sourceUrl, provider } = prepared;

  text = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (text.length < 40 && !meta.title) {
    throw new Error('No hay suficiente contenido para analizar. Pegá el texto completo o un enlace con más información.');
  }

  // Muchos sitios modernos arman el contenido con JavaScript: el lector recibe
  // solo el esqueleto y el resultado sería el encabezado del sitio, no el post.
  if (prepared.html && text.length < 220) {
    const error = new Error('Esa página carga el contenido con JavaScript, así que el lector solo recibe la estructura del sitio. Abrí el post en el navegador, seleccioná el texto y pegalo acá.');
    error.code = 'JS_RENDERED';
    error.retryWithText = true;
    throw error;
  }

  let blocks = buildBlocks(text);

  // Si pegaste UNA sola línea con formato "algo: algo", es una nota tuya, no una
  // característica del producto: pasa a ser parte del cuerpo del post.
  if (opts.priorityText) {
    const prioridad = normalizeCompare(String(opts.priorityText));
    const esPegado = block => {
      const key = normalizeCompare(block.text || '');
      return key.length > 20 && prioridad.includes(key.slice(0, 100));
    };
    const pegadas = blocks.filter(block => block.type === 'feature' && esPegado(block));
    if (pegadas.length === 1) {
      const nota = pegadas[0];
      blocks = blocks.map(block => (block === nota ? { ...block, type: 'paragraph' } : block));
    }
  }

  if (!blocks.length && !meta.title) {
    throw new Error('No pudimos encontrar contenido útil en ese texto.');
  }

  const title = pickTitle(meta, blocks, sourceUrl) || fallbackTitle(sourceUrl);
  const type = detectType(text, meta);
  const description = pickDescription(meta, blocks, title, sourceUrl, type);
  const images = rankImages({ ...meta, baseUrl: sourceUrl }, text).map(image => image.url);
  const items = extractFeatures(blocks, maxItems);
  const specs = extractSpecs({ text, blocks, meta, sourceUrl, type, maxSpecs });
  const buttons = extractLinks({ text, meta, sourceUrl, type, maxButtons });
  const paragraphs = pickParagraphs(blocks, title, type, maxParagraphs, opts.priorityText || '');
  const seed = String(opts.seed || `${title}|${sourceUrl}|${Date.now() % 100000}`);

  const post = composePost({
    title,
    description,
    type,
    tone,
    noOpen,
    seed,
    sourceUrl,
    siteName: meta.siteName || hostOf(sourceUrl),
    provider,
    items,
    specs,
    buttons,
    paragraphs,
    images,
    maxParagraphs
  });

  post.source.images = images.slice(0, 12);
  post.source.provider = provider;

  return finalizePost(post, noOpen);
}

/* ============================================================
   Utilidades expuestas para la UI
   ============================================================ */
function countFilledFields(post) {
  if (!post) return 0;
  let count = 0;
  const check = value => {
    if (typeof value === 'string' && value.trim()) count++;
  };
  check(post.hero && post.hero.title);
  check(post.hero && post.hero.sub);
  check(post.hero && post.hero.img);
  check(post.info && post.info.greet);
  check(post.info && post.info.paras);
  check(post.info && post.info.hlTitle);
  check(post.info && post.info.hlText);
  check(post.info && post.info.listTitle);
  check(post.info && post.info.specTitle);
  (post.info && post.info.items || []).forEach(item => { check(item.name); check(item.desc); });
  (post.info && post.info.specs || []).forEach(spec => { check(spec.k); check(spec.v); });
  check(post.links && post.links.title);
  check(post.links && post.links.text);
  (post.links && post.links.btns || []).forEach(button => { check(button.label); check(button.url); });
  return count;
}
