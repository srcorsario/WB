// Configuración del sitio de cartelitos
//
// Sigue el mismo patrón que ya usáis en el editor de la carta (Web Editor
// Pro): lectura desde el CSV publicado de la Google Sheet (sin CORS, sin
// Apps Script de por medio) y escritura mediante un Apps Script en modo
// "no-cors" (petición de "solo ida", sin poder leer la respuesta).
//
// CSV_URL: Google Sheet > Archivo > Compartir > Publicar en la web >
//          formato CSV. Debe terminar en "output=csv".
// WEBAPP_URL: URL de la "Aplicación web" del Apps Script (apps-script/Code.gs),
//          termina en "/exec". Solo se usa para AÑADIR platos nuevos.
//
// Las claves de la API de Gemini NO se ponen aquí (este archivo acaba
// publicado tal cual en GitHub Pages, así que cualquiera podría verlas).
// Se añaden desde la propia web, en el botón "⚙️ Traducción" — se
// guardan solo en el navegador (localStorage), igual que en Web Editor Pro.

const CONFIG = {
  CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTdpZLG0yPVHJOIZAM0fLwvcNl02TztY_pHo27sHIUCy98LxTTiLdvS-faaZSa58ftSAI7e0H3Ys4mT/pub?output=csv',

  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbwfPPBrDU6iLt0XnzjbAwag5IHphUrTsM0Orb7MVYhQRsZ8AHcqxAC578mRFjiz83_9HQ/exec',

  GEMINI_ENDPOINT_URL: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',

  CATEGORIAS: [
    'Ensaladas',
    'Entrantes',
    'Sopas y Cremas',
    'Verduras',
    'Pescados',
    'Carnes',
    'Arroces y Pastas',
    'Salsas',
    'Postres',
    'Bebidas'
  ],

  // Sugerencias que se ofrecen al crear una categoría nueva desde "+ Añadir
  // plato" (botón "+ Crear categoría nueva..."). Las que ya estén en uso
  // (en CATEGORIAS de arriba o porque ya hay algún plato con esa categoría)
  // se ocultan automáticamente de esta lista. Se puede editar libremente:
  // añadir, quitar o reordenar no afecta a los platos ya guardados.
  CATEGORIAS_SUGERIDAS: [
    'Quesos',
    'Embutidos y Fiambres',
    'Panes',
    'Fruta',
    'Aperitivos',
    'Guarniciones',
    'Infusiones y Café',
    'Show Cooking'
  ]
};
