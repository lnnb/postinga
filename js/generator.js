/**
 * T! POST Studio
 * Generador del HTML final del post.
 *
 * Reglas de oro:
 * - Todo el estilo va inline: el HTML tiene que verse igual al pegarlo en otro sitio.
 * - Los separadores clásicos (líneas + etiqueta) son parte de la identidad del proyecto.
 * - Se escapa todo texto y se validan las URLs (solo http/https).
 * - Sin clases propias salvo `links-ocultos`, que es la que entiende Taringa.
 */

function build(state = (typeof S !== 'undefined' ? S : null)) {
  if (!state) return '';
  const st = normalizePostState(state);
  const P = palette(st.theme, st.accent);
  const tagPalette = TAGS[st.theme] || TAGS.light;

  const hero = st.hero || {};
  const info = st.info || {};
  const links = st.links || {};
  const title = cleanSpace(hero.title || '');
  const sub = cleanSpace(hero.sub || '');
  const image = safeHttpUrl(hero.img || '');
  const greeting = cleanSpace(info.greet || '');
  const paragraphs = (Array.isArray(info.paras) ? info.paras.join('\n\n') : String(info.paras || ''))
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean);
  const items = (Array.isArray(info.items) ? info.items : []).filter(item =>
    cleanSpace(item.name || '') || cleanSpace(item.desc || '')
  );
  const specs = (Array.isArray(info.specs) ? info.specs : []).filter(spec =>
    cleanSpace(spec.k || '') && cleanSpace(spec.v || '')
  );
  const buttons = (Array.isArray(links.btns) ? links.btns : [])
    .map(button => ({ ...button, url: safeHttpUrl(button.url || '') }))
    .filter(button => button.url && cleanSpace(button.label || ''));

  const hasHero = Boolean(title || sub || image);
  const hasInfo = Boolean(greeting || paragraphs.length || items.length || specs.length ||
    cleanSpace(info.hlTitle || '') || cleanSpace(info.hlText || ''));
  const hasLinks = buttons.length > 0;

  if (!hasHero && !hasInfo && !hasLinks) return '';

  const sep = (label, marginTop = 34) => separator(label, P, marginTop);

  /* ------------------------------------------------------------------
     Portada
     ------------------------------------------------------------------ */
  let heroWindow = '';
  if (hasHero) {
    const heroBody = [
      image
        ? `<img src="${esc(image)}" alt="${esc(title || 'Imagen de portada')}" title="${esc(title || '')}" style="display: block; max-width: 100%; height: auto; margin: 0 auto; border-radius: 16px; border: 1px solid ${P.imgB}; box-shadow: 0 16px 40px ${P.imgSh};">`
        : '',
      title
        ? `<h2 style="margin: ${image ? '26px' : '0'} 0 ${sub ? '10px' : '0'} 0; color: ${P.title}; font-family: ${FONT_DISPLAY}; font-size: 30px; line-height: 1.15; font-weight: 700; letter-spacing: -0.8px;">${esc(title)}</h2>`
        : '',
      sub
        ? `<p style="margin: 0 auto; max-width: 560px; color: ${P.sub}; font-family: ${FONT_TEXT}; font-size: 16px; line-height: 1.55; font-weight: 400;">${esc(sub)}</p>`
        : ''
    ].filter(Boolean).join('\n      ');

    heroWindow = windowCard(
      windowBar(cleanSpace(hero.win || '') || `${title || 'Post'} — Vista previa`, P),
      `<div style="padding: 38px 26px 34px; background-color: ${P.hero}; text-align: center;">\n      ${heroBody}\n    </div>`,
      P
    );
  }

  /* ------------------------------------------------------------------
     Información
     ------------------------------------------------------------------ */
  let infoWindow = '';
  if (hasInfo) {
    const parts = [];

    if (greeting) {
      parts.push(
        `<p style="margin: 0 0 20px 0; padding-left: 14px; border-left: 3px solid ${P.accent}; color: ${P.title}; font-family: ${FONT_DISPLAY}; font-size: 18px; line-height: 1.4; font-weight: 700; letter-spacing: -0.2px;">${esc(greeting)}</p>`
      );
    }

    paragraphs.forEach((paragraph, index) => {
      parts.push(
        `<p style="margin: 0 0 ${index === paragraphs.length - 1 ? '0' : '16px'} 0; color: ${P.para}; font-family: ${FONT_TEXT}; font-size: 16px; line-height: 1.75;">${fmt(paragraph, P)}</p>`
      );
    });

    const highlightTitle = cleanSpace(info.hlTitle || '');
    const highlightText = cleanSpace(info.hlText || '');
    if (highlightTitle || highlightText) {
      parts.push(
        `<div style="margin: 26px 0 4px 0; padding: 20px 22px; background-color: ${P.hlBg}; border: 1px solid ${P.accentLine}; border-left: 4px solid ${P.accent}; border-radius: 14px;">\n` +
        (highlightTitle
          ? `        <p style="margin: 0 0 ${highlightText ? '7px' : '0'} 0; color: ${P.title}; font-family: ${FONT_TEXT}; font-size: 15.5px; line-height: 1.45; font-weight: 700;"><span style="color: ${P.accent};">✦</span> ${esc(highlightTitle)}</p>\n`
          : '') +
        (highlightText
          ? `        <p style="margin: 0; color: ${P.para}; font-family: ${FONT_TEXT}; font-size: 14.5px; line-height: 1.65;">${fmt(highlightText, P)}</p>\n`
          : '') +
        `      </div>`
      );
    }

    const listTitle = cleanSpace(info.listTitle || '');
    if (items.length) {
      if (listTitle) {
        parts.push(
          `<h3 style="margin: 32px 0 14px 0; color: ${P.title}; font-family: ${FONT_DISPLAY}; font-size: 20px; line-height: 1.25; font-weight: 700; letter-spacing: -0.4px;">${esc(listTitle)}</h3>`
        );
      }

      const rows = items.map((item, index) => {
        const tagText = cleanSpace(item.tag || '').toUpperCase();
        const name = cleanSpace(item.name || '');
        const desc = cleanSpace(item.desc || '');
        const tagColors = tagPalette[item.color] || tagPalette.gris;
        const tagHtml = tagText
          ? `<span style="display: inline-block; background-color: ${tagColors[0]}; color: ${tagColors[1]}; font-family: ${FONT_TEXT}; font-size: 10.5px; line-height: 1.2; font-weight: 700; letter-spacing: 0.6px; padding: 3px 9px; border-radius: 99px; vertical-align: middle;">${esc(tagText)}</span>`
          : '';
        const nameHtml = name
          ? `<strong style="color: ${P.title}; font-family: ${FONT_TEXT}; font-size: 15.5px; line-height: 1.4; font-weight: 700; vertical-align: middle;">${esc(name)}</strong>`
          : '';
        const head = [tagHtml, nameHtml].filter(Boolean).join(' ');
        return (
          `<div style="padding: 16px 18px;${index ? ` border-top: 1px solid ${P.row};` : ''}">\n` +
          (head ? `          <p style="margin: 0; color: ${P.title};">${head}</p>\n` : '') +
          (desc ? `          <p style="margin: ${head ? '7px' : '0'} 0 0 0; color: ${P.cardTx}; font-family: ${FONT_TEXT}; font-size: 14px; line-height: 1.65;">${fmt(desc, P)}</p>\n` : '') +
          `        </div>`
        );
      }).join('\n        ');

      parts.push(
        `<div style="margin: 0; background-color: ${P.card}; border: 1px solid ${P.cardB}; border-radius: 16px; overflow: hidden;">\n        ${rows}\n      </div>`
      );
    }

    if (specs.length) {
      const specTitle = cleanSpace(info.specTitle || '') || 'Especificaciones';
      const rows = specs.map((spec, index) => (
        `<div style="padding: 11px 18px;${index ? ` border-top: 1px solid ${P.row};` : ''} font-size: 0;">` +
        `<span style="display: inline-block; width: 30%; vertical-align: top; color: ${P.cardTx}; font-family: ${FONT_TEXT}; font-size: 13px; line-height: 1.5; font-weight: 600;">${esc(cleanSpace(spec.k))}</span>` +
        `<span style="display: inline-block; width: 66%; vertical-align: top; color: ${P.para}; font-family: ${FONT_TEXT}; font-size: 13.5px; line-height: 1.55;">${fmt(cleanSpace(spec.v), P)}</span>` +
        `</div>`
      )).join('\n        ');

      parts.push(
        `<div style="margin: 26px 0 0 0; background-color: ${P.card}; border: 1px solid ${P.cardB}; border-radius: 16px; overflow: hidden;">\n` +
        `        <div style="padding: 13px 18px; background-color: ${P.bar}; border-bottom: 1px solid ${P.cardB}; color: ${P.title}; font-family: ${FONT_TEXT}; font-size: 12px; line-height: 1.4; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;">⚙️ ${esc(specTitle)}</div>\n` +
        `        <div>\n        ${rows}\n        </div>\n` +
        `      </div>`
      );
    }

    infoWindow = windowCard(
      windowBar(cleanSpace(info.win || '') || `Información de ${shortName(title) || 'la publicación'}.rtf`, P),
      `<div style="padding: 30px 28px 34px; background-color: ${P.hero}; color: ${P.title};">\n      ${parts.join('\n      ')}\n    </div>`,
      P
    );
  }

  /* ------------------------------------------------------------------
     Enlaces
     ------------------------------------------------------------------ */
  let linksWindow = '';
  if (hasLinks) {
    const linksTitle = cleanSpace(links.title || '');
    const linksText = cleanSpace(links.text || '');
    const buttonsHtml = buttons.map(button => {
      const primary = button.style === 'primary';
      const background = primary ? P.accent : P.b2;
      const color = primary ? P.accentTx : P.b2T;
      const border = primary ? P.accent : P.b2B;
      return `<a href="${esc(button.url)}" target="_blank" rel="noopener noreferrer nofollow" style="display: inline-block; margin: 5px 4px; padding: 12px 24px; background-color: ${background}; border: 1px solid ${border}; border-radius: 99px; color: ${color}; font-family: ${FONT_TEXT}; font-size: 14.5px; line-height: 1.3; font-weight: 700; text-align: center; text-decoration: none; max-width: 100%; word-break: break-word;">${esc(cleanSpace(button.label))}</a>`;
    }).join('\n        ');

    const inner =
      (linksTitle ? `<p style="margin: 0 0 ${linksText ? '7px' : '20px'} 0; color: ${P.title}; font-family: ${FONT_DISPLAY}; font-size: 20px; line-height: 1.3; font-weight: 700; letter-spacing: -0.4px;">${esc(linksTitle)}</p>\n      ` : '') +
      (linksText ? `<p style="margin: 0 0 20px 0; color: ${P.sub}; font-family: ${FONT_TEXT}; font-size: 14.5px; line-height: 1.55;">${esc(linksText)}</p>\n      ` : '') +
      `<div style="text-align: center;">\n        ${buttonsHtml}\n      </div>`;

    const content =
      `<div style="margin: 18px 0 36px 0; background-color: ${P.win}; border: 1px solid ${P.border}; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 44px ${P.shadow}; text-align: center;">\n` +
      `    <div style="height: 4px; background-color: ${P.accent};"></div>\n` +
      `    <div style="padding: 30px 24px 28px;">\n      ${inner}\n    </div>\n` +
      `  </div>`;

    linksWindow = links.hide ? `<div class="links-ocultos">\n  ${content}\n</div>` : content;
  }

  /* ------------------------------------------------------------------
     Ensamblado
     ------------------------------------------------------------------ */
  const blocks = [];
  if (hasHero) blocks.push(sep((st.sep || [])[0] ?? CLASSIC_SEPARATORS[0], 30));
  else if (hasInfo) blocks.push(sep((st.sep || [])[0] ?? CLASSIC_SEPARATORS[0], 30));
  if (hasHero) blocks.push(heroWindow);
  if (hasInfo) {
    blocks.push(sep((st.sep || [])[1] ?? CLASSIC_SEPARATORS[1], 34));
    blocks.push(infoWindow);
  }
  if (hasLinks) {
    blocks.push(sep((st.sep || [])[2] ?? CLASSIC_SEPARATORS[2], 34));
    blocks.push(linksWindow);
  }

  const root =
    `<div style="max-width: 760px; margin: 0 auto; padding: 0 2px; font-family: ${FONT_TEXT}; color: ${P.title}; -webkit-font-smoothing: antialiased; text-align: left;">\n` +
    blocks.filter(Boolean).join('\n\n') +
    `\n</div>`;

  return root;
}

