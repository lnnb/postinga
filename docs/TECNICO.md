# Documentación técnica

Este documento es para quien quiera **entender o modificar el proyecto por dentro**.
Si solo querés usarlo, mirá el [README](../README.md).

---

## Cómo está hecho

No hay build, ni bundler, ni dependencias. Son archivos estáticos y scripts clásicos que se
cargan en orden. Podés abrir `index.html` con doble clic y funciona.

```
index.html            Interfaz completa (una sola página)
css/style.css         Sistema de diseño y todos los estilos de la app
js/constants.js       Paletas, plantillas, candados y utilidades
js/extract.js         HTML→texto, metadatos, JSON-LD y lectura de URLs
js/analyze.js         Motor heurístico: reparte el contenido en cada campo
js/generator.js       Generador del HTML final (100% inline, sin tablas)
js/ai.js              Motores de IA: Gemini y compatibles con OpenAI
js/app.js             Controlador: estado, biblioteca, eventos y atajos
server.js             Servidor local + lector de URLs (sin dependencias)
tests/run.js          Tests automatizados
tests/fixtures/       Páginas de ejemplo para los tests
docs/                 Este documento y las capturas del README
manifest.webmanifest  Datos de la app instalable (PWA)
assets/               Ícono vectorial, favicon.ico multtamaño y PNG para iOS/Android
```

### Orden de carga

`constants → extract → analyze → generator → ai → app`

Cada archivo define funciones globales que el siguiente usa. No hay módulos ES.

---

## Cómo correrlo en local

```bash
node server.js          # http://127.0.0.1:4173
node server.js --open   # y abre el navegador
PORT=8080 node server.js
```

Requiere Node.js 18 o superior, solo para el servidor. La app en sí no necesita Node:
abriendo `index.html` funciona igual, pero sin el lector local de URLs.

---

## Tests

```bash
node tests/run.js     # o  npm test
```

101 tests sin dependencias, organizados en bloques:

| Bloque | Qué cubre |
| --- | --- |
| Utilidades | escapado, validación de URLs, paletas, normalización de estado |
| Extracción | HTML→texto, Open Graph, JSON-LD, anclas, markdown de lectores |
| Análisis | HTML, markdown y texto plano; tipos de contenido; etiquetas |
| Generador | reglas del HTML, sin tablas, escapado, temas |
| Candados | merge por sección sin mutar el original |
| Descarga directa | conversión de OneDrive, idempotencia |
| IA | parseo tolerante del JSON, descarte de URLs e imágenes inventadas |
| Interfaz | guards de estructura y especificidad CSS |
| Servidor | levanta el proceso real y prueba la API, los estáticos y el SSRF |

El bloque de servidor arranca `server.js` en un puerto libre y verifica el bloqueo de
`localhost`, rangos privados, metadata de cloud, IPv6 loopback, `file://` y credenciales
embebidas en la URL.

---

## El servidor local

`server.js` hace dos cosas: sirve los archivos estáticos y expone `/api/fetch`.

```
GET /api/health              → { ok, name, version, node }
GET /api/fetch?url=<url>     → { ok, finalUrl, contentType, charset, html }
```

Medidas de seguridad del lector:

- Solo `http` y `https`; rechaza `file://`, `javascript:` y URLs con credenciales.
- Resuelve el DNS y **bloquea direcciones privadas, loopback, link-local y metadata de cloud**
  (`169.254.169.254`), en IPv4 e IPv6.
- Sigue redirecciones de forma controlada (máximo 5) revalidando cada salto.
- Límite de 4 MB por descarga y timeout de 22 segundos.
- Solo acepta tipos de contenido de texto (HTML, XML, JSON, texto plano).

La app detecta si el servidor está activo (`/api/health`) y, si no lo está, usa lectores
públicos de respaldo. Nunca falla por no tener servidor.

---

## Reglas del HTML generado

El objetivo es que el post se vea igual en cualquier editor, no solo en el navegador.

- **Todo el estilo va inline.** Sin `<style>`, sin hojas externas, sin `display: flex`.
- **No se usan tablas.** Muchos editores le dibujan borde a cada celda al pegar, y el post
  termina con una grilla alrededor de los separadores y de la ficha técnica. Todo se arma con
  `div`/`span` y `display: inline-block`.
- **Los puntos de la ventana son el glifo `●`** con color, no círculos por `border-radius`.
- **La única clase propia es `links-ocultos`.**
- Todo el texto se escapa y las URLs se validan (solo `http`/`https`).

Los separadores se generan como `línea — etiqueta — línea` con bloques en línea, sin depender
de CSS externo. Un separador vacío deja una línea simple.

---

## Cómo se elige el título

Es la parte más delicada, porque de ahí salen el `<h2>` de la portada, el `alt` de la imagen y
las dos barras de ventana. En orden de prioridad:

1. `og:title` / `<title>` / JSON-LD / `h1`, limpiando el nombre del sitio.
2. La primera línea corta del texto (útil al pegar texto a mano).
3. El nombre deducido del cuerpo: `"Te presento soothe2 de oeksound"` → **oeksound soothe2**, o
   nombres con versión (`Sylenth1`, `Serum 2`).
4. El primer encabezado o párrafo que sirva.

Antes de aceptar cualquier candidato se descartan (`isBadTitle`):

- **Etiquetas de sección** (`isSectionLabel`): `👋 Bienvenidos`, `i️ Información`,
  `📥 Links de Descarga`, `Características principales`… Tampoco vale el emoji degradado a una
  letra suelta (`i️` → `i`).
