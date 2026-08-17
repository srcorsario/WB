# Cartelitos Buffet

Web para gestionar y generar los cartelitos (español + inglés) de los platos del buffet, con los platos guardados en una Google Sheet.

Usa el mismo patrón que ya tenéis en el editor de la carta ("Web Editor Pro"): la web **lee** los platos directamente del CSV publicado de la Google Sheet (sin backend), y solo usa un pequeño Apps Script para **escribir** los platos nuevos, en modo "no-cors" (petición de solo ida). La traducción se hace llamando a Gemini desde el propio navegador, con claves que tú mismo pegas en la web y que se guardan solo ahí — nunca en el código que sube a GitHub.

## Cómo funciona

- **Pestaña "Platos"**: todos los platos de la Google Sheet, agrupados por categoría (Ensaladas, Entrantes, Verduras, Pescados, Carnes, Arroces y Pastas, Salsas, Postres, Bebidas). Marcas con el check los que vas a servir hoy.
- **Pestaña "Cartelitos"**: muestra automáticamente los platos marcados, con su nombre en español (arriba, en negrita) y su traducción en inglés (debajo), listos para imprimir con el botón "Imprimir / Guardar PDF". Se agrupan en hojas de 8 (2 columnas x 4 filas, tamaño A4), todos con el mismo tamaño exacto — igual que la plantilla original —, y cada hoja nueva empieza en una página distinta al imprimir.
- **"⚙️ Traducción"**: aquí pegas tus claves de la API de Gemini (puedes añadir varias; si una se queda sin cuota, la web prueba la siguiente automáticamente). Se guardan solo en este navegador.
- **Añadir plato nuevo**: desde el botón "+ Añadir plato" de cualquier categoría. Con el botón "🌐 Ver opciones" puedes pedirle a Gemini 3 alternativas de traducción (literal, breve tipo carta y formal/gastronómica) y elegir la que más te convenza con un clic — o escribir la tuya propia a mano. Si dejas el nombre en inglés vacío al guardar, se usa automáticamente la opción literal/neutra.
- **Editar (✏️) y borrar (🗑️)**: cada plato de la lista tiene sus dos botones a la derecha. Editar reutiliza el mismo formulario de "Añadir plato" (puedes cambiar categoría, nombre en español o inglés, o volver a dejar el inglés en blanco para que se retraduzca). Borrar pide confirmación y no se puede deshacer.
- La selección de "hoy" se guarda en el navegador (no en la hoja), así que cada dispositivo tiene su propia selección.

---

## Puesta en marcha (una sola vez)

### 1. Google Sheet

Ya tienes creada la hoja con la pestaña **`Platos`** (columnas `ID | Categoria | Nombre_ES | Nombre_EN`) y publicada como CSV (Archivo > Compartir > Publicar en la web > formato CSV). Esa URL ya viene puesta en `js/config.js` (`CSV_URL`). Si alguna vez creas la hoja de nuevo, repite ese paso y actualiza `CSV_URL`.

Para añadir o editar platos también puedes hacerlo directamente en la hoja en cualquier momento — la web los recogerá la próxima vez que cargue (el CSV publicado de Google tarda unos minutos en refrescarse tras cada cambio).

### 2. Apps Script (solo para poder añadir platos desde la web)

1. En la Google Sheet: **Extensiones > Apps Script**.
2. Borra el contenido del archivo por defecto (da igual que se llame `Code.gs`, `Código.gs` o cualquier otro nombre) y pega el contenido de `apps-script/Code.gs` de este proyecto.
3. Guarda.
4. **Implementar > Nueva implementación**:
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
5. Autoriza los permisos si te los pide.
6. Copia la URL que termina en `/exec` y pégala en `js/config.js`, variable `WEBAPP_URL`.
7. Para comprobar que quedó bien, abre esa URL directamente en el navegador: debería aparecer el texto "Cartelitos Buffet: API activa...". Si en vez de eso te pide iniciar sesión o da un error, revisa el paso 4 (seguramente "Quién tiene acceso" no quedó en "Cualquier usuario").

### 3. Claves de traducción (Gemini)

No hace falta tocar ningún archivo. Una vez la web esté abierta (en local o ya publicada):

1. Pulsa **"⚙️ Traducción"**.
2. Pega tu clave de la API de Gemini y dale a "+ Añadir". Puedes añadir varias — la web las va rotando si alguna se queda sin cuota.
3. Cierra el modal. Ya puedes usar "+ Añadir plato" sin escribir tú la traducción.

Estas claves se guardan solo en el navegador donde las pegues (localStorage), igual que en el editor de la carta. Si usas la web desde otro ordenador o móvil, tendrás que añadirlas también ahí.

> ⚠️ Ya que las claves que me pasaste llegaron a aparecer en un chat, te recomiendo regenerarlas desde Google AI Studio / Google Cloud antes de darlas por buenas en producción, y pegar aquí las nuevas.

### 4. Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub y sube todo el contenido de esta carpeta.
2. **Settings > Pages** > Source: rama `main`, carpeta `/`.
3. En un par de minutos tendrás la URL `https://tu-usuario.github.io/tu-repositorio/`.

¡Listo! Cada día: abre la web, marca los platos de hoy en "Platos" y pulsa "Imprimir / Guardar PDF" en "Cartelitos".

---

## Notas

- Como la escritura va en modo "no-cors", la web no puede confirmar si el Apps Script realmente guardó el plato nuevo; por eso lo añade igualmente a la vista al momento ("optimista") y confía en que llegará a la hoja. Si tras un rato no lo ves en la Google Sheet directamente, revisa el paso 2 (URL de `WEBAPP_URL` y permisos del despliegue).
- Si editas o borras un plato ya existente, hazlo directamente en la Google Sheet; los cambios se verán en la web tras "Recargar de la hoja" (y unos minutos, mientras Google actualiza el CSV publicado).
- El archivo `data/platos_iniciales.csv` es solo la lista de partida por si alguna vez tienes que recrear la hoja desde cero.
