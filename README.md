<div align="center">

<img src="assets/icon.svg" width="84" height="84" alt="Postinga">

# Postinga

### Pegás un link. El post se escribe solo.

Generá publicaciones completas —título, portada, párrafos, características, ficha técnica y enlaces— en segundos, con HTML 100% inline listo para pegar en cualquier editor.

<br>

[![Abrir Postinga](https://img.shields.io/badge/▶%20Abrir%20la%20app-online-0071e3?style=for-the-badge)](https://lnnb.github.io/postinga/)
[![Sin dependencias](https://img.shields.io/badge/Dependencias-0-1d1d1f?style=for-the-badge)](#uso-en-local-opcional)
[![Tests](https://img.shields.io/badge/Tests-158%20passing-34c759?style=for-the-badge)](docs/TECNICO.md)
[![Licencia MIT](https://img.shields.io/badge/Licencia-MIT-6e6e73?style=for-the-badge)](#licencia)

<br>

[Qué resuelve](#por-qué-postinga) · [Cómo funciona](#cómo-funciona) · [Funciones](#funciones-clave) · [Uso en local](#uso-en-local-opcional) · [Preguntas frecuentes](#preguntas-frecuentes) · [Docs técnicas](docs/TECNICO.md)

<br>

<img src="docs/img/app.png" width="900" alt="Postinga — Editor con vista previa en vivo">

</div>

---

## Por qué Postinga

Armar un post largo y prolijo suele ser siempre el mismo trabajo manual: buscar la portada, resumir la descripción, listar funciones, ordenar requisitos, depurar links y pelearse con el formato del editor.

**Postinga automatiza todo ese proceso en el navegador, sin cuentas ni servidores externos.** Vos revisás, ajustás lo que quieras en vivo y copiás el HTML final.

| Tarea | A mano | Con Postinga |
| :--- | :--- | :--- |
| Armar un post completo | 20–40 minutos | **~30 segundos** |
| Campos a completar | 20 o más | **Autocompletado** |
| Mezclar varias fuentes | Copiar y pegar una por una | **Hasta 3 links + texto + archivos** |
| Actualizar una sola parte | Rehacer todo el post | **1 clic con candados por sección** |
| Consistencia visual | Depende del editor | **HTML inline idéntico en cualquier sitio** |

> **Si sabés copiar y pegar, ya sabés usar Postinga.**

### Casos de uso habituales

<table>
  <tr>
    <td width="50%" valign="top">
      <strong>🎛️ Software, plugins y apps</strong><br>
      Fichas técnicas limpias con formatos, plataformas, requisitos y enlaces oficiales.
    </td>
    <td width="50%" valign="top">
      <strong>🎮 Juegos, cine, música y libros</strong><br>
      Portada, sinopsis, puntos clave y accesos a tiendas o plataformas.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>🌎 Contenido en otro idioma</strong><br>
      Traducción y reescritura natural al español usando IA opcional (Gemini u OpenAI/local).
    </td>
    <td width="50%" valign="top">
      <strong>🗂️ Biblioteca reutilizable</strong><br>
      Guardá, buscá, duplicá y actualizá tus posts sin perder las secciones que ya puliste.
    </td>
  </tr>
</table>

---

## Cómo funciona

### 1. Pegá tus fuentes (podés mezclarlas)

El recuadro inteligente acepta **una o varias entradas a la vez** y las combina automáticamente respetando prioridad:

* **Hasta 3 links:** clasifica cada fuente por rol (*sitio oficial*, *reseña*, *manual* o *foro*) para tomar mejores imágenes, datos técnicos y enlaces sin arrastrar ruido de navegación.
* **Texto o HTML pegado:** tus notas propias o una ficha existente tienen prioridad en el cuerpo.
* **Archivos locales:** arrastrá varios `.txt`, `.md` o `.html` a la vez, o sumalos con **📎 Adjuntar**.

```text
[https://oeksound.com/products/soothe2](https://oeksound.com/products/soothe2)
[https://www.soundonsound.com/reviews/oeksound-soothe2](https://www.soundonsound.com/reviews/oeksound-soothe2)

Mi aporte: el instalador pesa unos 60 MB y trae más de 2500 presets.
