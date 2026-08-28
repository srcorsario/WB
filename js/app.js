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
const LS_PENDIENTES = 'cartelitos-pendientes'; // altas y ediciones aún no confirmadas en el CSV
const LS_BORRADOS = 'cartelitos-borrados';     // bajas aún no confirmadas en el CSV
const LS_TIPOGRAFIA = 'cartelitos-tipografia';
const LS_FORMATO_TEXTO = 'cartelitos-formatoTexto';
const PENDIENTE_TTL_MS = 10 * 60 * 1000; // 10 minutos: tiempo de sobra para que el CSV publicado se actualice

let platos = [];
let platoEditandoId = null; // null = el modal "nuevo plato" está en modo alta; si no, en modo edición

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

// ---------- Tipo y tamaño de letra (guardado en el navegador) ----------
//
// Un tipo y un tamaño para español y otro distinto para inglés (nombre del
// plato), tanto en la lista de "Platos" como en los cartelitos. Se aplica
// escribiendo variables CSS en <html> (--fuente-es/en, --tamano-es/en; ver
// :root en css/style.css), de las que ya tiran tanto .plato-es/.plato-en
// como .cartelito-es/.cartelito-en, en pantalla y al imprimir por igual —
// así no hace falta ninguna lógica aparte para que la impresión coincida
// con lo elegido.

// "google" es el nombre tal cual lo usa la URL de Google Fonts; null si es
// una fuente ya instalada en el sistema del usuario (no hace falta cargar
// nada). "pila" es la lista de sustitutas por si la fuente no cargase.
const FUENTES_DISPONIBLES = [
  { valor: 'Montserrat', etiqueta: 'Montserrat', pila: '"Montserrat", "Segoe UI", "Helvetica Neue", Arial, sans-serif', google: 'Montserrat' },
  { valor: 'Arial', etiqueta: 'Arial', pila: 'Arial, "Helvetica Neue", Helvetica, sans-serif', google: null },
  { valor: 'Georgia', etiqueta: 'Georgia', pila: 'Georgia, "Times New Roman", Times, serif', google: null },
  { valor: 'Times New Roman', etiqueta: 'Times New Roman', pila: '"Times New Roman", Times, Georgia, serif', google: null },
  { valor: 'Roboto', etiqueta: 'Roboto', pila: '"Roboto", Arial, sans-serif', google: 'Roboto' },
  { valor: 'Poppins', etiqueta: 'Poppins', pila: '"Poppins", Arial, sans-serif', google: 'Poppins' },
  { valor: 'Lato', etiqueta: 'Lato', pila: '"Lato", Arial, sans-serif', google: 'Lato' },
  { valor: 'Playfair Display', etiqueta: 'Playfair Display', pila: '"Playfair Display", Georgia, serif', google: 'Playfair+Display' },
  { valor: 'Merriweather', etiqueta: 'Merriweather', pila: '"Merriweather", Georgia, serif', google: 'Merriweather' },
  { valor: 'Courier New', etiqueta: 'Courier New', pila: '"Courier New", Courier, monospace', google: null }
];

const TIPOGRAFIA_PREDETERMINADA = {
  es: { fuente: 'Montserrat', tamano: 14 },
  en: { fuente: 'Montserrat', tamano: 12 }
};

function copiaTipografiaPredeterminada() {
  return JSON.parse(JSON.stringify(TIPOGRAFIA_PREDETERMINADA));
}

function buscarFuente(valor) {
  return FUENTES_DISPONIBLES.find(f => f.valor === valor) || FUENTES_DISPONIBLES[0];
}

function getTipografia() {
  const predet = copiaTipografiaPredeterminada();
  try {
    const raw = localStorage.getItem(LS_TIPOGRAFIA);
    const guardada = raw ? JSON.parse(raw) : {};
    return {
      es: { ...predet.es, ...(guardada.es || {}) },
      en: { ...predet.en, ...(guardada.en || {}) }
    };
  } catch (e) {
    return predet;
  }
}

function guardarTipografia(tipografia) {
  localStorage.setItem(LS_TIPOGRAFIA, JSON.stringify(tipografia));
}

