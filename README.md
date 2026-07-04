# Análisis de Arquitectura Serverless y Plan de Estudio
### Proyecto: **Quiniela Mundial 2026** | Desarrollado con *Firebase Cloud Functions v2 & Firestore*

---

## 1. Introducción y Estado del Proyecto
El proyecto **Quiniela Mundial 2026** es una solución web moderna diseñada para la gestión interactiva de pronósticos deportivos de cara a la Copa Mundial de Fútbol. La arquitectura del sistema está concebida bajo un modelo híbrido que destaca por su flexibilidad y facilidad de despliegue.

Actualmente, el proyecto está estructurado de la siguiente forma:

* **Backend (Express.js):** Una aplicación Express.js robusta centralizada en el archivo `server.js` que implementa los endpoints de la API (autenticación, gestión de partidos, administración, notificaciones push e in-app, y cálculo de clasificaciones y rachas).
* **Interfaz de Usuario (Frontend):** Ubicada en el directorio `public/`, provee la interfaz gráfica en HTML/CSS/JS con la que interactúan los participantes.
* **Base de Datos Híbrida:** El backend implementa un adaptador de base de datos en `db_helper.js` que utiliza Firebase Firestore en entornos de producción (Google Cloud) y se degrada de forma automática y controlada a un archivo local `db.json` cuando se ejecuta localmente sin configuración de nube.
* **Despliegue e Integración:** El archivo `firebase.json` redirige el tráfico web estático y asocia el prefijo de ruta `/api/**` directamente a la función ejecutada en la nube.

> [!NOTE]
> **Nota del análisis:** La flexibilidad del código permite que un mismo backend sea probado localmente con `npm run dev` en segundos, sin depender de conexiones activas a la nube, y luego desplegado en producción con `firebase deploy` sin modificar una sola línea de código.

---

## 2. Conceptos de Cloud Functions Aplicados
En el proyecto se aplican de forma explícita los siguientes conceptos técnicos de **Firebase Cloud Functions (v2)**:

### A. HTTP Cloud Functions (`onRequest`)
Permiten exponer endpoints HTTP estándar para recibir peticiones REST directamente desde la web. En `server.js`, se envuelve toda la aplicación Express usando la biblioteca oficial:

```javascript
const { onRequest } = require('firebase-functions/v2/https');
exports.api = onRequest(app);
```

Esto delega el enrutamiento HTTP interno a Express.js, lo que simplifica la transición de un backend monolítico tradicional hacia la nube serverless, aprovechando una sola función (`api`) para manejar múltiples rutas.

### B. Scheduled Cloud Functions (`onSchedule`)
Son funciones programadas que se ejecutan automáticamente en segundo plano bajo un esquema cronológico definido por el programador. En la quiniela se utiliza para el cronómetro de sincronización automática de partidos con la fuente OpenFootball:

```javascript
exports.scheduledFifaSync = onSchedule({
  schedule: '5 12-23/2 * * *',
  timeZone: 'America/Mexico_City'
}, async (event) => {
  const stats = await dbHelper.syncFifaResults();
  // ...
});
```

Este cron ejecuta la sincronización en los minutos 5 de cada hora par entre el mediodía y la medianoche (horario de CDMX), lo que garantiza actualizaciones constantes sin costo excesivo.

### C. Inyección de Entorno y Configuración Dinámica
Las funciones se configuran dinámicamente mediante variables de entorno autoinyectadas como `process.env.FIREBASE_CONFIG`. Gracias a esta inyección, el sistema autodetecta si se encuentra en la infraestructura en la nube de Google y activa automáticamente el SDK administrativo (`firebase-admin`) para conectarse a Firestore en lugar de leer el disco local.

---

## 3. Ventajas de Cloud Functions ante un Backend Tradicional
Implementar el backend del proyecto Quiniela sobre Cloud Functions ofrece ventajas competitivas contundentes frente a una arquitectura de servidor tradicional (VPS, Máquinas Virtuales dedicadas como EC2 o droplets):

| Característica | Firebase Cloud Functions (Serverless) | Backend Tradicional (VPS Dedicado) |
| :--- | :--- | :--- |
| **Costo en reposo** | **$0.00 USD**. No pagas cuando nadie usa la aplicación. Ideal para torneos cortos o periodos nocturnos. | Costo fijo mensual 24/7 (típicamente $5 a $20 USD/mes), se use o no el sistema. |
| **Escalabilidad** | **Automática e instantánea**. Escala de 0 a miles de peticiones simultáneas si un partido acaba y todos entran a ver su puntaje. | Limitada por la capacidad de CPU/RAM. Si hay un pico abrupto de visitas, el servidor colapsa si no hay balanceo de carga. |
| **Mantenimiento** | **Administrado por Google**. Olvídate de parches de seguridad, actualizaciones de SO, cortafuegos o renovar certificados SSL. | Requiere configuración y mantenimiento constante de Linux, Nginx/Apache, firewall, etc. por parte del desarrollador. |
| **Procesos Cron** | **Integrado y tolerante a fallos** con Cloud Scheduler. Es sumamente preciso y fiable. | Requiere configurar crontab a nivel del sistema operativo. Si la máquina virtual se apaga o reinicia, la tarea puede fallar. |
| **Despliegue** | Un solo comando (`firebase deploy`) sube frontend y backend sincronizados de manera atómica. | Requiere configurar scripts SSH, Git pulls en el servidor, reinicio del servicio pm2, etc. |