/* ============================================================
   Piezas del HTML
   ============================================================ */
function windowBar(filename, P) {
  // Los puntos usan el glifo "●" en lugar de un círculo por CSS: se ve redondo
  // incluso en editores que descartan border-radius.
  const dot = color => `<span style="color: ${color}; font-family: ${FONT_TEXT}; font-size: 13px; line-height: 1; vertical-align: middle;">●</span>`;
  const gap = `<span style="display: inline-block; width: 6px; font-size: 0; line-height: 0;">&nbsp;</span>`;
  const label = truncate(cleanSpace(filename || ''), 46, '…');

  // Sin tablas: tres bloques en línea. No hay etiquetas <td> a las que el sitio
  // pueda dibujarles borde, que era lo que generaba los cuadros.
  return (
    `<div style="padding: 10px 16px; background-color: ${P.bar}; border-bottom: 1px solid ${P.border}; font-size: 0;">` +
    `<span style="display: inline-block; width: 28%; vertical-align: middle; white-space: nowrap; font-size: 0;">${dot('#ff5f57')}${gap}${dot('#febc2e')}${gap}${dot('#28c840')}</span>` +
    `<span style="display: inline-block; width: 44%; vertical-align: middle; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: ${P.barTx}; font-family: ${FONT_TEXT}; font-size: 12px; line-height: 1.4; font-weight: 600; letter-spacing: 0.1px;">${esc(label)}</span>` +
    `<span style="display: inline-block; width: 28%; vertical-align: middle; font-size: 0;">&nbsp;</span>` +
    `</div>`
  );
}