// Montserrat ya está cargada desde <link> en index.html.
const fuentesGoogleCargadas = new Set(['Montserrat']);

function asegurarFuenteGoogleCargada(nombreGoogle) {
  if (!nombreGoogle || fuentesGoogleCargadas.has(nombreGoogle)) return;
  fuentesGoogleCargadas.add(nombreGoogle);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${nombreGoogle}:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400&display=swap`;
  document.head.appendChild(link);
}

function aplicarTipografia(tipografia) {
  const es = buscarFuente(tipografia.es.fuente);
  const en = buscarFuente(tipografia.en.fuente);
  asegurarFuenteGoogleCargada(es.google);
  asegurarFuenteGoogleCargada(en.google);

  const raiz = document.documentElement.style;
  raiz.setProperty('--fuente-es', es.pila);
  raiz.setProperty('--tamano-es', tipografia.es.tamano + 'pt');
  raiz.setProperty('--fuente-en', en.pila);
  raiz.setProperty('--tamano-en', tipografia.en.tamano + 'pt');
}

function llenarSelectFuentes(select, valorSeleccionado) {
  select.innerHTML = '';
  FUENTES_DISPONIBLES.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.valor;
    opt.textContent = f.etiqueta;
    select.appendChild(opt);
  });
  select.value = valorSeleccionado;
}

function rellenarFormularioLetra(tipografia) {
  llenarSelectFuentes(document.getElementById('fuente-es'), tipografia.es.fuente);
  document.getElementById('tamano-es').value = tipografia.es.tamano;
  llenarSelectFuentes(document.getElementById('fuente-en'), tipografia.en.fuente);
  document.getElementById('tamano-en').value = tipografia.en.tamano;
}

// Se llama en cada cambio del formulario para que la vista previa se
// actualice al momento, igual que al elegir una opción de traducción.
function leerYAplicarFormularioLetra() {
  const predet = copiaTipografiaPredeterminada();
  const tamEs = parseFloat(document.getElementById('tamano-es').value);
  const tamEn = parseFloat(document.getElementById('tamano-en').value);

  const tipografia = {
    es: {
      fuente: document.getElementById('fuente-es').value,
      tamano: Number.isFinite(tamEs) && tamEs > 0 ? tamEs : predet.es.tamano
    },
    en: {
      fuente: document.getElementById('fuente-en').value,
      tamano: Number.isFinite(tamEn) && tamEn > 0 ? tamEn : predet.en.tamano
    }
  };

  guardarTipografia(tipografia);
  aplicarTipografia(tipografia);
}

function abrirModalLetra() {
  rellenarFormularioLetra(getTipografia());
  rellenarFormatoTexto(getFormatoTexto());
  document.getElementById('modal-ajustes-letra').hidden = false;
}

function cerrarModalLetra() {
  document.getElementById('modal-ajustes-letra').hidden = true;
}

function restablecerLetra() {
  const predet = copiaTipografiaPredeterminada();
  guardarTipografia(predet);
  aplicarTipografia(predet);
  rellenarFormularioLetra(predet);

  guardarFormatoTexto(FORMATO_TEXTO_PREDETERMINADO);
  rellenarFormatoTexto(FORMATO_TEXTO_PREDETERMINADO);
  renderCartelitos();
}

// ---------- Formato del texto al imprimir (mayúsculas / capitalizado) ----------
//
// El nombre del plato se guarda en la hoja tal cual lo escribe el usuario
// (p.ej. "Lomo a la Plancha" o "LOMO A LA PLANCHA", da igual), pero a la
// hora de pintar los cartelitos para imprimir se homogeniza según esta
// opción, para que todos los cartelitos salgan con el mismo estilo aunque
// los platos se hayan escrito de formas distintas. Vale tanto para español
// como para inglés. No afecta a la lista de "Platos" (ahí se ve el texto
// real tal cual está guardado, para poder editarlo con comodidad).

const FORMATO_TEXTO_PREDETERMINADO = 'mayusculas'; // por defecto: todo en mayúsculas

// Palabras que se dejan en minúscula al "Capitalizar" (artículos,
// preposiciones y conjunciones cortas, en español e inglés), salvo que sean
// la primera o la última palabra del nombre, que siempre se capitalizan.
const PALABRAS_MINUSCULAS_CAPITALIZADO = new Set([
  // Español
  'a', 'al', 'ante', 'con', 'contra', 'de', 'del', 'desde', 'en', 'entre',
  'hacia', 'hasta', 'para', 'por', 'segun', 'según', 'sin', 'sobre', 'tras',
  'y', 'o', 'u', 'e', 'la', 'las', 'el', 'los', 'un', 'una', 'unos', 'unas',
  'que', 'lo',
  // Inglés
  'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'as', 'nor', 'so', 'yet', 'up'
]);

// Convierte p.ej. "LOMO A LA PLANCHA" o "lomo a la plancha" en
// "Lomo a la Plancha" (nunca "Lomo A La Plancha"): primera letra en
// mayúscula en cada palabra "importante", y en minúscula en los artículos y
// preposiciones cortas (excepto si son la primera o la última palabra).
function capitalizarTexto(texto) {
  const palabras = texto.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return palabras
    .map((palabra, i) => {
      const esExtremo = i === 0 || i === palabras.length - 1;
      if (!esExtremo && PALABRAS_MINUSCULAS_CAPITALIZADO.has(palabra)) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(' ');
}

// Aplica el formato elegido a un nombre de plato (español o inglés) para
// mostrarlo en los cartelitos.
function aplicarFormatoNombre(texto, formato) {
  if (!texto) return texto;
  if (formato === 'capitalizado') return capitalizarTexto(texto);
  return texto.toUpperCase(); // 'mayusculas' (predeterminado) y cualquier valor desconocido
}

function getFormatoTexto() {
  try {
    const raw = localStorage.getItem(LS_FORMATO_TEXTO);
    return raw === 'capitalizado' ? 'capitalizado' : FORMATO_TEXTO_PREDETERMINADO;
  } catch (e) {
    return FORMATO_TEXTO_PREDETERMINADO;
  }
}

function guardarFormatoTexto(formato) {
  localStorage.setItem(LS_FORMATO_TEXTO, formato);
}

function rellenarFormatoTexto(formato) {
  document.getElementById('formato-mayusculas').checked = formato === 'mayusculas';
  document.getElementById('formato-capitalizado').checked = formato === 'capitalizado';
}

// Se llama al cambiar la opción en el modal: guarda la preferencia y
// refresca al momento la vista previa de los cartelitos.
function leerYAplicarFormatoTexto() {
  const marcado = document.querySelector('input[name="formato-texto"]:checked');
  const formato = marcado ? marcado.value : FORMATO_TEXTO_PREDETERMINADO;
  guardarFormatoTexto(formato);
  renderCartelitos();
}

// ---------- Cambios "optimistas" (altas/ediciones/bajas locales mientras el CSV se actualiza) ----------
//
// Como guardar en la hoja va en modo "no-cors" no podemos confirmar si de verdad
// se aplicó, y el CSV publicado tarda unos minutos en refrescarse. Por eso se
// guarda aquí lo que el usuario acaba de cambiar y se aplica por encima de lo
// que venga del CSV en cada carga, hasta que caduca (asumiendo que para entonces
// el CSV ya lo refleja de verdad).

function getConTTL(clave) {
  try {
    const raw = localStorage.getItem(clave);
    const lista = raw ? JSON.parse(raw) : [];
    const ahora = Date.now();
    const vigentes = lista.filter(p => ahora - p._ts < PENDIENTE_TTL_MS);
    if (vigentes.length !== lista.length) localStorage.setItem(clave, JSON.stringify(vigentes));
    return vigentes;
  } catch (e) {
    return [];
  }
}

function getPendientes() { return getConTTL(LS_PENDIENTES); }
function getBorrados() { return getConTTL(LS_BORRADOS); }

function guardarPendiente(plato) {
  const lista = getPendientes().filter(p => p.id !== plato.id);
  lista.push({ ...plato, _ts: Date.now() });
  localStorage.setItem(LS_PENDIENTES, JSON.stringify(lista));
  // si se había marcado como borrado y ahora se vuelve a guardar, ya no debe ocultarse
  quitarBorrado(plato.id);
}

function quitarPendiente(id) {
  localStorage.setItem(LS_PENDIENTES, JSON.stringify(getPendientes().filter(p => p.id !== id)));
}

function anadirBorrado(id) {
  const lista = getBorrados().filter(b => b.id !== id);
  lista.push({ id, _ts: Date.now() });
  localStorage.setItem(LS_BORRADOS, JSON.stringify(lista));
  quitarPendiente(id);
}

function quitarBorrado(id) {
  localStorage.setItem(LS_BORRADOS, JSON.stringify(getBorrados().filter(b => b.id !== id)));
}

function aplicarPendientes(listaPlatos) {
  const porId = new Map(listaPlatos.map(p => [p.id, p]));
  getPendientes().forEach(({ _ts, ...p }) => porId.set(p.id, p));
  getBorrados().forEach(b => porId.delete(b.id));
  return [...porId.values()];
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
    .map((fila, i) => {
      // Si la columna ID falta o no es un número (p.ej. una fila añadida a
      // mano en la hoja sin rellenarla), se usa i+1 como id de repuesto.
      // Importante no dejar pasar un NaN: como los platos se indexan por id
      // en un Map (altas/ediciones/borrados pendientes), varias filas con
      // id NaN colisionarían entre sí y solo sobreviviría la última.
      const idBruto = idxId !== -1 ? Number(fila[idxId]) : NaN;
      return {
        id: Number.isFinite(idBruto) ? idBruto : i + 1,
        categoria: String(fila[idxCategoria] || '').trim(),
        nombre_es: String(fila[idxEs] || '').trim(),
        nombre_en: idxEn !== -1 ? String(fila[idxEn] || '').trim() : ''
      };
    })
    .filter(p => p.nombre_es !== '');
}

async function cargarPlatos() {
  const estado = document.getElementById('estado-carga');
  const aviso = document.getElementById('aviso-config');

  if (!CONFIG.CSV_URL || CONFIG.CSV_URL.includes('PEGA_AQUI')) {
    aviso.hidden = false;
    aviso.textContent = '⚠️ Falta configurar CSV_URL en js/config.js con el enlace de "Publicar en la web" de tu Google Sheet.';
    estado.hidden = true;
    platos = aplicarPendientes([]);
    renderTodo();
    return;
  }

  try {
    // "&zx=" rompe la caché intermedia; sin cabeceras extra para no disparar un preflight CORS.
    const resp = await fetch(CONFIG.CSV_URL + (CONFIG.CSV_URL.includes('?') ? '&' : '?') + 'zx=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error('Error HTTP ' + resp.status);
    const texto = await resp.text();
    const filas = parseCSV(texto);
    platos = aplicarPendientes(filasAPlatos(filas));
    aviso.hidden = true;
  } catch (err) {
    aviso.hidden = false;
    aviso.textContent = '⚠️ No se pudo leer la Google Sheet (' + err.message + '). Comprueba CSV_URL en js/config.js.';
    platos = aplicarPendientes(platos);
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
        nodo.querySelector('.btn-editar-plato').addEventListener('click', () => abrirModalEditarPlato(plato));
        nodo.querySelector('.btn-borrar-plato').addEventListener('click', () => borrarPlato(plato));
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
//
// Los cartelitos se imprimen en hojas A4, y cada cartelito debe salir
// siempre con el mismo tamaño (como en la plantilla de muestra: 2 columnas
// x 4 filas = 8 cartelitos por hoja). Por eso aquí no se pinta una única
// rejilla larga, sino que se trocea la selección en grupos de 8 y cada
// grupo se pinta como su propia "hoja" — así el salto de página en la
// impresión cae siempre justo entre un grupo de 8 y el siguiente, nunca a
// mitad de un cartelito ni descuadrando el tamaño de las casillas.
const CARTELITOS_POR_HOJA = 8; // 2 columnas x 4 filas, igual que la plantilla en A4

function renderCartelitos() {
  const contenedor = document.getElementById('cartelitos-paginas');
  const mensajeVacio = document.getElementById('cartelitos-vacio-msg');
  const tpl = document.getElementById('tpl-cartelito');
  contenedor.innerHTML = '';

  const seleccionados = platos
    .filter(p => seleccion.has(p.id))
    .sort((a, b) => {
      const ordenCat = categoriasOrdenadas();
      const diff = ordenCat.indexOf(a.categoria) - ordenCat.indexOf(b.categoria);
      if (diff !== 0) return diff;
      return a.nombre_es.localeCompare(b.nombre_es, 'es');
    });

  mensajeVacio.hidden = seleccionados.length > 0;

  for (let inicio = 0; inicio < seleccionados.length; inicio += CARTELITOS_POR_HOJA) {
    const grupo = seleccionados.slice(inicio, inicio + CARTELITOS_POR_HOJA);
    const esUltimaHoja = inicio + CARTELITOS_POR_HOJA >= seleccionados.length;

    // Envuelve la etiqueta + la rejilla de esta hoja en un mismo bloque para
    // que en pantalla mantengan la proporción real de un A4 vertical (y no
    // se estiren a lo ancho de toda la pantalla como si fuera horizontal).
    const wrapper = document.createElement('div');
    wrapper.className = 'pagina-wrapper';

    const etiqueta = document.createElement('div');
    etiqueta.className = 'pagina-etiqueta no-print';
    etiqueta.textContent = `Hoja ${Math.floor(inicio / CARTELITOS_POR_HOJA) + 1} (A4)`;
    wrapper.appendChild(etiqueta);

    const hoja = document.createElement('div');
    hoja.className = 'cartelitos-grid pagina-cartelitos' + (esUltimaHoja ? ' pagina-final' : '');

    const formatoTexto = getFormatoTexto();
    grupo.forEach(plato => {
      const nodo = tpl.content.cloneNode(true);
      nodo.querySelector('.cartelito-es').textContent = aplicarFormatoNombre(plato.nombre_es, formatoTexto);
      nodo.querySelector('.cartelito-en').textContent = aplicarFormatoNombre(plato.nombre_en || '', formatoTexto);
      hoja.appendChild(nodo);
    });

    wrapper.appendChild(hoja);
    contenedor.appendChild(wrapper);
  }
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
//
// En vez de rellenar el inglés a ciegas con una única traducción, se le pide
// a Gemini varias alternativas con estilos distintos (literal, breve tipo
// carta, formal) y se muestran como opciones para que el usuario elija la
// que más le convenza (o edite el campo a mano).

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseOpcionesTraduccion(texto) {
  if (!texto) return [];
  // Gemini a veces envuelve el JSON en un bloque de código ```json ... ```
  const limpio = texto.replace(/```json|```/g, '').trim();
  const match = limpio.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(o => o && typeof o.texto === 'string' && o.texto.trim())
      .map(o => ({
        estilo: (o.estilo || '').toString().trim(),
        texto: o.texto.trim().replace(/^"|"$/g, '').replace(/\.$/, '')
      }));
  } catch (e) {
    return [];
  }
}

async function traducirVariantesConGemini(nombreEs, categoria) {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error('No hay ninguna clave de Gemini configurada. Pulsa "⚙️ Traducción" para añadir una.');
  }

  const prompt = 'Traduce al inglés el siguiente nombre de un plato de buffet/restaurante, ' +
    'pensado para un cartelito de menú. Categoría: "' + categoria + '". ' +
    'Nombre en español: "' + nombreEs + '". ' +
    'Dame EXACTAMENTE 3 alternativas de traducción, con estilos distintos: ' +
    '1) literal y neutra, tal cual describe el plato; ' +
    '2) breve, como se vería en la carta de un restaurante; ' +
    '3) más formal o gastronómica. ' +
    'Evita traducciones "creativas" que cambien el nombre del plato por otro plato distinto ' +
    '(por ejemplo, no traduzcas un jalapeño relleno como "jalapeño poppers"; describe lo que es). ' +
    'Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni bloques de código, ' +
    'con este formato exacto: ' +
    '[{"estilo":"Literal","texto":"..."},{"estilo":"Breve","texto":"..."},{"estilo":"Formal","texto":"..."}]';

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
      const opciones = parseOpcionesTraduccion(texto);
      if (opciones.length) return opciones;
      ultimoError = 'Respuesta de Gemini sin opciones válidas.';
    } catch (err) {
      ultimoError = err.message;
    }
  }

  throw new Error(ultimoError || 'No se pudo traducir.');
}

function renderOpcionesTraduccion(opciones) {
  const cont = document.getElementById('opciones-traduccion');
  cont.innerHTML = '';

  if (!opciones.length) {
    cont.hidden = true;
    return;
  }

  const titulo = document.createElement('div');
  titulo.className = 'opciones-traduccion-titulo';
  titulo.textContent = 'Elige una opción (o edita el campo a mano):';
  cont.appendChild(titulo);

  opciones.forEach(op => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'opcion-traduccion';
    chip.innerHTML = `<strong>${escapeHtml(op.texto)}</strong>` +
      (op.estilo ? `<span>${escapeHtml(op.estilo)}</span>` : '');
    chip.addEventListener('click', () => {
      document.getElementById('nuevo-nombre-en').value = op.texto;
      cont.querySelectorAll('.opcion-traduccion').forEach(c => c.classList.remove('seleccionada'));
      chip.classList.add('seleccionada');
    });
    cont.appendChild(chip);
  });

  cont.hidden = false;
}

function ocultarOpcionesTraduccion() {
  const cont = document.getElementById('opciones-traduccion');
  cont.hidden = true;
  cont.innerHTML = '';
}

async function mostrarOpcionesTraduccionClick() {
  const errorBox = document.getElementById('form-nuevo-plato-error');
  errorBox.hidden = true;

  const nombreEs = document.getElementById('nuevo-nombre-es').value.trim();
  const categoria = document.getElementById('nuevo-categoria').value;

  if (!nombreEs) {
    errorBox.textContent = 'Escribe primero el nombre del plato en español.';
    errorBox.hidden = false;
    document.getElementById('nuevo-nombre-es').focus();
    return;
  }

  const btn = document.getElementById('btn-ver-opciones-traduccion');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Traduciendo...';
  ocultarOpcionesTraduccion();

  try {
    const opciones = await traducirVariantesConGemini(nombreEs, categoria);
    renderOpcionesTraduccion(opciones);
  } catch (err) {
    errorBox.textContent = 'No se pudieron generar opciones de traducción: ' + err.message;
    errorBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
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

// ---------- Modal: añadir / editar plato ----------

function llenarSelectCategorias(categoriaPreseleccionada) {
  const select = document.getElementById('nuevo-categoria');
  select.innerHTML = '';
  categoriasOrdenadas().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
  if (categoriaPreseleccionada) select.value = categoriaPreseleccionada;
}

function abrirModalNuevoPlato(categoriaPreseleccionada) {
  platoEditandoId = null;
  document.getElementById('modal-nuevo-plato-titulo').textContent = 'Añadir plato nuevo';
  document.getElementById('btn-guardar-nuevo').textContent = 'Guardar plato';
  llenarSelectCategorias(categoriaPreseleccionada);

  document.getElementById('nuevo-nombre-es').value = '';
  document.getElementById('nuevo-nombre-en').value = '';
  document.getElementById('form-nuevo-plato-error').hidden = true;
  ocultarOpcionesTraduccion();
  document.getElementById('modal-nuevo-plato').hidden = false;
  document.getElementById('nuevo-nombre-es').focus();
}

function abrirModalEditarPlato(plato) {
  platoEditandoId = plato.id;
  document.getElementById('modal-nuevo-plato-titulo').textContent = 'Editar plato';
  document.getElementById('btn-guardar-nuevo').textContent = 'Guardar cambios';
  llenarSelectCategorias(plato.categoria);

  document.getElementById('nuevo-nombre-es').value = plato.nombre_es;
  document.getElementById('nuevo-nombre-en').value = plato.nombre_en || '';
  document.getElementById('form-nuevo-plato-error').hidden = true;
  ocultarOpcionesTraduccion();
  document.getElementById('modal-nuevo-plato').hidden = false;
  document.getElementById('nuevo-nombre-es').focus();
}

function cerrarModalNuevoPlato() {
  document.getElementById('modal-nuevo-plato').hidden = true;
  ocultarOpcionesTraduccion();
  platoEditandoId = null;
}

function siguienteId() {
  const idsLocales = platos.map(p => p.id).filter(id => !isNaN(id));
  const idsPendientes = getPendientes().map(p => p.id).filter(id => !isNaN(id));
  const todos = [...idsLocales, ...idsPendientes];
  return todos.length ? Math.max(...todos) + 1 : 1;
}

// Envía un alta o una edición al Apps Script en modo "no-cors" (sin poder leer
// la respuesta) y actualiza la vista al momento con el resultado esperado.
function guardarPlatoRemoto(accion, plato) {
  fetch(CONFIG.WEBAPP_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: accion, ...plato })
  }).catch(() => { /* no-cors: los errores de red reales igualmente no se pueden leer */ });

  guardarPendiente(plato);

  const idx = platos.findIndex(p => p.id === plato.id);
  if (idx !== -1) platos[idx] = plato;
  else platos.push(plato);
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
  const esEdicion = platoEditandoId !== null;

  const btnGuardar = document.getElementById('btn-guardar-nuevo');
  btnGuardar.disabled = true;

  try {
    if (!nombreEn) {
      btnGuardar.textContent = 'Traduciendo...';
      const opciones = await traducirVariantesConGemini(nombreEs, categoria);
      if (!opciones.length) throw new Error('No se pudo traducir.');
      // Si el usuario no ha elegido ninguna opción a mano, se usa la primera
      // (la traducción literal/neutra) como valor por defecto.
      nombreEn = opciones[0].texto;
    }

    btnGuardar.textContent = 'Guardando...';
    const plato = { id: esEdicion ? platoEditandoId : siguienteId(), categoria, nombre_es: nombreEs, nombre_en: nombreEn };

    guardarPlatoRemoto(esEdicion ? 'update' : 'add', plato);

    if (!esEdicion) seleccion.add(plato.id);
    guardarSeleccion(seleccion);

    cerrarModalNuevoPlato();
    renderTodo();
  } catch (err) {
    errorBox.textContent = 'No se pudo guardar el plato: ' + err.message;
    errorBox.hidden = false;
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = esEdicion ? 'Guardar cambios' : 'Guardar plato';
  }
}

// ---------- Borrar plato ----------

function borrarPlato(plato) {
  if (!CONFIG.WEBAPP_URL || CONFIG.WEBAPP_URL.includes('PEGA_AQUI')) {
    alert('Falta configurar WEBAPP_URL en js/config.js con la URL del Apps Script.');
    return;
  }
  if (!confirm(`¿Borrar "${plato.nombre_es}" de la carta? Esta acción no se puede deshacer.`)) return;

  fetch(CONFIG.WEBAPP_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id: plato.id })
  }).catch(() => { /* no-cors: los errores de red reales igualmente no se pueden leer */ });

  anadirBorrado(plato.id);
  platos = platos.filter(p => p.id !== plato.id);
  seleccion.delete(plato.id);
  guardarSeleccion(seleccion);
  renderTodo();
}

// ---------- Inicialización ----------

document.addEventListener('DOMContentLoaded', () => {
  aplicarTipografia(getTipografia());

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
  document.getElementById('btn-ver-opciones-traduccion').addEventListener('click', mostrarOpcionesTraduccionClick);

  document.getElementById('btn-ajustes-letra').addEventListener('click', abrirModalLetra);
  document.getElementById('btn-cerrar-ajustes-letra').addEventListener('click', cerrarModalLetra);
  document.getElementById('btn-restablecer-letra').addEventListener('click', restablecerLetra);
  ['fuente-es', 'tamano-es', 'fuente-en', 'tamano-en'].forEach(id => {
    document.getElementById(id).addEventListener('input', leerYAplicarFormularioLetra);
  });
  ['formato-mayusculas', 'formato-capitalizado'].forEach(id => {
    document.getElementById(id).addEventListener('change', leerYAplicarFormatoTexto);
  });

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