---

## 4. Plan de Estudio y Ruta de Aprendizaje
Con el fin de consolidar los conocimientos adquiridos y optimizar la aplicación, se propone la siguiente ruta estructurada en 4 módulos prácticos:

### Módulo 1: Fundamentos de Serverless y Firebase CLI (Semanas 1 y 2)
* **Teoría:** Aprender las diferencias operativas entre Cloud Functions v1 y v2 (especialmente el soporte para concurrencia en v2 y el uso interno de Cloud Run).
* **Práctica 1:** Aislamiento de secrets y llaves VAPID/Firebase Admin mediante *Google Secret Manager* en lugar de almacenar archivos de credenciales json directamente en la raíz del proyecto.
* **Práctica 2:** Configurar e inicializar de forma local el *Firebase Emulator Suite* para poder emular funciones, hosting y Firestore localmente con fines de pruebas exhaustivas antes de subir cambios.

### Módulo 2: Modelado NoSQL Avanzado con Firestore (Semanas 3 y 4)
* **Teoría:** Estudiar las limitaciones y beneficios del almacenamiento NoSQL. Comprender por qué en Firestore es preferible desnormalizar ciertos datos antes que hacer joins costosos en memoria.
* **Práctica 1:** Implementar *Firestore Transactions* y *Batches* para la actualización de puntuaciones y rachas. Esto evita colisiones de datos (condiciones de carrera) si dos administradores editan resultados simultáneamente.
* **Práctica 2:** Aprender a definir índices compuestos en Firestore y optimizar consultas complejas como el ranking de usuarios (leaderboard) y filtros por fase.

### Módulo 3: Autenticación, Middleware y Seguridad (Semanas 5 y 6)
* **Teoría:** Revisar esquemas de encriptación de datos sensibles. Entender cómo viaja la información desde el navegador hasta la función HTTP.
* **Práctica 1:** Reemplazar el backend de autenticación manual actual (bcryptjs y guardado en colección 'users') por *Firebase Authentication*. Esto delegará de forma nativa la seguridad de contraseñas, login con terceros (Google, etc.) y generación de JWTs.
* **Práctica 2:** Configurar *Firestore Security Rules* para permitir que el frontend consulte información común (posiciones y partidos) de forma directa desde la base de datos sin sobrecargar la Cloud Function.

### Módulo 4: Arquitectura Basada en Eventos e Integración (Semanas 7 y 8)
* **Teoría:** Aprender a desacoplar procesos monolíticos mediante disparadores de base de datos (triggers).
* **Práctica 1:** Crear una función disparada por evento en Firestore (`onDocumentUpdated`) en la colección `matches`. Al finalizar un partido, la función se gatilla en segundo plano de forma asíncrona para calcular los puntajes y actualizar el leaderboard, eliminando la carga del endpoint HTTP del administrador.
* **Práctica 2:** Migrar el envío manual de notificaciones Push (web-push) hacia *Firebase Cloud Messaging (FCM)* para automatizar el ciclo de vida de los tokens de suscripción en navegadores móviles y de escritorio.

---

## 5. ¿Qué más podemos aprender en este Proyecto?
La Quiniela es una base excelente para experimentar con tecnologías de vanguardia en la nube. A continuación se presentan las áreas de especialización recomendadas:

* **Migración a TypeScript:** Definir contratos de datos fijos (interfaces) para Partidos, Usuarios y Pronósticos, previniendo errores de propiedades indefinidas en tiempo de ejecución.
* **Despliegue Continuo (CI/CD):** Configurar flujos automatizados de despliegue mediante *GitHub Actions*. De este modo, cada commit a la rama 'main' probará el backend automáticamente y lo desplegará en la nube si las pruebas son exitosas.
* **Monitoreo y Costos en GCP:** Configurar alertas de presupuesto (*GCP Budgets*) y estudiar el comportamiento de escalado de Cloud Functions, estableciendo límites de instancias máximas en la consola para proteger el proyecto de cobros inesperados ante ataques de denegación de servicio (DDoS).
* **Analítica de Datos:** Implementar en la base de datos la recolección periódica del estado de la tabla general y graficar la evolución de los usuarios en el tiempo, lo que requiere consultas analíticas complejas o agregación offline mediante crons.
