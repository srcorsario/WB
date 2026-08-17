/* Cartelitos Buffet — lógica de la web
 * -----------------------------------------------------------------
 * Mismo patrón que el editor de la carta (Web Editor Pro):
 *  - LECTURA: CSV publicado de la Google Sheet (CONFIG.CSV_URL), vía
 *    fetch normal — Google lo sirve con cabeceras CORS abiertas, así
 *    que no hace falta ningún backend para leer los platos.
 *  - ESCRITURA (añadir plato): POST al Apps Script (CONFIG.WEBAPP_URL)
 *    en modo "no-cors" — la petición se envía pero no podemos leer la
 *    respuesta, así que actualizamos la lista de forma "optimista"
 *    (la añadimos localmente al momento) y confiamos en que llegará.
 *  - TRADUCCIÓN: se llama a Gemini directamente desde el navegador,
 *    con una o varias claves que el propio usuario pega en el botón
 *    "⚙️ Traducción" (se guardan solo en localStorage, nunca en el código).
 */

const LS_SELECCION = 'cartelitos-seleccion';
const LS_GEMINI_KEYS = 'cartelitos-geminiKeys';
const LS_OPTIMISTAS = 'cartelitos-optimistas';
const OPTIMISTA_TTL_MS = 10 * 60 * 1000; // 10 minutos: tiempo de sobra para que el CSV publicado se actualice

let platos = [];

// ---------- Estado: selección persistida ----------