function windowCard(bar, body, P) {
  return (
    `<div style="margin: 18px 0; background-color: ${P.win}; border: 1px solid ${P.border}; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 44px ${P.shadow};">\n` +
    `  ${bar}\n` +
    `  ${body}\n` +
    `</div>`
  );
}

function separator(label, P, marginTop = 34) {
  const text = cleanSpace(label || '');

  if (!text) {
    return `<div style="height: 1px; background-color: ${P.border}; margin: ${marginTop}px 0 18px 0; font-size: 0; line-height: 0;"></div>`;
  }

  // Línea — etiqueta — línea, con bloques en línea en vez de celdas de tabla.
  const line = `<span style="display: inline-block; width: 18%; height: 1px; background-color: ${P.border}; vertical-align: middle; font-size: 0; line-height: 0;"></span>`;

  return (
    `<div style="margin: ${marginTop}px 0 18px 0; font-size: 0; text-align: center;">` +
    line +
    `<span style="display: inline-block; padding: 0 14px; color: ${P.barTx}; font-family: ${FONT_TEXT}; font-size: 11px; line-height: 1.4; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; vertical-align: middle; white-space: nowrap;">${esc(text)}</span>` +
    line +
    `</div>`
  );
}

function shortName(value) {
  return truncate(cleanSpace(value || ''), 48, '');
}

