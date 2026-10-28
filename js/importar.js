// Importar lista de platos (con alérgenos) — traducción en bloque.
// Formato por línea: "-NOMBRE DEL PLATO: ALERGENO1, ALERGENO2, ..." (el "-" inicial y los alérgenos son opcionales).

const ALERGENOS = [
  ['gluten', 'Gluten', 'Gluten'],
  ['vegano', 'Vegano', 'Vegan'],
  ['vegetariano', 'Vegetariano', 'Vegetarian'],
  ['lactosa', 'Lactosa', 'Lactose'],
  ['leche', 'Leche', 'Milk'],
  ['lacteos', 'Lácteos', 'Dairy'],
  ['huevo', 'Huevo', 'Egg'],
  ['huevos', 'Huevo', 'Egg'],
  ['soja', 'Soja', 'Soy'],
  ['sesamo', 'Sésamo', 'Sesame'],
  ['frutos de cascara', 'Frutos de cáscara', 'Tree nuts'],
  ['frutos secos', 'Frutos secos', 'Nuts'],
  ['cacahuete', 'Cacahuetes', 'Peanuts'],
  ['cacahuetes', 'Cacahuetes', 'Peanuts'],
  ['mostaza', 'Mostaza', 'Mustard'],
  ['apio', 'Apio', 'Celery'],
  ['pescado', 'Pescado', 'Fish'],
  ['altramuz', 'Altramuces', 'Lupin'],
  ['altramuces', 'Altramuces', 'Lupin'],
  ['sulfitos', 'Sulfitos', 'Sulphites'],
  ['dioxido de azufre y sulfitos', 'Sulfitos', 'Sulphites'],
  ['crustaceos', 'Crustáceos', 'Crustaceans'],
  ['moluscos', 'Moluscos', 'Molluscs'],
  ['almendras', 'Almendras', 'Almonds'],
  ['nueces', 'Nueces', 'Walnuts'],
  ['avellanas', 'Avellanas', 'Hazelnuts'],
  ['pistachos', 'Pistachos', 'Pistachios'],
  ['anacardos', 'Anacardos', 'Cashews']
];

// Icono (img/alergenos/<archivo>.webp) de cada alérgeno, por su clave sin acentos.
const ICONOS_ALERGENOS = {
  'gluten': 'gluten', 'lactosa': 'lactosa', 'leche': 'lactosa', 'lacteos': 'lactosa',
  'huevo': 'huevo', 'huevos': 'huevo', 'soja': 'soja', 'sesamo': 'sesamo',
  'frutos de cascara': 'frutoscascara', 'frutos secos': 'frutoscascara', 'almendras': 'frutoscascara',
  'nueces': 'frutoscascara', 'avellanas': 'frutoscascara', 'pistachos': 'frutoscascara', 'anacardos': 'frutoscascara',
  'cacahuete': 'cacahuete', 'cacahuetes': 'cacahuete', 'mostaza': 'mostaza', 'apio': 'apio', 'pescado': 'pescado',
  'altramuz': 'altramuces', 'altramuces': 'altramuces', 'sulfitos': 'sulfitos', 'dioxido de azufre y sulfitos': 'sulfitos',
  'crustaceos': 'crustaceo', 'moluscos': 'molusco', 'vegano': 'vegano', 'vegetariano': 'vegetariano'
};

// Texto de alérgenos (ES, separados por comas) -> lista de iconos sin repetir.
function iconosAlergenos(textoEs) {
  const out = [];
  String(textoEs || '').split(/[,;]|\s+y\s+/i).forEach(t => {
    const ic = ICONOS_ALERGENOS[sinAcentos(t.replace(/[.\s]+$/g, ''))];
    if (ic && !out.includes(ic)) out.push(ic);
  });
  return out;
}

