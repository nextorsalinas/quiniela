# 📝 Bitácora de Desarrollo - Quiniela Mundial 2026

Este archivo es la memoria persistente del proyecto. Cada día de desarrollo se registra aquí detallando los cambios implementados, las soluciones a obstáculos técnicos y las tareas pendientes para que el AI Copilot y el desarrollador puedan continuar sin perder el contexto.

---

## 📅 13 de Julio, 2026
**Objetivo:** Actualizar la fase activa de tendencias y el bloqueo de consulta a los últimos cuatro partidos (Semifinales, Tercer Lugar y Final) en lugar de Cuartos de final.

### 🛠️ Cambios Implementados
1. **Modelos de Base de Datos (`db_helper_phase2.js`)**:
   * Se modificó `getMatchTrends()` para filtrar encuentros pendientes correspondientes a los grupos `'Semifinal'`, `'Tercer Lugar'` y `'Final'` en lugar de `'Cuartos'`.
2. **Backend (`server.js`)**:
   * Se actualizó `checkPhase2PredictionsComplete()` para verificar que el usuario complete sus pronósticos de Semifinal, Tercer Lugar y Final para poder consultar tendencias y rankings de otros usuarios.
   * Se actualizó el mensaje de error 403 en `requireCompletePredictions()` para reflejar las rondas finales.
   * Se ajustó el filtro de los endpoints `/api/phase2/matches/trends` y `/api/phase2/matches/trends/all` para coincidir con las rondas finales.
3. **Frontend (`public/app.js` y `public/index.html`)**:
   * Se alinearon las validaciones de completado de pronósticos en el cliente para verificar Semifinales y Finales.
   * Se actualizó el mensaje del modal estático de consulta restringida en `index.html`.
4. **Solución de Bloqueo Mutuo (Catch-22) y UX**:
   * Se detectó que si los partidos de Semifinales/Finales están como "A definir", los usuarios no pueden guardarlos y quedaban bloqueados permanentemente de ver tendencias. Se modificó en backend (`server.js`) y frontend (`public/app.js`) para ignorar partidos cuyos equipos no estén definidos (`'A definir'` o `'TBD'`).
   * Se mejoró `openCompleteTrendsModal` en `public/app.js` and `public/final_app.js` para extraer y mostrar el mensaje real del servidor (ej. restricciones de seguridad) en lugar del aviso genérico "Error al cargar tendencias.".
   * **Transición Dinámica de Requisitos**: Para evitar obligar a los usuarios a pronosticar Tercer Lugar y Final antes de jugarse las Semifinales (cuando no se conocen los equipos), se actualizó `checkPhase2PredictionsComplete()` para que solo requiera las Semifinales mientras estén pendientes. Una vez jugadas, exige automáticamente Tercer Lugar y Final.
   * **Bust de Caché y Renombrado de Botón**: Se cambió el texto del botón del panel de perfil de `'Pronostica Octavos'` a `'Pronóstico Final'` en `index.html` para reflejar la fase actual. Se incrementaron los parámetros de versión de los scripts (`app.js?v=4.33` y `final_app.js?v=4.22`) en `index.html` y `final.html` para forzar a los navegadores de los usuarios a descargar las nuevas versiones sin almacenar la lógica vieja en caché.

---

## 📅 30 de Junio, 2026
**Objetivo:** Rediseñar el comportamiento del leaderboard al hacer clic en un usuario para mostrar su perfil y estadísticas detalladas en lugar de solo listar sus pronósticos.

### 🛠️ Cambios Implementados
1. **Modelos de Base de Datos (`db_helper.js` y `db_helper_phase2.js`)**:
   * Se modificó `getUserPredictionsDetail(userId)` para incluir y retornar la propiedad `profilePic` del usuario consultado.
2. **Estructura del HTML (`index.html` y `final.html`)**:
   * Se actualizó la estructura de `#comparison-modal` en ambos archivos. Se introdujo el div `#modal-profile-stats-container` para la tarjeta de perfil y las estadísticas, un botón de alternar y un envoltorio `#modal-preds-wrapper` para colapsar los pronósticos.
3. **Lógica en el Cliente (`app.js` y `final_app.js`)**:
   * Se reescribieron las funciones de visualización:
     * `viewPlayerPredictions(targetUserId)` (Fase 1).
     * `viewPlayerPredictionsPhase2(targetUserId)` (Fase 2 / Fase Final).
   * Ahora ambas calculan dinámicamente el rendimiento (Aciertos, Errores, Porcentaje de Efectividad, Marcadores Exactos / Bonus y Racha Activa de aciertos o errores).
   * Generan la UI con una tarjeta de perfil (Avatar, Nombre, Posición y Puntos) y una grilla moderna de estadísticas antes del desglose de pronósticos.
   * Se implementó el colapsado/expandido interactivo de la lista de pronósticos mediante la función `toggleModalPredictionsList()`.
4. **Diseño y Estilos (`styles.css` y `final_styles.css`)**:
   * Se agregaron las variables globales `--success` y `--danger` para dar soporte a la coloración semántica de aciertos/errores en las estadísticas y modales.
5. **Script de Despliegue (`deploy.ps1`)**:
   * Se cambiaron los colores de impresión `Gold` a `Yellow` por compatibilidad en PowerShell.
   * Se comentó el comando interactivo `npx firebase-tools login` por defecto para agilizar los deploys y evitar fallos con proxies corporativos si el usuario ya está autenticado.

### 🛑 Retos Técnicos Resueltos
* **Error de proxy corporativo en Firebase**: Omitimos la validación estricta de SSL en la sesión mediante `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"` en `deploy.ps1` y comandos de consola.
* **Dualidad de Frontend**: Sincronizamos las modificaciones tanto en `index.html`/`app.js` (Fase General) como en `final.html`/`final_app.js` (Fase Final) para que la experiencia del usuario sea consistente independientemente de la página en la que se encuentre.
* **Fallo en despliegue de APIs de Google**: Las desconexiones y fallos de red en Firebase se resolvieron reintentando el comando de despliegue, el cual completó la subida de hosting y funciones en el tercer intento.

### 📋 Tareas Pendientes / Siguiente Paso
* [ ] Realizar pruebas exhaustivas de usabilidad del modal en dispositivos móviles para asegurar la responsividad de la grilla de estadísticas.
* [ ] Monitorear el consumo y cuota de lecturas de Firestore al desplegar estadísticas de otros usuarios en el leaderboard.
* [ ] Evaluar si se requiere migrar el backend a Node.js 22 antes de la fecha límite de deprecación de Node 20 en Firebase (octubre 2026).
