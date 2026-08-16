/**
 * CARTELITOS BUFFET — backend en Google Apps Script
 * -----------------------------------------------------------------
 * Este script se pega en el editor de Apps Script de tu Google Sheet
 * (Extensiones > Apps Script) y se publica como "Aplicación web".
 *
 * Expone:
 *   GET  ?         -> devuelve todos los platos en JSON
 *   POST { action: "add", categoria, nombre_es, nombre_en, pin }
 *                   -> añade un plato nuevo (traduce con Gemini si
 *                      nombre_en viene vacío) y lo guarda en la hoja
 *
 * CONFIGURACIÓN NECESARIA (una sola vez):
 *   1. Abre Extensiones > Propiedades del proyecto > Propiedades del script
 *      y añade:
 *        GEMINI_API_KEY  -> tu clave de la API de Gemini
 *        ADMIN_PIN       -> un PIN corto (ej. "1234") para poder
 *                           añadir platos nuevos desde la web
 *   2. Implementar > Nueva implementación > Tipo: Aplicación web
 *        - Ejecutar como: Yo
 *        - Quién tiene acceso: Cualquier usuario
 *   3. Copia la URL de la aplicación web resultante en js/config.js
 */

const SHEET_NAME = 'Platos';

// ---------- Helpers ----------

function getSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetToDishes_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1); // quita cabecera
  return rows
    .filter(r => r[0] !== '' && r[0] !== null)
    .map(r => ({
      id: r[0],
      categoria: r[1],
      nombre_es: r[2],
      nombre_en: r[3]
    }));
}

function nextId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat()
    .filter(v => v !== '' && v !== null)
    .map(Number);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

// ---------- Traducción con Gemini ----------

function translateToEnglish_(nombreEs, categoria) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Falta GEMINI_API_KEY en las propiedades del script');
  }

  const url = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + apiKey;

  const prompt = 'Traduce al inglés el siguiente nombre de un plato de buffet/restaurante ' +
    'para un cartelito de menú. Categoría: "' + categoria + '". ' +
    'Nombre en español: "' + nombreEs + '". ' +
    'Responde ÚNICAMENTE con el nombre traducido en inglés, tal y como se escribiría ' +
    'en un cartelito (sin comillas, sin punto final, sin explicaciones).';

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const data = JSON.parse(response.getContentText());
  const text = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

  if (!text) {
    throw new Error('No se pudo traducir con Gemini: ' + response.getContentText());
  }

  return text.trim().replace(/^"|"$/g, '');
}

// ---------- Endpoints ----------

function doGet(e) {
  return jsonOut_({ ok: true, platos: sheetToDishes_() });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'add') {
      return handleAdd_(body);
    }

    return jsonOut_({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function handleAdd_(body) {
  const props = PropertiesService.getScriptProperties();
  const adminPin = props.getProperty('ADMIN_PIN');
  if (adminPin && body.pin !== adminPin) {
    return jsonOut_({ ok: false, error: 'PIN incorrecto' });
  }

  const categoria = (body.categoria || '').trim();
  const nombreEs = (body.nombre_es || '').trim();
  let nombreEn = (body.nombre_en || '').trim();

  if (!categoria || !nombreEs) {
    return jsonOut_({ ok: false, error: 'Categoría y nombre en español son obligatorios' });
  }

  if (!nombreEn) {
    nombreEn = translateToEnglish_(nombreEs, categoria);
  }

  const sheet = getSheet_();
  const id = nextId_(sheet);
  sheet.appendRow([id, categoria, nombreEs, nombreEn]);

  return jsonOut_({
    ok: true,
    plato: { id: id, categoria: categoria, nombre_es: nombreEs, nombre_en: nombreEn }
  });
}