function sinAcentos(t) {
  return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Texto de alérgenos (ES) -> { es, en } normalizados, sin repetidos.
function normalizarAlergenos(texto) {
  const vistos = new Set();
  const es = [], en = [];
  String(texto || '')
    .split(/[,;]|\s+y\s+/i)
    .map(t => t.replace(/[.\s]+$/g, '').replace(/^[\s.]+/g, ''))
    .filter(Boolean)
    .forEach(t => {
      const clave = sinAcentos(t);
      const hit = ALERGENOS.find(a => a[0] === clave);
      const nombreEs = hit ? hit[1] : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
      const nombreEn = hit ? hit[2] : nombreEs;
      if (vistos.has(nombreEs)) return;
      vistos.add(nombreEs);
      es.push(nombreEs);
      en.push(nombreEn);
    });
  return { es: es.join(', '), en: en.join(', ') };
}

function aSentenceCase(nombre) {
  const n = nombre.trim();
  if (n !== n.toUpperCase()) return n; // ya viene con minúsculas: se respeta
  const l = n.toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function parsearListaPlatos(texto) {
  const porNombre = new Map();
  texto.split(/\r?\n/).forEach(linea => {
    const l = linea.replace(/^[\s\-–•*]+/, '').trim();
    if (!l) return;
    const i = l.indexOf(':');
    const nombre = aSentenceCase((i === -1 ? l : l.slice(0, i)).replace(/\s+/g, ' ').replace(/[.\s]+$/, ''));
    if (!nombre) return;
    const alerg = normalizarAlergenos(i === -1 ? '' : l.slice(i + 1));
    const clave = sinAcentos(nombre);
    const prev = porNombre.get(clave);
    if (prev) {
      // repetido en la lista: se unen los alérgenos
      const u = normalizarAlergenos([prev.alergenos_es, alerg.es].filter(Boolean).join(','));
      prev.alergenos_es = u.es;
      prev.alergenos_en = u.en;
    } else {
      porNombre.set(clave, { nombre_es: nombre, nombre_en: '', alergenos_es: alerg.es, alergenos_en: alerg.en });
    }
  });
  return [...porNombre.values()];
}

// Traduce una lista de platos con EXACTAMENTE las mismas reglas que el alta
// individual (reglasTraduccion() en app.js): revisión ortográfica + 3 estilos.
// opts: { categoriaFija } o { categorias } (reparto automático).
async function traducirListaConGemini(nombres, opts) {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error('No hay ninguna clave de Gemini. Pulsa "⚙️ Traducción" para añadir una.');
  const auto = !opts.categoriaFija;
  const prompt = 'Vas a ayudar con la carta de un buffet/restaurante. Te doy una LISTA de nombres de ' +
    'platos en español tal como los ha escrito el encargado (pueden tener alguna falta de ortografía). ' +
    (auto
      ? 'Para cada plato, elige además la categoría (sección de la carta) más adecuada de esta lista ' +
        'cerrada, copiando el texto exacto: ' + JSON.stringify(opts.categorias) + '. Es OBLIGATORIO que ' +
        'cada plato lleve su categoría: razona cada plato por separado, no uses la primera por defecto ' +
        '(orientación: bollería, trenzas, cocas dulces, ensaimadas, muffins → postres si existe; ' +
        'empanadas, cocas saladas, conos → entrantes si existe). '
      : 'Todos van en la categoría: "' + opts.categoriaFija + '". ') +
    'Aplica a CADA plato de la lista, por separado, exactamente estas instrucciones: ' +
    reglasTraduccion() + ' ' +
    'Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni bloques de código, del ' +
    'mismo tamaño y en el mismo orden que la lista, donde cada elemento tiene este formato exacto: ' +
    '{"correccion":{"hayError":false,"texto":"..."},"opciones":[{"estilo":"Literal","texto":"..."},' +
    '{"estilo":"Breve","texto":"..."},{"estilo":"Formal","texto":"..."}]' + (auto ? ',"cat":"..."' : '') + '} ' +
    '— en "correccion.texto" escribe siempre el nombre en español: corregido si hayError es true, ' +
    'o exactamente igual al original si hayError es false. Lista: ' + JSON.stringify(nombres);
  let ultimoError = '';
  for (const key of keys) {
    try {
      const resp = await fetch(`${CONFIG.GEMINI_ENDPOINT_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) { ultimoError = data.error?.message || ('Error HTTP ' + resp.status); continue; }
      const txt = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g, '');
      const m = txt.match(/\[[\s\S]*\]/);
      const arr = m ? JSON.parse(m[0]) : null;
      if (Array.isArray(arr) && arr.length === nombres.length) {
        // Cada elemento se analiza con el mismo parser que el alta individual
        return arr.map((o, j) => ({
          ...parseRespuestaTraduccion(JSON.stringify(o || {}), nombres[j]),
          cat: String((o && o.cat) || '').trim()
        }));
      }
      ultimoError = 'Respuesta de Gemini no válida.';
    } catch (e) { ultimoError = e.message; }
  }
  throw new Error(ultimoError || 'No se pudo traducir.');
}

let importFilas = [];

function abrirModalImportar() {
  const sel = document.getElementById('import-categoria');
  sel.innerHTML = '';
  sel.add(new Option('🤖 Automática (la IA reparte según el plato)', '__auto__'));
  categoriasOrdenadas().forEach(c => sel.add(new Option(c, c)));
  document.getElementById('import-texto').value = '';
  document.getElementById('import-evento').value = '';
  document.getElementById('import-error').hidden = true;
  document.getElementById('import-paso1').hidden = false;
  document.getElementById('import-paso2').hidden = true;
  document.getElementById('modal-importar').hidden = false;
  document.getElementById('import-texto').focus();
}

function cerrarModalImportar() {
  document.getElementById('modal-importar').hidden = true;
}

function mostrarErrorImport(msg) {
  const b = document.getElementById('import-error');
  b.textContent = msg;
  b.hidden = !msg;
}

async function analizarListaImportar() {
  mostrarErrorImport('');
  const lista = parsearListaPlatos(document.getElementById('import-texto').value);
  if (!lista.length) { mostrarErrorImport('Pega al menos un plato.'); return; }
  const catSel = document.getElementById('import-categoria').value;
  const auto = catSel === '__auto__';
  const cats = categoriasOrdenadas();
  const existentes = new Set(platos.map(p => sinAcentos(p.nombre_es)));
  const idExistente = new Map(platos.map(p => [sinAcentos(p.nombre_es), p.id]));
  const btn = document.getElementById('btn-import-analizar');
  btn.disabled = true;
  btn.textContent = 'Traduciendo...';
  let aviso = '';
  try {
    const TAM = 12;
    for (let i = 0; i < lista.length; i += TAM) {
      const trozo = lista.slice(i, i + TAM);
      const res = await traducirListaConGemini(trozo.map(p => p.nombre_es), auto ? { categorias: cats } : { categoriaFija: catSel });
      trozo.forEach((p, j) => {
        p.opciones = res[j].opciones;
        p.nombre_en = res[j].opciones[0]?.texto || '';  // por defecto la literal, como en el alta individual
        p.correccion = res[j].correccion.hayError ? aSentenceCase(res[j].correccion.texto) : null;
        p.categoria = res[j].cat;
      });
      btn.textContent = `Traduciendo... (${Math.min(i + TAM, lista.length)}/${lista.length})`;
    }
  } catch (e) {
    aviso = 'No se pudo traducir todo (' + e.message + '). Rellena a mano los ingleses vacíos o vuelve a intentarlo.';
  }
  btn.disabled = false;
  btn.textContent = 'Analizar y traducir';
  importFilas = lista.map(p => ({ ...p, categoria: auto ? ((cats.find(c => sinAcentos(c) === sinAcentos(p.categoria)) || '')) : catSel, existe: existentes.has(sinAcentos(p.nombre_es)), idExistente: idExistente.get(sinAcentos(p.nombre_es)) }));
  renderPreviewImportar();
  mostrarErrorImport(aviso);
  document.getElementById('import-paso1').hidden = true;
  document.getElementById('import-paso2').hidden = false;
}

function renderPreviewImportar() {
  const tbody = document.getElementById('import-tbody');
  tbody.innerHTML = '';
  importFilas.forEach((f, idx) => {
    const tr = document.createElement('tr');
    const celda = (campo, ph) => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = f[campo] || '';
      inp.placeholder = ph;
      inp.addEventListener('input', () => { f[campo] = inp.value; });
      td.appendChild(inp);
      return td;
    };
    const tdChk = document.createElement('td');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    if (f.incluir === undefined) f.incluir = !f.existe;
    chk.checked = f.incluir;
    chk.addEventListener('change', () => { f.incluir = chk.checked; actualizarBotonGuardarImport(); });
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);
    const tdCat = document.createElement('td');
    const selCat = document.createElement('select');
    if (!f.categoria) selCat.add(new Option('— elegir —', ''));
    categoriasOrdenadas().forEach(c => selCat.add(new Option(c, c)));
    selCat.value = f.categoria;
    selCat.addEventListener('change', () => { f.categoria = selCat.value; selCat.classList.remove('import-sin-cat'); actualizarBotonGuardarImport(); });
    if (!f.categoria) selCat.classList.add('import-sin-cat');
    tdCat.appendChild(selCat);
    tr.appendChild(tdCat);
    // Español + sugerencia de corrección ortográfica (como el "¿Quisiste decir...?" individual)
    const tdEs = celda('nombre_es', 'Español');
    if (f.correccion) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'import-correccion';
      chip.textContent = '¿' + f.correccion + '? ✓';
      chip.title = 'Pulsa para aplicar la corrección';
      chip.addEventListener('click', () => {
        f.nombre_es = f.correccion;
        f.correccion = null;
        tdEs.querySelector('input').value = f.nombre_es;
        chip.remove();
        actualizarBotonCorrecciones();
      });
      tdEs.appendChild(chip);
    }
    tr.appendChild(tdEs);
    // Inglés + selector de las 3 alternativas (Literal / Breve / Formal)
    const tdEn = celda('nombre_en', 'English');
    if (f.opciones && f.opciones.length > 1) {
      const sel = document.createElement('select');
      sel.className = 'import-opciones';
      f.opciones.forEach(o => sel.add(new Option((o.estilo ? o.estilo + ': ' : '') + o.texto, o.texto)));
      sel.value = f.nombre_en;
      sel.addEventListener('change', () => { f.nombre_en = sel.value; tdEn.querySelector('input').value = sel.value; });
      tdEn.appendChild(sel);
    }
    tr.appendChild(tdEn);
    tr.appendChild(celda('alergenos_es', 'Alérgenos'));
    tr.appendChild(celda('alergenos_en', 'Allergens'));
    if (f.existe) tr.title = 'Ya existe un plato con este nombre; desmarcado por defecto';
    if (f.existe) tr.classList.add('import-existe');
    tbody.appendChild(tr);
  });
  actualizarBotonGuardarImport();
  actualizarBotonCorrecciones();
}

function actualizarBotonCorrecciones() {
  const n = importFilas.filter(f => f.correccion).length;
  const b = document.getElementById('btn-import-correcciones');
  b.hidden = n === 0;
  b.textContent = `✓ Aplicar todas las correcciones (${n})`;
}

function aplicarTodasCorrecciones() {
  importFilas.forEach(f => { if (f.correccion) { f.nombre_es = f.correccion; f.correccion = null; } });
  renderPreviewImportar();
}

function actualizarBotonGuardarImport() {
  const n = importFilas.filter(f => f.incluir).length;
  const b = document.getElementById('btn-import-guardar');
  b.textContent = `Guardar ${n} plato${n === 1 ? '' : 's'}`;
  const sinCat = importFilas.filter(f => f.incluir && !f.categoria).length;
  b.disabled = n === 0 || sinCat > 0;
  if (sinCat) b.textContent += ` (faltan ${sinCat} categorías)`;
}

function guardarImportados() {
  if (!CONFIG.WEBAPP_URL || CONFIG.WEBAPP_URL.includes('PEGA_AQUI')) {
    mostrarErrorImport('Falta configurar WEBAPP_URL en js/config.js.');
    return;
  }
  let id = siguienteId();
  const idsEvento = [];
  const nuevos = importFilas.filter(f => f.incluir && f.nombre_es.trim()).map(f => {
    // si el usuario editó los alérgenos ES a mano y dejó EN vacío, se traducen
    let aEs = f.alergenos_es.trim(), aEn = (f.alergenos_en || '').trim();
    if (aEs && !aEn) { const n = normalizarAlergenos(aEs); aEs = n.es; aEn = n.en; }
    f.idNuevo = id;
    return { id: id++, categoria: f.categoria, nombre_es: f.nombre_es.trim(), nombre_en: (f.nombre_en || '').trim(), alergenos_es: aEs, alergenos_en: aEn };
  });
  if (!nuevos.length && !importFilas.some(f => f.existe)) return;
  const nombreEvento = document.getElementById('import-evento').value.trim();
  if (nombreEvento) {
    importFilas.forEach(f => {
      if (f.incluir && f.nombre_es.trim() && f.idNuevo) idsEvento.push(f.idNuevo);
      else if (f.existe && f.idExistente) idsEvento.push(f.idExistente); // ya estaba en la hoja y se reutiliza
    });
    guardarEventoRemoto(nombreEvento, idsEvento);
  }

  fetch(CONFIG.WEBAPP_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'addMany', platos: nuevos })
  }).catch(() => {});

  nuevos.forEach(p => {
    guardarPendiente(p);
    platos.push(p);
    seleccion.add(p.id);
  });
  guardarSeleccion(seleccion);
  nuevos.forEach(p => quitarCategoriaLocal(p.categoria));
  cerrarModalImportar();
  renderTodo();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-importar').addEventListener('click', abrirModalImportar);
  document.getElementById('btn-import-cancelar').addEventListener('click', cerrarModalImportar);
  document.getElementById('btn-import-cancelar2').addEventListener('click', cerrarModalImportar);
  document.getElementById('btn-import-analizar').addEventListener('click', analizarListaImportar);
  document.getElementById('btn-import-volver').addEventListener('click', () => {
    document.getElementById('import-paso1').hidden = false;
    document.getElementById('import-paso2').hidden = true;
    mostrarErrorImport('');
  });
  document.getElementById('btn-import-guardar').addEventListener('click', guardarImportados);
  document.getElementById('btn-import-correcciones').addEventListener('click', aplicarTodasCorrecciones);
});
