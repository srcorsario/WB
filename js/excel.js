// Exportar a Excel: (1) base de datos de platos y eventos, (2) hojas de
// cartelitos con la misma disposición que el PDF (A4, 2 columnas x 4 filas).
// Usa ExcelJS (se carga solo la primera vez que se pulsa un botón).

function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    s.onload = ok;
    s.onerror = () => ko(new Error('No se pudo cargar la librería de Excel (¿sin conexión?).'));
    document.head.appendChild(s);
  });
}

function descargarLibro(wb, nombre) {
  return wb.xlsx.writeBuffer().then(buf => {
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
}

function sufijoFecha() { return new Date().toISOString().slice(0, 10); }

// ---------- 1) Base de datos ----------

async function exportarExcelDatos() {
  await cargarExcelJS();
  const soloSel = (document.getElementById('sel-excel-datos') || {}).value === 'seleccion';
  const lista = soloSel ? platos.filter(p => seleccion.has(p.id)) : platos;
  if (!lista.length) { alert('No hay platos seleccionados.'); return; }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Platos', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Categoría', key: 'categoria', width: 22 },
    { header: 'Nombre ES', key: 'es', width: 42 },
    { header: 'Nombre EN', key: 'en', width: 42 },
    { header: 'Alérgenos ES', key: 'ales', width: 46 },
    { header: 'Alérgenos EN', key: 'alen', width: 46 }
  ];
  const orden = categoriasOrdenadas();
  [...lista].sort((a, b) =>
    (orden.indexOf(a.categoria) - orden.indexOf(b.categoria)) || a.nombre_es.localeCompare(b.nombre_es, 'es')
  ).forEach(p => ws.addRow({
    id: isNaN(Number(p.id)) ? p.id : Number(p.id), categoria: p.categoria, es: p.nombre_es, en: p.nombre_en || '',
    ales: p.alergenos_es || '', alen: p.alergenos_en || ''
  }));
  estiloCabecera(ws, 6);
  ws.autoFilter = { from: 'A1', to: 'F1' };

  // Eventos (si se pueden leer)
  if (!soloSel) try { if (!eventos.length && typeof cargarEventos === 'function' && urlWebApp()) await cargarEventos(); } catch (e) {}
  if (!soloSel && eventos.length) {
    const we = wb.addWorksheet('Eventos', { views: [{ state: 'frozen', ySplit: 1 }] });
    we.columns = [
      { header: 'Evento', key: 'n', width: 30 }, { header: 'Fecha', key: 'f', width: 14 },
      { header: 'IDs', key: 'i', width: 24 }, { header: 'Platos', key: 'p', width: 90 }
    ];
    eventos.forEach(ev => {
      const d = ev.fecha ? new Date(ev.fecha) : null;
      const ids = (ev.ids || []).map(String);
      we.addRow({
        n: ev.nombre, f: d && !isNaN(d) ? d.toLocaleDateString('es-ES') : '', i: ids.join(', '),
        p: ids.map(id => (platos.find(p => String(p.id) === id) || {}).nombre_es || ('#' + id)).join(', ')
      });
    });
    estiloCabecera(we, 4);
    we.getColumn('p').alignment = { wrapText: true, vertical: 'top' };
  }
  await descargarLibro(wb, 'cartelitos-platos-' + sufijoFecha() + '.xlsx');
}

function estiloCabecera(ws, n) {
  const fila = ws.getRow(1);
  for (let c = 1; c <= n; c++) {
    const cell = fila.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A3B2E' } };
    cell.alignment = { vertical: 'middle' };
  }
  fila.height = 22;
}

// ---------- 2) Hojas de cartelitos ----------

const NBSP = ' ';
const _iconosPng = {};

async function iconoPng(nombre) {
  if (_iconosPng[nombre]) return _iconosPng[nombre];
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = 'img/alergenos/' + nombre + '.webp'; });
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext('2d').drawImage(img, 0, 0);
  _iconosPng[nombre] = cv.toDataURL('image/png');
  return _iconosPng[nombre];
}

