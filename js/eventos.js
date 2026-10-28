// Eventos: listas de platos guardadas con nombre (en la pestaña "Eventos" de la Google Sheet).

let eventos = [];

function urlWebApp() {
  return CONFIG.WEBAPP_URL && !CONFIG.WEBAPP_URL.includes('PEGA_AQUI') ? CONFIG.WEBAPP_URL : null;
}

function guardarEventoRemoto(nombre, ids) {
  const url = urlWebApp();
  if (!url) return;
  fetch(url, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'saveEvento', nombre, ids })
  }).catch(() => {});
  const i = eventos.findIndex(e => e.nombre.toLowerCase() === nombre.toLowerCase());
  const ev = { nombre, fecha: new Date().toISOString(), ids };
  if (i === -1) eventos.push(ev); else eventos[i] = ev;
}

async function cargarEventos() {
  const url = urlWebApp();
  if (!url) throw new Error('Falta configurar WEBAPP_URL.');
  const resp = await fetch(url + '?action=eventos&zx=' + Date.now(), { cache: 'no-store' });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'Error al leer eventos');
  // lo guardado hace un momento (aún no reflejado) prevalece sobre lo leído
  const locales = eventos;
  eventos = data.eventos;
  locales.forEach(l => { if (!eventos.some(e => e.nombre.toLowerCase() === l.nombre.toLowerCase())) eventos.push(l); });
}

function msgEventos(t) {
  const m = document.getElementById('eventos-msg');
  m.textContent = t || '';
  m.hidden = !t;
}

function renderEventos() {
  const cont = document.getElementById('eventos-lista');
  cont.innerHTML = '';
  if (!eventos.length) { cont.textContent = 'Aún no hay eventos guardados.'; return; }
  [...eventos].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).forEach(ev => {
    const existentes = ev.ids.filter(id => platos.some(p => p.id === id));
    const fila = document.createElement('div');
    fila.className = 'evento-fila';
    const nom = document.createElement('span');
    nom.className = 'evento-nombre';
    nom.textContent = `${ev.nombre} (${existentes.length} platos)`;
    const bCargar = document.createElement('button');
    bCargar.className = 'btn secundario pequeno';
    bCargar.textContent = 'Cargar';
    bCargar.addEventListener('click', () => {
      seleccion = new Set(existentes);
      guardarSeleccion(seleccion);
      listaCartelitosInicializada = false;
      renderTodo();
      document.getElementById('modal-eventos').hidden = true;
      activarTab('cartelitos');
    });
    const bBorrar = document.createElement('button');
    bBorrar.className = 'btn secundario pequeno';
    bBorrar.textContent = '🗑️';
    bBorrar.addEventListener('click', () => {
      if (!confirm(`¿Borrar el evento "${ev.nombre}"? (los platos no se borran)`)) return;
      fetch(urlWebApp(), { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteEvento', nombre: ev.nombre }) }).catch(() => {});
      eventos = eventos.filter(e => e !== ev);
      renderEventos();
    });
    fila.append(nom, bCargar, bBorrar);
    cont.appendChild(fila);
  });
}

async function abrirModalEventos() {
  document.getElementById('modal-eventos').hidden = false;
  document.getElementById('evento-nuevo-nombre').value = '';
  msgEventos('');
  document.getElementById('eventos-lista').textContent = 'Cargando...';
  try { await cargarEventos(); } catch (e) { msgEventos('No se pudieron leer los eventos: ' + e.message); }
  renderEventos();
}

function guardarSeleccionComoEvento() {
  const nombre = document.getElementById('evento-nuevo-nombre').value.trim();
  if (!nombre) { msgEventos('Escribe un nombre para el evento.'); return; }
  if (!seleccion.size) { msgEventos('No hay ningún plato seleccionado.'); return; }
  guardarEventoRemoto(nombre, [...seleccion]);
  document.getElementById('evento-nuevo-nombre').value = '';
  msgEventos('Guardado.');
  renderEventos();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-eventos').addEventListener('click', abrirModalEventos);
  document.getElementById('btn-cerrar-eventos').addEventListener('click', () => { document.getElementById('modal-eventos').hidden = true; });
  document.getElementById('btn-guardar-evento').addEventListener('click', guardarSeleccionComoEvento);
});
