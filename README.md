# T! POST Studio

Editor inteligente de posts. Pegás **un link** o **un texto extenso**, el editor completa solo
todos los campos (título, subtítulo, imagen, párrafos, características, ficha técnica y enlaces)
y después copiás el **HTML listo para pegar** en el sitio donde publicás.

Los separadores clásicos del proyecto se mantienen intactos: son parte de la identidad del post.

---

## Arranque rápido

```bash
node server.js          # abre en http://127.0.0.1:4173
node server.js --open   # y abre el navegador
PORT=8080 node server.js
```

También podés abrir `index.html` directamente (doble clic). En ese caso el editor funciona igual,
pero la lectura de links usa lectores públicos de respaldo en vez del lector local.

**Requisitos:** Node.js 18 o superior (solo para el servidor local).
La aplicación en sí no tiene dependencias: es HTML, CSS y JavaScript sin build.

---

## Cómo se usa

1. **Pegá el contenido.** Un link (`https://…`), el texto completo, un `.html`, o arrastrá un
   archivo `.txt` / `.md` / `.html` sobre el recuadro. El chip te dice qué detectó.
2. **Analizar y completar** (`⌘↵`). El motor local extrae la información; opcionalmente una IA
   reescribe y traduce.
3. **Revisá y ajustá.** Cada campo queda editable, con vista previa en vivo al lado.
4. **Copiar HTML** (`⌘B`) y pegalo en el **modo HTML / Fuente** del editor del sitio.

### Atajos

| Acción | Atajo |
| --- | --- |
| Nuevo post | `⌘N` |
| Copiar HTML | `⌘B` |
| Guardar en la biblioteca | `⌘S` |
| Analizar el contenido | `⌘↵` |
| Mostrar/ocultar biblioteca | `⌘\` |
| Cancelar / cerrar | `Esc` |

---

## Qué completa automáticamente

| Sección | Campos |
| --- | --- |
| **Portada** | título, subtítulo, imagen principal, nombre de la ventana |
| **Información** | saludo, párrafos, destacado (título y texto), nombre de la ventana |
| **Características** | entre 3 y 6 ítems con etiqueta, color, nombre y descripción |
| **Ficha técnica** | entre 2 y 6 filas de datos verificables |
| **Enlaces** | hasta 3 botones priorizando descargas, tienda y sitio oficial |
| **Diseño** | paleta clara/oscura, color de acento y los 3 separadores clásicos |

El analizador detecta el **tipo de contenido** (software, juego, película, música, libro,
hardware, tutorial, noticia) y adapta los títulos de sección y el tono.

**No inventa datos.** Si un dato, una imagen o un enlace no está en la fuente, el campo queda
vacío. Las URLs del resultado siempre salen de la fuente o de las que ya detectó el motor.

---

## Candados por sección

Cuando encontrás una fuente mejor y querés actualizar **solo una parte** del post, no hace
falta rehacerlo todo: cada sección tiene un **candado** en su cabecera.

| Candado | Qué conserva al volver a analizar |
| --- | --- |
| Portada | título, subtítulo, imagen y nombre de la ventana |
| Información | saludo, párrafos y destacado |
| Características | la lista completa y su título |
| Ficha técnica | las filas de datos y su título |
| Enlaces | título, texto y botones |

Cómo funciona:

- El candado se activa con el ícono de la cabecera. La sección queda marcada como
  **Bloqueada** y el panel muestra una barra de acento a la izquierda.
- Al analizar, las secciones bloqueadas se respetan y el resto se reemplaza con lo nuevo.
- El aviso de la tarjeta de captura dice siempre **qué se va a conservar**, y trae un
  botón **Desbloquear todo**. Ese aviso sigue visible aunque la tarjeta esté minimizada.
- El resultado del análisis también lo informa: *"Post completado: 37 campos · conservé
  Características"*.
- El **origen** (imágenes detectadas y URL de la fuente) se actualiza igual, así podés
  elegir una portada nueva aunque la portada esté bloqueada.
- Los candados se guardan con el post en la biblioteca y en el borrador.
- Con las cinco secciones bloqueadas, el editor avisa y no inicia el análisis.

El panel **Diseño y separadores** no tiene candado porque el análisis nunca lo modifica:
paleta, acento y separadores se respetan siempre.

### Actualizar un post desde la biblioteca

Cada post guardado tiene el botón **⟳ Actualizar** en la lista. Sirve para cuando aparece una
fuente mejor y querés refrescar el post **sin abrirlo**:

1. Clic en ⟳ sobre el post.
2. La hoja muestra el post y el plan exacto: qué se conserva y qué se actualiza.
3. Pegás el link o el texto nuevo (`⌘↵` para confirmar).
4. Se aplica respetando los candados de ese post y se guarda en la biblioteca.

Si el post está abierto en el editor, se refleja al instante. Si no, queda actualizado en la
lista y el aviso trae un botón **Abrir**. Un enlace de descarga (OneDrive) se rechaza con un
mensaje en la misma hoja, porque no es una página con contenido para analizar.

---

## Descarga directa (OneDrive)

Cuando el archivo vive en OneDrive, el enlace compartido abre el portal con
vista previa en vez de bajar el archivo. El editor lo convierte solo:

| Enlace compartido | Enlace de descarga directa |
| --- | --- |
| `https://1drv.ms/u/c/…?e=TOKEN` | `https://1drv.ms/u/c/…?e=TOKEN&download=1` |