function cargarSeleccion() {
  try {
    const raw = localStorage.getItem(LS_SELECCION);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function guardarSeleccion(set) {
  localStorage.setItem(LS_SELECCION, JSON.stringify([...set]));
}

let seleccion = cargarSeleccion();

// ---------- Claves de Gemini (guardadas en el navegador) ----------

function getGeminiKeys() {
  try {
    const raw = localStorage.getItem(LS_GEMINI_KEYS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function guardarGeminiKeys(keys) {
  localStorage.setItem(LS_GEMINI_KEYS, JSON.stringify(keys));
}

function anadirGeminiKey(key) {
  const keys = getGeminiKeys();
  if (key && !keys.includes(key)) {
    keys.push(key);
    guardarGeminiKeys(keys);
  }
}

function borrarGeminiKey(key) {
  guardarGeminiKeys(getGeminiKeys().filter(k => k !== key));
}

function ofuscarClave(k) {
  return k.length > 10 ? `${k.slice(0, 6)}...${k.slice(-4)}` : k;
}

// ---------- Platos "optimistas" (añadidos localmente en lo que el CSV se actualiza) ----------

function getOptimistas() {
  try {
    const raw = localStorage.getItem(LS_OPTIMISTAS);
    const lista = raw ? JSON.parse(raw) : [];
    const ahora = Date.now();
    const vigentes = lista.filter(p => ahora - p._ts < OPTIMISTA_TTL_MS);
    if (vigentes.length !== lista.length) localStorage.setItem(LS_OPTIMISTAS, JSON.stringify(vigentes));
    return vigentes;
  } catch (e) {
    return [];
  }
}

function anadirOptimista(plato) {
  const lista = getOptimistas();
  lista.push({ ...plato, _ts: Date.now() });
  localStorage.setItem(LS_OPTIMISTAS, JSON.stringify(lista));
}

function fusionarConOptimistas(listaPlatos) {
  const optimistas = getOptimistas();
  const yaPresente = (opt) => listaPlatos.some(p =>
    p.categoria === opt.categoria && p.nombre_es.trim().toLowerCase() === opt.nombre_es.trim().toLowerCase()
  );
  const faltantes = optimistas.filter(opt => !yaPresente(opt));
  return [...listaPlatos, ...faltantes.map(({ _ts, ...p }) => p)];
}

// ---------- Carga de datos (CSV publicado) ----------

function parseCSV(texto) {
  if (window.Papa) {
    const resultado = window.Papa.parse(texto, { skipEmptyLines: true });
    return resultado.data;
  }
  // Fallback simple si PapaParse no cargó (p.ej. sin conexión al CDN)
  return texto.split(/\r?\n/).filter(l => l.trim() !== '').map(linea =>
    linea.split(',').map(v => v.replace(/^"|"$/g, '').trim())
  );
}

function filasAPlatos(filas) {
  if (filas.length === 0) return [];
  const cabeceras = filas[0].map(h => String(h).trim().toLowerCase());
  const idxId = cabeceras.indexOf('id');
  const idxCategoria = cabeceras.indexOf('categoria');
  const idxEs = cabeceras.indexOf('nombre_es');
  const idxEn = cabeceras.indexOf('nombre_en');

  return filas.slice(1)
    .filter(fila => fila.length > 1 && String(fila[idxCategoria] || '').trim() !== '')
    .map((fila, i) => ({
      id: idxId !== -1 && fila[idxId] ? Number(fila[idxId]) : i + 1,
      categoria: String(fila[idxCategoria] || '').trim(),
      nombre_es: String(fila[idxEs] || '').trim(),
      nombre_en: idxEn !== -1 ? String(fila[idxEn] || '').trim() : ''
    }))
    .filter(p => p.nombre_es !== '');
}

async function cargarPlatos() {
  const estado = document.getElementById('estado-carga');
  const aviso = document.getElementById('aviso-config');

  if (!CONFIG.CSV_URL || CONFIG.CSV_URL.includes('PEGA_AQUI')) {
    aviso.hidden = false;
    aviso.textContent = '⚠️ Falta configurar CSV_URL en js/config.js con el enlace de "Publicar en la web" de tu Google Sheet.';
    estado.hidden = true;
    platos = fusionarConOptimistas([]);
    renderTodo();
    return;
  }

  try {
    // "&zx=" rompe la caché intermedia; sin cabeceras extra para no disparar un preflight CORS.
    const resp = await fetch(CONFIG.CSV_URL + (CONFIG.CSV_URL.includes('?') ? '&' : '?') + 'zx=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('Error HTTP ' + resp.status);
    const texto = await resp.text();
    const filas = parseCSV(texto);
    platos = fusionarConOptimistas(filasAPlatos(filas));
    aviso.hidden = true;
  } catch (err) {
    aviso.hidden = false;
    aviso.textContent = '⚠️ No se pudo leer la Google Sheet (' + err.message + '). Comprueba CSV_URL en js/config.js.';
    platos = fusionarConOptimistas(platos);
  }

  estado.hidden = true;
  renderTodo();
}

// ---------- Render: pestaña Platos ----------

function categoriasOrdenadas() {
  const enConfig = CONFIG.CATEGORIAS || [];
  const presentes = [...new Set(platos.map(p => p.categoria))];
  const extra = presentes.filter(c => !enConfig.includes(c));
  return [...enConfig, ...extra];
}

function renderCategorias(filtro = '') {
  const contenedor = document.getElementById('categorias-container');
  contenedor.innerHTML = '';
  const tplItem = document.getElementById('tpl-plato-item');
  const filtroLower = filtro.trim().toLowerCase();

  categoriasOrdenadas().forEach(categoria => {
    const platosCategoria = platos
      .filter(p => p.categoria === categoria)
      .filter(p =>
        !filtroLower ||
        p.nombre_es.toLowerCase().includes(filtroLower) ||
        (p.nombre_en || '').toLowerCase().includes(filtroLower)
      )
      .sort((a, b) => a.nombre_es.localeCompare(b.nombre_es, 'es'));

    if (filtroLower && platosCategoria.length === 0) return;

    const bloque = document.createElement('div');
    bloque.className = 'categoria-bloque';

    const cabecera = document.createElement('div');
    cabecera.className = 'categoria-cabecera';
    cabecera.innerHTML = `<h2>${categoria}</h2>`;

    const btnAnadir = document.createElement('button');
    btnAnadir.className = 'btn pequeno secundario no-print';
    btnAnadir.textContent = '+ Añadir plato';
    btnAnadir.addEventListener('click', () => abrirModalNuevoPlato(categoria));
    cabecera.appendChild(btnAnadir);

    const lista = document.createElement('div');
    lista.className = 'categoria-lista';

    if (platosCategoria.length === 0) {
      const vacio = document.createElement('div');
      vacio.className = 'categoria-vacia';
      vacio.textContent = 'Todavía no hay platos en esta categoría.';
      lista.appendChild(vacio);
    } else {
      platosCategoria.forEach(plato => {
        const nodo = tplItem.content.cloneNode(true);
        const checkbox = nodo.querySelector('.plato-checkbox');
        checkbox.checked = seleccion.has(plato.id);
        checkbox.addEventListener('change', () => alternarSeleccion(plato.id, checkbox.checked));
        nodo.querySelector('.plato-es').textContent = plato.nombre_es;
        nodo.querySelector('.plato-en').textContent = plato.nombre_en || '';
        lista.appendChild(nodo);
      });
    }

    bloque.appendChild(cabecera);
    bloque.appendChild(lista);
    contenedor.appendChild(bloque);
  });
}

function alternarSeleccion(id, marcado) {
  if (marcado) seleccion.add(id);
  else seleccion.delete(id);
  guardarSeleccion(seleccion);
  actualizarContador();
  renderCartelitos();
}

// ---------- Render: pestaña Cartelitos ----------

function renderCartelitos() {
  const grid = document.getElementById('cartelitos-grid');
  const mensajeVacio = document.getElementById('cartelitos-vacio-msg');
  const tpl = document.getElementById('tpl-cartelito');
  grid.innerHTML = '';

  const seleccionados = platos
    .filter(p => seleccion.has(p.id))
    .sort((a, b) => {
      const ordenCat = categoriasOrdenadas();
      const diff = ordenCat.indexOf(a.categoria) - ordenCat.indexOf(b.categoria);
      if (diff !== 0) return diff;
      return a.nombre_es.localeCompare(b.nombre_es, 'es');
    });

  mensajeVacio.hidden = seleccionados.length > 0;

  seleccionados.forEach(plato => {
    const nodo = tpl.content.cloneNode(true);
    nodo.querySelector('.cartelito-es').textContent = plato.nombre_es;
    nodo.querySelector('.cartelito-en').textContent = plato.nombre_en || '';
    grid.appendChild(nodo);
  });
}

function actualizarContador() {
  document.getElementById('contador-seleccion').textContent = seleccion.size;
}

function renderTodo() {
  renderCategorias(document.getElementById('buscador').value);
  renderCartelitos();
  actualizarContador();
}

// ---------- Pestañas ----------

function activarTab(nombre) {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === nombre));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + nombre));
}

// ---------- Traducción con Gemini (desde el navegador) ----------

async function traducirConGemini(nombreEs, categoria) {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error('No hay ninguna clave de Gemini configurada. Pulsa "⚙️ Traducción" para añadir una.');
  }

  const prompt = 'Traduce al inglés el siguiente nombre de un plato de buffet/restaurante ' +
    'para un cartelito de menú. Categoría: "' + categoria + '". ' +
    'Nombre en español: "' + nombreEs + '". ' +
    'Responde ÚNICAMENTE con el nombre traducido en inglés, tal y como se escribiría ' +
    'en un cartelito (sin comillas, sin punto final, sin explicaciones).';

  let ultimoError = '';

  for (let i = 0; i < keys.length; i++) {
    try {
      const resp = await fetch(`${CONFIG.GEMINI_ENDPOINT_URL}?key=${keys[i]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await resp.json();

      if (!resp.ok || data.error) {
        ultimoError = data.error?.message || ('Error HTTP ' + resp.status);
        continue; // prueba con la siguiente clave (p.ej. si esta se quedó sin cuota)
      }

      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (texto) return texto.trim().replace(/^"|"$/g, '');
      ultimoError = 'Respuesta de Gemini sin texto.';
    } catch (err) {
      ultimoError = err.message;
    }
  }

  throw new Error(ultimoError || 'No se pudo traducir.');
}

// ---------- Modal: ajustes de traducción ----------

function renderListaClaves() {
  const cont = document.getElementById('lista-claves');
  const keys = getGeminiKeys();
  cont.innerHTML = '';

  if (keys.length === 0) {
    cont.innerHTML = '<p class="lista-claves-vacia">Todavía no has añadido ninguna clave.</p>';
    return;
  }

  keys.forEach(k => {
    const fila = document.createElement('div');
    fila.className = 'clave-fila';
    fila.innerHTML = `<span>${ofuscarClave(k)}</span>`;
    const btnBorrar = document.createElement('button');
    btnBorrar.className = 'btn pequeno secundario';
    btnBorrar.textContent = 'Quitar';
    btnBorrar.addEventListener('click', () => { borrarGeminiKey(k); renderListaClaves(); });
    fila.appendChild(btnBorrar);
    cont.appendChild(fila);
  });
}

function abrirModalAjustes() {
  renderListaClaves();
  document.getElementById('nueva-clave-input').value = '';
  document.getElementById('modal-ajustes').hidden = false;
}

function cerrarModalAjustes() {
  document.getElementById('modal-ajustes').hidden = true;
}

// ---------- Modal: añadir plato nuevo ----------

function abrirModalNuevoPlato(categoriaPreseleccionada) {
  const modal = document.getElementById('modal-nuevo-plato');
  const select = document.getElementById('nuevo-categoria');
  select.innerHTML = '';
  categoriasOrdenadas().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
  if (categoriaPreseleccionada) select.value = categoriaPreseleccionada;

  document.getElementById('nuevo-nombre-es').value = '';
  document.getElementById('nuevo-nombre-en').value = '';
  document.getElementById('form-nuevo-plato-error').hidden = true;
  modal.hidden = false;
  document.getElementById('nuevo-nombre-es').focus();
}

function cerrarModalNuevoPlato() {
  document.getElementById('modal-nuevo-plato').hidden = true;
}

function siguienteId() {
  const idsLocales = platos.map(p => p.id).filter(id => !isNaN(id));
  const idsOptimistas = getOptimistas().map(p => p.id).filter(id => !isNaN(id));
  const todos = [...idsLocales, ...idsOptimistas];
  return todos.length ? Math.max(...todos) + 1 : 1;
}

async function enviarNuevoPlato(ev) {
  ev.preventDefault();

  const errorBox = document.getElementById('form-nuevo-plato-error');
  errorBox.hidden = true;

  if (!CONFIG.WEBAPP_URL || CONFIG.WEBAPP_URL.includes('PEGA_AQUI')) {
    errorBox.textContent = 'Falta configurar WEBAPP_URL en js/config.js con la URL del Apps Script.';
    errorBox.hidden = false;
    return;
  }

  const categoria = document.getElementById('nuevo-categoria').value;
  const nombreEs = document.getElementById('nuevo-nombre-es').value.trim();
  let nombreEn = document.getElementById('nuevo-nombre-en').value.trim();

  const btnGuardar = document.getElementById('btn-guardar-nuevo');
  btnGuardar.disabled = true;

  try {
    if (!nombreEn) {
      btnGuardar.textContent = 'Traduciendo...';
      nombreEn = await traducirConGemini(nombreEs, categoria);
    }

    btnGuardar.textContent = 'Guardando...';
    const nuevoPlato = { id: siguienteId(), categoria, nombre_es: nombreEs, nombre_en: nombreEn };

    // Modo "no-cors": la petición se envía pero no podemos leer si tuvo éxito.
    // Por eso guardamos el plato como "optimista" y lo añadimos ya a la vista.
    fetch(CONFIG.WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', ...nuevoPlato })
    }).catch(() => { /* no-cors: los errores de red reales igualmente no se pueden leer */ });

    anadirOptimista(nuevoPlato);
    platos.push(nuevoPlato);
    seleccion.add(nuevoPlato.id);
    guardarSeleccion(seleccion);

    cerrarModalNuevoPlato();
    renderTodo();
  } catch (err) {
    errorBox.textContent = 'No se pudo añadir el plato: ' + err.message;
    errorBox.hidden = false;
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar plato';
  }
}

// ---------- Inicialización ----------

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => activarTab(btn.dataset.tab));
  });

  document.getElementById('buscador').addEventListener('input', ev => renderCategorias(ev.target.value));

  document.getElementById('btn-recargar').addEventListener('click', cargarPlatos);

  document.getElementById('btn-limpiar-seleccion').addEventListener('click', () => {
    if (!confirm('¿Vaciar la selección de hoy?')) return;
    seleccion = new Set();
    guardarSeleccion(seleccion);
    renderTodo();
  });

  document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

  document.getElementById('btn-cancelar-nuevo').addEventListener('click', cerrarModalNuevoPlato);
  document.getElementById('form-nuevo-plato').addEventListener('submit', enviarNuevoPlato);

  document.getElementById('btn-ajustes-traduccion').addEventListener('click', abrirModalAjustes);
  document.getElementById('btn-cerrar-ajustes').addEventListener('click', cerrarModalAjustes);
  document.getElementById('form-nueva-clave').addEventListener('submit', ev => {
    ev.preventDefault();
    const input = document.getElementById('nueva-clave-input');
    const valor = input.value.trim();
    if (valor) { anadirGeminiKey(valor); input.value = ''; renderListaClaves(); }
  });

  cargarPlatos();
});
