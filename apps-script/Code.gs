/**
 * CARTELITOS BUFFET — backend en Google Apps Script
 * -----------------------------------------------------------------
 * Sigue el mismo patrón que ya usáis en "Web Editor Pro": la web LEE
 * los platos directamente del CSV publicado de la Google Sheet (no
 * hace falta este script para eso), y solo usa este Apps Script para
 * AÑADIR platos nuevos — recibe la petición en modo "no-cors" (el
 * navegador la envía pero no puede leer la respuesta, así que este
 * script no necesita preocuparse de cabeceras CORS).
 *
 * La traducción al inglés se hace en el propio navegador (llamando a
 * Gemini con la clave que el usuario pega en la web), así que este
 * script ya NO necesita ninguna clave de API guardada aquí.
 *
 * Expone:
 *   GET  ?  -> mensaje de estado, solo para comprobar que el
 *              despliegue está activo y accesible ("Cualquier usuario")
 *   POST { action: "add", id, categoria, nombre_es, nombre_en }
 *              -> añade una fila nueva a la hoja "Platos"
 *
 * CONFIGURACIÓN (una sola vez):
 *   Implementar > Nueva implementación > Tipo: Aplicación web
 *     - Ejecutar como: Yo
 *     - Quién tiene acceso: Cualquier usuario
 *   Copia la URL resultante (termina en "/exec") en js/config.js (WEBAPP_URL).
 */

const SHEET_NAME = 'Platos';

function getSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nextId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat()
    .filter(v => v !== '' && v !== null)
    .map(Number);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

// GET solo sirve para comprobar en el navegador que el despliegue está
// vivo y accesible (abre la URL directamente: deberías ver este texto).
function doGet(e) {
  return ContentService
    .createTextOutput('Cartelitos Buffet: API activa. Usa POST para añadir platos.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === 'add') {
      const sheet = getSheet_();
      const categoria = (body.categoria || '').trim();
      const nombreEs = (body.nombre_es || '').trim();
      const nombreEn = (body.nombre_en || '').trim();

      if (!categoria || !nombreEs) {
        return jsonOut_({ ok: false, error: 'Categoría y nombre en español son obligatorios' });
      }

      const id = body.id || nextId_(sheet);
      sheet.appendRow([id, categoria, nombreEs, nombreEn]);
      return jsonOut_({ ok: true, plato: { id, categoria, nombre_es: nombreEs, nombre_en: nombreEn } });
    }

    return jsonOut_({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}
