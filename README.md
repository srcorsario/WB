# Cartelitos Buffet

Web para gestionar y generar los cartelitos (español + inglés) de los platos del buffet, con los platos guardados en una Google Sheet.

## Cómo funciona

- **Pestaña "Platos"**: todos los platos de la Google Sheet, agrupados por categoría (Ensaladas, Entrantes, Verduras, Pescados, Carnes, Arroces y Pastas, Salsas, Postres, Bebidas). Marcas con el check los que vas a servir hoy.
- **Pestaña "Cartelitos"**: muestra automáticamente los platos marcados, con su nombre en español (arriba, en negrita) y su traducción en inglés (debajo), listos para imprimir con el botón "Imprimir / Guardar PDF" (usa el diálogo de impresión del navegador; en "Destino" eliges tu impresora o "Guardar como PDF").
- **Añadir plato nuevo**: desde el botón "+ Añadir plato" de cualquier categoría. Si dejas el nombre en inglés vacío, se traduce automáticamente con Gemini y se guarda en la Google Sheet.
- La selección de "hoy" se guarda en el navegador (no en la hoja), así que cada dispositivo tiene su propia selección. Usa "Vaciar selección de hoy" para empezar de cero.

---

## Puesta en marcha (una sola vez)

### 1. Crear la Google Sheet

1. Crea una Google Sheet nueva y ponle el nombre que quieras (ej. "Cartelitos Buffet").
2. Renombra la primera hoja/pestaña a **`Platos`** (exactamente así, respetando mayúscula).
3. Importa el archivo `data/platos_iniciales.csv` incluido en este proyecto: Archivo > Importar > Subir > selecciona el CSV > "Reemplazar hoja actual".
   - Esto te deja ya cargados los platos que aparecían en tu plantilla de ejemplo, organizados por categoría, como punto de partida. Añade el resto de tu carta manualmente en la hoja (o luego desde la propia web).
4. La hoja debe tener 4 columnas: `ID | Categoria | Nombre_ES | Nombre_EN`.

### 2. Conectar Google Apps Script (para leer y añadir platos desde la web)

1. En la Google Sheet: **Extensiones > Apps Script**.
2. Borra el contenido de `Code.gs` que aparece por defecto y pega el contenido del archivo `apps-script/Code.gs` de este proyecto.
3. Guarda el proyecto (icono de disquete).
4. Ve a **Propiedades del proyecto > Propiedades del script** y añade dos propiedades:
   - `GEMINI_API_KEY` → tu clave de la API de Gemini (la misma que usabais con `generativelanguage.googleapis.com`).
   - `ADMIN_PIN` → un PIN corto que decidas (ej. `1234`). Se pedirá para poder añadir platos nuevos desde la web, para que no lo haga cualquiera que encuentre el enlace.
5. Arriba a la derecha, **Implementar > Nueva implementación**:
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo** (tu cuenta de Google).
   - Quién tiene acceso: **Cualquier usuario**.
6. Autoriza los permisos que te pida Google (es tu propio script, es normal que lo pida la primera vez).
7. Copia la **URL de la aplicación web** que te da (termina en `/exec`).

### 3. Configurar la web

1. Abre `js/config.js`.
2. Sustituye `PEGA_AQUI_TU_URL_DE_APPS_SCRIPT` por la URL que copiaste en el paso anterior.
3. Revisa la lista `CATEGORIAS` y ajústala si quieres otro orden o nombres.

### 4. Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público o privado; si es privado necesitas GitHub Pages en un plan que lo permita, si no, usa público).
2. Sube todo el contenido de esta carpeta al repositorio (por ejemplo arrastrando los archivos en la web de GitHub, o con `git add . && git commit -m "Cartelitos buffet" && git push`).
3. En el repositorio: **Settings > Pages**.
4. En "Source" elige la rama (normalmente `main`) y la carpeta raíz (`/`).
5. Guarda. GitHub te dará una URL tipo `https://tu-usuario.github.io/tu-repositorio/` en un par de minutos.

¡Listo! Cada día, entra en la web, marca los platos de hoy en "Platos" y pulsa "Imprimir / Guardar PDF" en "Cartelitos".

---

## Notas

- No hace falta clave ni cuenta de Google en el navegador de la web: la Sheet se lee y se escribe a través del Apps Script, que actúa de intermediario.
- El PIN de administración es una protección ligera para evitar que cualquiera con el enlace añada platos, no es una seguridad fuerte — no reutilices una contraseña importante como PIN.
- Si algún día quieres editar o borrar un plato ya existente, hazlo directamente en la Google Sheet (columnas `Categoria`, `Nombre_ES`, `Nombre_EN`); los cambios se verán en la web la próxima vez que cargue los datos (botón "Recargar de la hoja").
- Mientras `SHEET_WEBAPP_URL` no esté configurada (o si falla la conexión), la web arranca en "modo demo" con unos platos de ejemplo, para que puedas ver cómo funciona sin bloquear nada.