- **Restos de las ventanas del propio post** (`isWindowArtifact`): `X — Vista previa`,
  `Información de X.rtf`, cualquier cosa terminada en `.rtf`/`.txt`.

Esto evita el caso típico de pegar el HTML de un post ya generado: sin el filtro, el separador
terminaba siendo el título del post nuevo.

Las barras de ventana se arman con ese título:

| Ventana | Texto | Ejemplo |
| --- | --- | --- |
| Portada | `<título> — Vista previa` | `oeksound soothe2 — Vista previa` |
| Información | `<etiqueta según tipo> — <título>` | `Ficha técnica — oeksound soothe2` |

La etiqueta de la ventana de información sale de `INFO_WINDOW_LABELS` y cambia con el tipo
detectado:

| Tipo | Etiqueta |
| --- | --- |
| software · hardware | Ficha técnica |
| game | Ficha del juego |
| movie | Ficha de la película |
| music | Ficha del disco |
| book | Ficha del libro |
| tutorial | Guía paso a paso |
| news | Resumen |
| generic | Información |

El bloque de la ficha que va dentro de esa ventana evita repetir la etiqueta: si la barra dice
"Ficha técnica", el bloque usa "Requisitos y compatibilidad".

### Páginas que se arman con JavaScript

Si el HTML descargado deja muy poco texto (menos de 220 caracteres), `analyze` lanza un error con
`code: 'JS_RENDERED'` y `retryWithText: true`, y la app ofrece pegar el texto a mano en vez de
generar un post con el encabezado del sitio.

---

## Motores de análisis

| Motor | Requiere | Módulo |
| --- | --- | --- |
| Local | nada | `js/analyze.js` |
| Gemini | API Key de Google AI Studio | `js/ai.js` |
| Compatible con OpenAI | URL base + clave (opcional en locales) | `js/ai.js` |

El motor local siempre corre primero y sirve de base. La IA recibe el resultado local y el
material fuente, y devuelve un JSON que se valida campo por campo.

**Regla clave:** la IA no puede inventar URLs. Los enlaces que devuelve se comparan contra los
que el motor local encontró en la fuente; cualquier enlace o imagen desconocida se descarta.
Si la IA falla, el post se completa igual con el motor local.

---

## Candados por sección

`mergeSections(current, incoming)` en `js/constants.js` combina el resultado del análisis con el
post actual respetando `post.locked`.

Granularidad: `info` cubre saludo, párrafos y destacado; `items` cubre la lista y su título;
`specs` cubre la ficha y su título. El **origen** (imágenes detectadas y URL de la fuente) se
actualiza siempre, así podés elegir una portada nueva aunque la portada esté bloqueada.

---

## Descarga directa

`DIRECT_DOWNLOAD_RULES` en `js/extract.js` define los servicios que abren un portal antes de
bajar el archivo. Cada regla tiene un `test` (host) y un `convert` (transformación).

Para agregar un servicio:

```js
{
  id: 'dropbox',
  label: 'Dropbox',
  test: host => /(^|\.)dropbox\.com$/i.test(host),
  convert(url) {
    if (url.searchParams.get('dl') === '1') return '';
    url.searchParams.set('dl', '1');
    return url.href;
  }
}
```

Si `convert` devuelve una cadena vacía, significa "ya está en su forma directa".

---

## App instalable (PWA)

`manifest.webmanifest` declara el nombre, los íconos y el modo `standalone`. El `start_url` y el
`scope` son relativos (`./`) para que funcione igual en la raíz o en una subcarpeta como
`/postinga/`.

Los íconos se generan a partir de `assets/icon-maskable.svg` (fondo completo, con la letra
dentro de la zona segura del 80% que exige Android):

| Archivo | Uso |
| --- | --- |
| `favicon.ico` | Pestaña del navegador, en 16, 32 y 48 px |
| `icon.svg` | Navegadores modernos (vectorial) |
| `icon-192.png` · `icon-512.png` | Android y escritorio |
| `apple-touch-icon.png` | Pantalla de inicio de iOS, 180 px |

Para regenerarlos: renderizar el SVG a 512 px y exportar los tamaños con Pillow.

---

## Publicar en GitHub Pages

El repositorio incluye `.nojekyll`, así que Pages sirve los archivos tal cual (sin procesarlos
con Jekyll).

1. Settings → Pages
2. Source: **Deploy from a branch**
3. Rama `main`, carpeta `/ (root)`

Cada push a `main` republica el sitio solo. Queda disponible en
`https://<usuario>.github.io/<repo>/`.

> En Pages no corre `server.js`, así que la lectura de links usa los lectores públicos. La app
> lo detecta sola.

---

## Estado y persistencia

Todo se guarda en `localStorage` del navegador:

| Clave | Contenido |
| --- | --- |
| `postinga.draft.v1` | El post que estás editando |
| `postinga.library.v1` | La biblioteca de posts guardados |
| `postinga.prefs.v1` | Apariencia, tono, motor, destino, biblioteca plegada |
| `postinga.keys.v1` | Claves de IA (solo se envían al proveedor elegido) |

El proyecto se llamaba `tpost` antes de llamarse Postinga. Al arrancar se copian las claves
viejas (`tpost.*`) a las nuevas si todavía no existen, así nadie pierde su biblioteca.

No hay backend ni cuentas. La biblioteca se puede exportar e importar como JSON.
