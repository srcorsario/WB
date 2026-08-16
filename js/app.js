/* Cartelitos Buffet — lógica de la web
 * -----------------------------------------------------------------
 * - Lee los platos desde el Apps Script conectado a la Google Sheet
 *   (ver CONFIG.SHEET_WEBAPP_URL en config.js).
 * - Si esa URL todavía no está configurada, o falla la conexión,
 *   la web arranca en "modo demo" con unos platos de ejemplo para
 *   que puedas ver cómo funciona mientras terminas de configurarla.
 * - La selección de hoy se guarda en el navegador (localStorage).
 */

const LS_SELECCION = 'cartelitos-seleccion';
const LS_PIN = 'cartelitos-pin';

const DEMO_PLATOS = [
  { id: 1, categoria: 'Entrantes', nombre_es: 'Coca de pimientos', nombre_en: 'Pepper flatbread' },
  { id: 2, categoria: 'Entrantes', nombre_es: 'Coca de pimientos con cerdo', nombre_en: 'Pepper flatbread with pork' },
  { id: 3, categoria: 'Entrantes', nombre_es: 'Jalapeños rellenos de queso', nombre_en: 'Cheese stuffed peppers' },
  { id: 4, categoria: 'Verduras', nombre_es: 'Calabacín', nombre_en: 'Zucchini' },
  { id: 5, categoria: 'Verduras', nombre_es: 'Berenjena', nombre_en: 'Eggplant' },
  { id: 6, categoria: 'Verduras', nombre_es: 'Zanahoria', nombre_en: 'Carrot' },
  { id: 7, categoria: 'Verduras', nombre_es: 'Verduras a la plancha', nombre_en: 'Grilled vegetables' },
  { id: 8, categoria: 'Verduras', nombre_es: 'Patatas asadas', nombre_en: 'Roasted potatoes' },
  { id: 9, categoria: 'Verduras', nombre_es: 'Brócoli', nombre_en: 'Broccoli' },
  { id: 10, categoria: 'Pescados', nombre_es: 'Caella a la plancha', nombre_en: 'Grilled caella fish' },
  { id: 11, categoria: 'Carnes', nombre_es: 'Estofado de cerdo', nombre_en: 'Pork stew' },
  { id: 12, categoria: 'Arroces y Pastas', nombre_es: 'Noodles con verdura', nombre_en: 'Noodles with vegetables' },
  { id: 13, categoria: 'Arroces y Pastas', nombre_es: 'Arroz con verdura', nombre_en: 'Rice with vegetables' },
  { id: 14, categoria: 'Salsas', nombre_es: 'Salsa Alfredo', nombre_en: 'Alfredo sauce' },
  { id: 15, categoria: 'Postres', nombre_es: 'Tarta de Oreo', nombre_en: 'Oreo cake' },
  { id: 16, categoria: 'Postres', nombre_es: 'Vasito de flan', nombre_en: 'Flan cup' },
  { id: 17, categoria: 'Postres', nombre_es: 'Tarta de mango', nombre_en: 'Mango tart' },
  { id: 18, categoria: 'Postres', nombre_es: 'Tarta de limón', nombre_en: 'Lemon pie' },
  { id: 19, categoria: 'Bebidas', nombre_es: 'Smoothie de piña', nombre_en: 'Pineapple smoothie' }
];

let platos = [];
let modoDemo = false;

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

// ---------- Carga de datos ----------

async function cargarPlatos() {
  const url = CONFIG.SHEET_WEBAPP_URL;
  const estado = document.getElementById('estado-carga');
  const aviso = document.getElementById('aviso-config');

  if (!url || url.includes('PEGA_AQUI')) {
    modoDemo = true;
    platos = DEMO_PLATOS;
    aviso.hidden = false;
    aviso.textContent = '⚠️ Modo demo: configura SHEET_WEBAPP_URL en js/config.js para conectar tu Google Sheet real.';
    estado.hidden = true;
    renderTodo();
    return;
  }

  try {
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Respuesta no válida');
    platos = data.platos.map(p => ({ ...p, id: Number(p.id) }));
    modoDemo = false;
    aviso.hidden = true;
    estado.hidden = true;
  } catch (err) {
    modoDemo = true;
    platos = DEMO_PLATOS;
    aviso.hidden = false;
    aviso.textContent = '⚠️ No se pudo conectar con la Google Sheet (' + err.message + '). Mostrando modo demo.';
    estado.hidden = true;
  }

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
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === nombre));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + nombre));
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
  document.getElementById('nuevo-pin').value = localStorage.getItem(LS_PIN) || '';
  document.getElementById('form-nuevo-plato-error').hidden = true;
  modal.hidden = false;
  document.getElementById('nuevo-nombre-es').focus();
}

function cerrarModalNuevoPlato() {
  document.getElementById('modal-nuevo-plato').hidden = true;
}

async function enviarNuevoPlato(ev) {
  ev.preventDefault();

  const errorBox = document.getElementById('form-nuevo-plato-error');
  errorBox.hidden = true;

  if (modoDemo) {
    errorBox.textContent = 'Estás en modo demo: conecta primero tu Google Sheet (SHEET_WEBAPP_URL) para poder guardar platos nuevos.';
    errorBox.hidden = false;
    return;
  }

  const categoria = document.getElementById('nuevo-categoria').value;
  const nombreEs = document.getElementById('nuevo-nombre-es').value.trim();
  const nombreEn = document.getElementById('nuevo-nombre-en').value.trim();
  const pin = document.getElementById('nuevo-pin').value.trim();

  const btnGuardar = document.getElementById('btn-guardar-nuevo');
  btnGuardar.disabled = true;
  btnGuardar.textContent = nombreEn ? 'Guardando...' : 'Traduciendo y guardando...';

  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'add', categoria, nombre_es: nombreEs, nombre_en: nombreEn, pin })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al guardar');

    platos.push({ ...data.plato, id: Number(data.plato.id) });
    seleccion.add(Number(data.plato.id));
    guardarSeleccion(seleccion);
    if (pin) localStorage.setItem(LS_PIN, pin);

    cerrarModalNuevoPlato();
    renderTodo();
  } catch (err) {
    errorBox.textContent = 'No se pudo guardar: ' + err.message;
    errorBox.hidden = false;
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar plato';
  }
}

// ---------- Inicialización ----------

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn').forEach(btn => {
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

  cargarPlatos();
});
