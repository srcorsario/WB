// Importar lista de platos (con alérgenos) — traducción en bloque.
// Formato por línea: "-NOMBRE DEL PLATO: ALERGENO1, ALERGENO2, ..." (el "-" inicial y los alérgenos son opcionales).

const ALERGENOS = [
  ['gluten', 'Gluten', 'Gluten'],
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

async function traducirListaConGemini(nombres) {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error('No hay ninguna clave de Gemini. Pulsa "⚙️ Traducción" para añadir una.');
  const prompt = 'Traduce al inglés estos nombres de platos de un buffet de hotel/restaurante (español, Mallorca), para cartelitos. ' +
    'Traducción literal y neutra, sin inventar ingredientes ni cambiar el plato por otro. ' +
    'Si el nombre usa una palabra de cocina española/regional que NO sea universalmente conocida en inglés ' +
    '(p. ej. "coca", "ensaimada", "cocarroi", "trampó", "empanada" sí se deja), mantenla y añade una breve explicación en inglés sencillo: "<Nombre>, <descripción breve>". ' +
    'Marcas o nombres propios se dejan igual. ' +
    'Responde ÚNICAMENTE con un array JSON de strings, del mismo tamaño y orden que la lista, sin texto adicional. Lista: ' +
    JSON.stringify(nombres);
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
      if (Array.isArray(arr) && arr.length === nombres.length) return arr.map(x => String(x).trim().replace(/\.$/, ''));
      ultimoError = 'Respuesta de Gemini no válida.';
    } catch (e) { ultimoError = e.message; }
  }
  throw new Error(ultimoError || 'No se pudo traducir.');
}

let importFilas = [];

function abrirModalImportar() {
  const sel = document.getElementById('import-categoria');
  sel.innerHTML = '';
  categoriasOrdenadas().forEach(c => sel.add(new Option(c, c)));
  document.getElementById('import-texto').value = '';
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
  const existentes = new Set(platos.map(p => sinAcentos(p.nombre_es)));
  const btn = document.getElementById('btn-import-analizar');
  btn.disabled = true;
  btn.textContent = 'Traduciendo...';
  let aviso = '';
  try {
    const TAM = 25;
    for (let i = 0; i < lista.length; i += TAM) {
      const trozo = lista.slice(i, i + TAM);
      const en = await traducirListaConGemini(trozo.map(p => p.nombre_es));
      trozo.forEach((p, j) => { p.nombre_en = en[j]; });
    }
  } catch (e) {
    aviso = 'No se pudo traducir todo (' + e.message + '). Rellena a mano los ingleses vacíos o vuelve a intentarlo.';
  }
  btn.disabled = false;
  btn.textContent = 'Analizar y traducir';
  importFilas = lista.map(p => ({ ...p, existe: existentes.has(sinAcentos(p.nombre_es)) }));
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
    chk.checked = !f.existe;
    f.incluir = chk.checked;
    chk.addEventListener('change', () => { f.incluir = chk.checked; actualizarBotonGuardarImport(); });
    tdChk.appendChild(chk);
    tr.appendChild(tdChk);
    tr.appendChild(celda('nombre_es', 'Español'));
    tr.appendChild(celda('nombre_en', 'English'));
    tr.appendChild(celda('alergenos_es', 'Alérgenos'));
    tr.appendChild(celda('alergenos_en', 'Allergens'));
    if (f.existe) tr.title = 'Ya existe un plato con este nombre; desmarcado por defecto';
    if (f.existe) tr.classList.add('import-existe');
    tbody.appendChild(tr);
  });
  actualizarBotonGuardarImport();
}

function actualizarBotonGuardarImport() {
  const n = importFilas.filter(f => f.incluir).length;
  const b = document.getElementById('btn-import-guardar');
  b.textContent = `Guardar ${n} plato${n === 1 ? '' : 's'}`;
  b.disabled = n === 0;
}

function guardarImportados() {
  if (!CONFIG.WEBAPP_URL || CONFIG.WEBAPP_URL.includes('PEGA_AQUI')) {
    mostrarErrorImport('Falta configurar WEBAPP_URL en js/config.js.');
    return;
  }
  const categoria = document.getElementById('import-categoria').value;
  let id = siguienteId();
  const nuevos = importFilas.filter(f => f.incluir && f.nombre_es.trim()).map(f => {
    // si el usuario editó los alérgenos ES a mano y dejó EN vacío, se traducen
    let aEs = f.alergenos_es.trim(), aEn = (f.alergenos_en || '').trim();
    if (aEs && !aEn) { const n = normalizarAlergenos(aEs); aEs = n.es; aEn = n.en; }
    return { id: id++, categoria, nombre_es: f.nombre_es.trim(), nombre_en: (f.nombre_en || '').trim(), alergenos_es: aEs, alergenos_en: aEn };
  });
  if (!nuevos.length) return;

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
  quitarCategoriaLocal(categoria);
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
});