- Se aplica **al analizar** contenido que traiga enlaces de OneDrive.
- Se aplica **al pegar** un enlace en el campo URL de la sección Enlaces
  (al salir del campo), con un aviso y la opción de **deshacer**.
- Los enlaces convertidos muestran la insignia **↓ Descarga directa**.
- Si pegás un enlace de OneDrive en el recuadro de análisis, el editor te avisa
  que es un archivo y te ofrece **agregarlo a Enlaces** ya convertido, en vez de
  intentar analizar una página que no tiene contenido.

Las reglas viven en `DIRECT_DOWNLOAD_RULES` (`js/extract.js`), así que sumar
otro servicio es agregar una entrada con su host y su transformación.

> Si el servicio bloquea el archivo (por ejemplo, por un análisis de antivirus),
> ningún cambio en el enlace lo destraba: hay que resolverlo del lado del servicio.

---

## Motores de análisis

| Motor | Requiere | Qué aporta |
| --- | --- | --- |
| **Local** | nada | Heurísticas propias: título, imagen, características, ficha y enlaces. Gratis y sin conexión a servicios de IA. |
| **Gemini** | API Key de Google AI Studio | Reescribe, traduce y ordena todo el post. |
| **OpenAI** | Endpoint compatible | Igual que Gemini, con cualquier servicio compatible (OpenAI, Ollama, LM Studio…). |

Los tres se configuran en **Ajustes → Motor de análisis**. El motor local siempre corre primero y
sirve de base y de red de seguridad: si la IA falla, el post igual se completa y te avisa.

La IA **no puede inventar enlaces**: los botones que devuelve se validan contra las URLs que el
motor local encontró en la fuente. Cualquier enlace desconocido se descarta.

Las claves se guardan **solo en este navegador** (localStorage) y se envían únicamente al
proveedor que elegiste.

---

## Lectura de links

El editor prueba varios caminos en orden y se queda con el primero que traiga contenido útil:

1. **Servidor local** (`/api/fetch`) — lee la página directamente, sin CORS, con metadatos
   completos. Es el mejor camino y se activa solo si levantaste `node server.js`.
2. **Jina Reader** — devuelve markdown limpio del artículo.
3. **Proxies CORS públicos** (AllOrigins, CodeTabs).
4. **Lectura directa** — cuando el sitio permite CORS.

Si un sitio bloquea todo, el editor te ofrece **pegar el texto manualmente** y conserva el enlace
para armar los botones igual.

El servidor local valida cada URL y bloquea direcciones de red privada (protección SSRF), limita
el tamaño de descarga, aplica timeout y sigue redirecciones de forma controlada.

---

## El HTML que genera

El objetivo es que el post se vea igual **en cualquier editor**, no solo en el navegador:

- **Todo el estilo va inline.** No hay `<style>`, ni hojas externas, ni `display: flex`.
- **No se usan tablas.** Muchos editores le dibujan borde a cada celda al pegar el HTML, y el
  post terminaba con una grilla alrededor de los separadores, del título de la ventana y de la
  ficha técnica. Todo se arma con `div`/`span` y `display: inline-block`, que no arrastran ese
  problema.