/* ============================================================
   Estadísticas para la interfaz
   ============================================================ */
function buildStats(html, state) {
  const safeHtml = String(html || '');
  const items = (state && state.info && Array.isArray(state.info.items)) ? state.info.items : [];
  const specs = (state && state.info && Array.isArray(state.info.specs)) ? state.info.specs : [];
  const buttons = (state && state.links && Array.isArray(state.links.btns)) ? state.links.btns : [];
  const words = countWordsInHtml(safeHtml);
  return {
    chars: safeHtml.length,
    words,
    items: items.filter(item => cleanSpace(item.name || '') || cleanSpace(item.desc || '')).length,
    specs: specs.filter(spec => cleanSpace(spec.k || '') && cleanSpace(spec.v || '')).length,
    buttons: buttons.filter(button => safeHttpUrl(button.url || '') && cleanSpace(button.label || '')).length,
    empty: !safeHtml
  };
}

function buildPreviewDocument(html, paletteValue) {
  const background = paletteValue.pv;
  const scheme = paletteValue.mode === 'dark' ? 'dark' : 'light';
  return `<!doctype html>
<html lang="es" data-preview-theme="${scheme}">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="${scheme}">
<style>
  html { color-scheme: ${scheme}; }
  body {
    margin: 0;
    padding: 26px 22px 60px;
    background: ${background};
    font-family: ${FONT_TEXT};
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  img { max-width: 100%; height: auto; }
  a { cursor: pointer; }
  .links-ocultos {
    position: relative;
    outline: 1.5px dashed rgba(10, 132, 255, .55);
    outline-offset: 5px;
    border-radius: 20px;
  }
  .links-ocultos::before {
    content: "LINKS OCULTOS";
    position: absolute;
    top: -9px;
    left: 18px;
    z-index: 2;
    padding: 2px 7px;
    border-radius: 4px;
    background: #0a84ff;
    color: #fff;
    font: 700 8px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;
    letter-spacing: .8px;
  }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: rgba(120,120,128,.35); border-radius: 99px; border: 3px solid ${background}; }
  ::-webkit-scrollbar-track { background: transparent; }
</style>
</head>
<body>${html}</body>
</html>`;
}
