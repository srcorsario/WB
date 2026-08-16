// Configuración del sitio de cartelitos
//
// SHEET_WEBAPP_URL: pega aquí la URL de la "Aplicación web" que obtienes
// al implementar el Apps Script (apps-script/Code.gs). Debe terminar en
// "/exec". Mientras no la configures, la web mostrará un aviso.
//
// CATEGORIAS: el orden aquí define el orden en que aparecen las secciones
// en la pestaña "Platos". Debe coincidir con los valores que uses en la
// columna "Categoria" de la Google Sheet.

const CONFIG = {
  SHEET_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxfpQcmJYDIcTr6TQPACIk4yLkmyXrDoDUrP6DmSrj0_GsLPcPCVsSLOIK4LQCfrKfsjQ/exec',

  CATEGORIAS: [
    'Ensaladas',
    'Entrantes',
    'Verduras',
    'Pescados',
    'Carnes',
    'Arroces y Pastas',
    'Salsas',
    'Postres',
    'Bebidas'
  ]
};