- **Los puntos de la ventana son el glifo `●`** con color, no círculos hechos con
  `border-radius`: así se ven redondos incluso si el editor descarta esa propiedad.
- **Los separadores se generan con bloques en línea** (línea — etiqueta — línea) y no dependen
  de CSS externo. Si dejás un separador vacío, queda una línea simple.
- **La única clase propia es `links-ocultos`**, que es la que entiende Taringa para los enlaces.
- **Todo el texto se escapa** y las URLs se validan (solo `http` / `https`).
- La vista previa marca el bloque de enlaces ocultos con un recuadro punteado para que veas
  exactamente qué queda ahí.

### Publicar

El botón **Publicar** abre una guía con los pasos y el título del post listo para copiar aparte.
El destino (nombre y URL del sitio) se configura en **Ajustes → Destino**, así que podés apuntarlo
a Taringa o a cualquier otro sitio sin tocar el código.

---

## Interfaz

Estética de app nativa de Apple: tipografía del sistema, materiales translúcidos, controles
nativos, animaciones sutiles y soporte completo de teclado.

- **Tema** automático (sigue al sistema), claro u oscuro.
- **Layout de 3 paneles** en escritorio: biblioteca, editor y vista previa.
- **Vista previa** con ancho de escritorio o móvil, y pestaña de código con resaltado.
- **Móvil**: barra de pestañas inferior (Editar / Vista / Biblioteca) y hojas que suben desde abajo.
- **Accesibilidad**: foco visible, navegación por teclado, `aria` en los controles y respeto por
  `prefers-reduced-motion`.

### Biblioteca

Cada post que generás se guarda solo, con miniatura, sitio y fecha. Podés buscarlo, duplicarlo,
eliminarlo y exportar/importar toda la biblioteca como JSON.

El borrador actual también se guarda automáticamente en el navegador.

---

## Tests

```bash
node tests/run.js     # o  npm test
```

80 tests sobre extracción, análisis, generación, IA, interfaz y servidor:

- utilidades y validación de URLs,
- conversión de HTML a texto y lectura de metadatos, Open Graph, JSON-LD,
- análisis desde HTML, desde markdown de lector y desde texto plano,
- escapado de HTML y rechazo de `javascript:` en la salida,
- reglas del HTML generado (sin `<style>`, sin flex, solo `links-ocultos`),
- flujo completo de análisis a HTML,
- **IA**: parseo tolerante del JSON, descarte de enlaces e imágenes inventadas,
  normalización de etiquetas y conservación de los datos del motor local,
- **interfaz**: guards de especificidad CSS y de la estructura de la página,
- **servidor**: levanta el proceso real y prueba `/api/health`, los estáticos,
  el bloqueo de rutas ocultas y de escape de directorio, y el rechazo SSRF
  (localhost, rangos privados, metadata de cloud, IPv6 loopback, `file://`).

---

## Estructura

```
index.html            Interfaz completa (una sola página)
css/style.css         Sistema de diseño y todos los estilos de la app
js/constants.js       Paletas, plantillas, estado por defecto y utilidades
js/extract.js         HTML→texto, metadatos, JSON-LD y lectura de URLs
js/analyze.js         Motor heurístico: reparte el contenido en cada campo
js/generator.js       Generador del HTML final (100% inline)
js/ai.js              Motores de IA: Gemini y compatible con OpenAI
js/app.js             Controlador: estado, biblioteca, eventos y atajos
server.js             Servidor local + lector de URLs (sin dependencias)
tests/run.js          Tests automatizados (lógica, IA, interfaz y servidor)
tests/fixtures/       Páginas de ejemplo para los tests
```

Los archivos `js/*.js` se cargan como scripts clásicos, en orden, sin módulos ni bundler: podés
abrir `index.html` directamente y funciona.

---

## Notas

- El HTML generado es **portable**: al ser todo inline, se ve bien en cualquier sitio que permita
  pegar HTML, no solo en el destino configurado.
- Los separadores clásicos (`👋 Bienvenidos`, `ℹ️ Información`, `📥 Links de Descarga`) se pueden
  editar libremente y hay un botón para restaurarlos.
- Si pegás contenido en otro idioma con el motor local, el texto se conserva tal cual; con Gemini u
  OpenAI se traduce al español.
