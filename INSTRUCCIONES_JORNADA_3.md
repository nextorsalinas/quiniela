# Guía de Actualización a la Jornada 3

Sigue estos sencillos pasos para actualizar los partidos, habilitar el cálculo de la bolsa, configurar la tabla de posiciones y activar el filtro para la **Jornada 3**.

---

### Paso 1: Actualizar el Archivo Excel de Encuentros
1. Reemplaza el archivo `Apertura_2026.xlsx` en la raíz del proyecto (`C:\Users\nsalinas\Documents\quiniela\Apertura_2026.xlsx`) con el nuevo archivo que contenga los partidos de la Jornada 3.
2. Asegúrate de que las columnas tengan los mismos nombres y formato (ID, Jornada, Fecha, Local, Visita, etc.).

---

### Paso 2: Sincronizar la Base de Datos
Ejecuta el siguiente comando en la terminal para leer el nuevo Excel e importar los encuentros de la Jornada 3 a Firestore:
```powershell
node scratch/sync_jornada_3.js
```
*(Verifica en la consola que se hayan detectado y creado correctamente los nuevos encuentros).*

---

### Paso 3: Modificaciones en el Código del Servidor (`db_helper_ligamx.js`)
Abre [db_helper_ligamx.js](file:///C:/Users/nsalinas/Documents/quiniela/db_helper_ligamx.js) y cambia la jornada activa de la **2** a la **3** en la función `getLeaderboard()`:

```diff
-  const matchesJ2 = matches.filter(m => m.jornada === 2);
+  const matchesJ2 = matches.filter(m => m.jornada === 3);
```

---

### Paso 4: Modificaciones en la Interfaz de Usuario (`public/app.js`)
Abre [public/app.js](file:///C:/Users/nsalinas/Documents/quiniela/public/app.js) y realiza los siguientes cambios para activar la Jornada 3 por defecto:

1. **Dashboard principal**:
   ```diff
      if (stateLigaMX.selectedJornada === undefined) {
-       stateLigaMX.selectedJornada = 2;
+       stateLigaMX.selectedJornada = 3;
      }
   ```

2. **Grid de partidos**:
   ```diff
-  const currentJornada = stateLigaMX.selectedJornada || 2;
+  const currentJornada = stateLigaMX.selectedJornada || 3;
   ```

3. **Selector de botones activos**:
   Asegúrate de agregar/actualizar la referencia visual para el botón de la Jornada 3 en `renderLigaMXMatchesGrid()`:
   ```diff
    const btn1 = document.getElementById('filter-jornada-1');
    const btn2 = document.getElementById('filter-jornada-2');
+   const btn3 = document.getElementById('filter-jornada-3');
    if (btn1 && btn2 && btn3) {
      btn1.style.background = currentJornada === 1 ? '#fff' : 'transparent';
      btn1.style.color = currentJornada === 1 ? '#ea580c' : '#fff';
      btn2.style.background = currentJornada === 2 ? '#fff' : 'transparent';
      btn2.style.color = currentJornada === 2 ? '#ea580c' : '#fff';
+     btn3.style.background = currentJornada === 3 ? '#fff' : 'transparent';
+     btn3.style.color = currentJornada === 3 ? '#ea580c' : '#fff';
    }
   ```

4. **Tabla de Posiciones (Denominador de aciertos)**:
   ```diff
            <td style="text-align: center; vertical-align: middle; color: var(--color-text-muted); font-size: 0.8rem;">
-             ${row.predictionCount} / ${stateLigaMX.matches.filter(m => m.jornada === 2).length}
+             ${row.predictionCount} / ${stateLigaMX.matches.filter(m => m.jornada === 3).length}
            </td>
   ```

5. **Tendencias de Votos**:
   Actualiza el filtro del mapa para mostrar la Jornada 3 en la sección de tendencias:
   ```diff
    html += trends.map((match, index) => {
-     if (match.jornada !== 2) return '';
+     if (match.jornada !== 3) return '';
   ```

---

### Paso 5: Modificaciones en el HTML (`public/index.html`)

1. **Añadir el Botón de la Jornada 3**:
   Abre [public/index.html](file:///C:/Users/nsalinas/Documents/quiniela/public/index.html) y añade el botón para la Jornada 3 dentro del selector de jornadas:
   ```diff
            <button id="filter-jornada-1" class="btn btn-outline" onclick="filterLigaMXJornada(1)" style="...">Jornada 1</button>
            <button id="filter-jornada-2" class="btn btn-outline" onclick="filterLigaMXJornada(2)" style="...">Jornada 2</button>
+           <button id="filter-jornada-3" class="btn btn-outline" onclick="filterLigaMXJornada(3)" style="...">Jornada 3</button>
   ```

2. **Habilitar Bolsa Real**:
   Dado que en la Jornada 3 la bolsa de dinero ya será real y oficial, cambia los textos del Jackpot:
   * Reemplaza `Bolsa Simulada` por `Bolsa Garantizada`.
   * Reemplaza el texto de la nota `Nota: ¡¡¡La próxima semana iniciamos!!!!` por la nota oficial: `Nota: Acumulado real a repartir en esta Jornada`.

3. **Incrementar Versión de Caché**:
   Al final de `public/index.html`, incrementa el query parameter para invalidar la caché del navegador de los usuarios:
   ```diff
-  <link rel="stylesheet" href="styles.css?v=7.10">
+  <link rel="stylesheet" href="styles.css?v=7.20">
-  <script src="app.js?v=7.10"></script>
+  <script src="app.js?v=7.20"></script>
   ```

---

### Paso 6: Desplegar en Firebase
Una vez guardados todos los cambios, ejecuta el script de despliegue:
```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```
¡Listo! La aplicación cargará automáticamente la Jornada 3 para todos los usuarios.