const _ctxTexto = document.createElement('canvas').getContext('2d');
function lineasTexto(texto, fuente, pt, negrita, anchoPx) {
  if (!texto) return 0;
  _ctxTexto.font = `${negrita ? 800 : 400} ${pt * 96 / 72}px "${fuente}", Arial, sans-serif`;
  let lineas = 1, actual = '';
  texto.split(' ').forEach(w => {
    const prueba = actual ? actual + ' ' + w : w;
    if (actual && _ctxTexto.measureText(prueba).width > anchoPx) { lineas++; actual = w; }
    else actual = prueba;
  });
  return lineas;
}

const CARD_W_PX = 351;          // 93 mm
const CARD_H_PT = 6.2 / 2.54 * 72; // 6,2 cm
const POR_HOJA = 8;

async function exportarExcelCartelitos() {
  const sel = platosSeleccionadosOrdenados();
  if (!sel.length) { alert('No hay platos seleccionados.'); return; }
  await cargarExcelJS();
  const tip = getTipografia();
  const formato = getFormatoTexto();
  const modo = getModoAlergenos();
  const idioma = getIdioma();
  const fEs = buscarFuente(tip.es.fuente).valor, fEn = buscarFuente(tip.en.fuente).valor;
  const interlin = 1.25, util = CARD_W_PX - 16;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cartelitos', {
    pageSetup: {
      paperSize: 9, orientation: 'portrait', horizontalCentered: true,
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.47, right: 0.47, top: 0.47, bottom: 0.47, header: 0.2, footer: 0.2 }
    },
    views: [{ showGridLines: false }]
  });
  ws.getColumn(1).width = (CARD_W_PX - 5) / 7;
  ws.getColumn(2).width = (CARD_W_PX - 5) / 7;
  const negro = { style: 'thin', color: { argb: 'FF000000' } };

  let filaXL = 1; // fila actual de la hoja (1-based)
  for (let ini = 0; ini < sel.length; ini += 2) {
    const par = sel.slice(ini, ini + 2);
    const datos = par.map(p => {
      const verEs = idioma !== 'en' || !p.nombre_en, verEn = idioma !== 'es';
      const alEs = idioma !== 'en' && (modo === 'texto' || modo === 'ambos') && p.alergenos_es ? p.alergenos_es.split(',').map(t => t.trim()).filter(Boolean).join(', ').replace(/ (?!$)/g, ' ') : '';
      const nbs = s => s.split(', ').map(t => t.replace(/ /g, NBSP)).join(', ');
      const alEn = idioma !== 'es' && (modo === 'texto' || modo === 'ambos') && p.alergenos_en ? nbs(p.alergenos_en.split(',').map(t => t.trim()).filter(Boolean).join(', ')) : '';
      return {
        // Solo inglés: va en la fila principal, con el tamaño y estilo del castellano
        es: verEs ? aplicarFormatoNombre(p.nombre_es, formato) : aplicarFormatoNombre(p.nombre_en || '', formato),
        en: verEs ? (verEn ? aplicarFormatoNombre(p.nombre_en || '', formato) : '') : '',
        alEs: alEs ? nbs(alEs) : '', alEn,
        iconos: (modo === 'imagen' || modo === 'ambos') ? iconosAlergenos(p.alergenos_es) : []
      };
    });
    const maxIc = Math.max(...datos.map(d => d.iconos.length));
    const alTam = tip.alerg.tamano, icMm = tip.alerg.iconos;

    // Alturas (pt) con reducción progresiva de iconos y texto de alérgenos si no cabe
    let escIc = 1, escTx = 1, h;
    const calc = () => {
      const lEs = Math.max(...datos.map(d => lineasTexto(d.es, fEs, tip.es.tamano, true, util)));
      const lEn = Math.max(...datos.map(d => lineasTexto(d.en, fEn, tip.en.tamano, false, util)));
      const tA = alTam * escTx;
      const lAe = Math.max(...datos.map(d => lineasTexto(d.alEs, fEn, tA, false, util)));
      const lAn = Math.max(...datos.map(d => lineasTexto(d.alEn, fEn, tA, false, util)));
      const icPx = maxIc ? Math.max(14, Math.min(icMm * 96 / 25.4, (util - (maxIc - 1) * 4.5) / maxIc) * escIc) : 0;
      return {
        icPx,
        es: lEs * tip.es.tamano * interlin + 2, en: lEn * tip.en.tamano * interlin + 2,
        ic: maxIc ? icPx * 0.75 + 4 : 0,
        ae: lAe ? lAe * tA * interlin + 2 : 0, an: lAn ? lAn * tA * interlin + 2 : 0
      };
    };
    h = calc();
    const total = x => x.es + x.en + x.ic + x.ae + x.an + 10;
    while (total(h) > CARD_H_PT && escIc > 0.75) { escIc -= 0.05; h = calc(); }
    while (total(h) > CARD_H_PT && escTx > 0.5) { escTx -= 0.05; h = calc(); }
    const pad = Math.max(3, (CARD_H_PT - (total(h) - 10)) / 2);
    const filas = [pad, h.es, h.en, h.ic, h.ae, h.an, pad];
    const base = filaXL;
    filas.forEach((alto, k) => { ws.getRow(base + k).height = Math.max(alto, 1); });

    for (let ci = 0; ci < datos.length; ci++) {
      const d = datos[ci], col = ci + 1;
      const poner = (k, texto, fuente, pt, negrita, color) => {
        const c = ws.getCell(base + k, col);
        c.value = texto || null;
        c.font = { name: fuente, size: pt, bold: negrita, color: { argb: color } };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      };
      poner(1, d.es, fEs, tip.es.tamano, true, 'FF1A1A1A');
      poner(2, d.en, fEn, tip.en.tamano, false, 'FF333333');
      poner(4, d.alEs, fEn, alTam * escTx, false, 'FF333333');
      poner(5, d.alEn, fEn, alTam * escTx, false, 'FF333333');
      for (let k = 0; k < 7; k++) {
        const c = ws.getCell(base + k, col);
        c.border = { left: negro, right: negro, top: k === 0 ? negro : undefined, bottom: k === 6 ? negro : undefined };
      }
      // Iconos
      if (d.iconos.length) {
        const n = d.iconos.length, sz = h.icPx, sep = 4.5;
        let x = (CARD_W_PX - (n * sz + (n - 1) * sep)) / 2;
        const altoFilaPx = h.ic * 96 / 72;
        for (const ic of d.iconos) {
          const id = wb.addImage({ base64: await iconoPng(ic), extension: 'png' });
          ws.addImage(id, {
            tl: { nativeCol: col - 1, nativeColOff: Math.round(x * 9525), nativeRow: base + 3 - 1, nativeRowOff: Math.round(Math.max(0, (altoFilaPx - sz) / 2) * 9525) },
            ext: { width: sz, height: sz }, editAs: 'oneCell'
          });
          x += sz + sep;
        }
      }
    }
    filaXL = base + 7;
    // salto de página tras cada 4 filas de cartelitos (8 por hoja)
    if (((ini / 2) + 1) % (POR_HOJA / 2) === 0 && ini + 2 < sel.length) ws.getRow(filaXL - 1).addPageBreak();
  }
  ws.pageSetup.printArea = 'A1:B' + (filaXL - 1);
  await descargarLibro(wb, 'cartelitos-' + sufijoFecha() + '.xlsx');
}

function conAvisoExcel(btn, fn) {
  btn.addEventListener('click', async () => {
    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Generando...';
    try { ajustarCartelitos(); await fn(); }
    catch (e) { alert('No se pudo generar el Excel: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = txt; }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('sel-excel-datos');
  if (sel) {
    try { sel.value = localStorage.getItem('cartelitos-excelDatos') === 'seleccion' ? 'seleccion' : 'todos'; } catch (e) {}
    sel.addEventListener('change', () => { try { localStorage.setItem('cartelitos-excelDatos', sel.value); } catch (e) {} });
  }
  const a = document.getElementById('btn-excel-datos');
  const b = document.getElementById('btn-excel-cartelitos');
  if (a) conAvisoExcel(a, exportarExcelDatos);
  if (b) conAvisoExcel(b, exportarExcelCartelitos);
});
