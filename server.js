const express = require('express');
const path = require('path');
const dbHelper = require('./db_helper');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse request bodies
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  console.log(`Headers: ${JSON.stringify(req.headers)}`);
  console.log(`Body: ${JSON.stringify(req.body)}`);
  
  // Intercept response to log status
  const oldSend = res.send;
  res.send = function(data) {
    console.log(`[RESPONSE] Status: ${res.statusCode} - Data: ${data}`);
    oldSend.apply(res, arguments);
  };
  next();
});

// Initialize DB and load Excel matches on startup
console.log("Initializing database...");
dbHelper.initDb().then(() => {
  console.log("Database initialized successfully.");
}).catch(err => {
  console.error("Error during database initialization:", err);
});

// Simple authentication middleware
async function authenticate(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: "No autorizado. Falta el ID de usuario." });
  }

  try {
    const user = await dbHelper.findUserById(userId);
    if (!user) {
      return res.status(401).json({ error: "Usuario no encontrado o sesión no válida." });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(500).json({ error: "Error interno en autenticación." });
  }
}

// Admin authorization middleware
async function requireAdmin(req, res, next) {
  await authenticate(req, res, () => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Acceso denegado. Se requiere rol de administrador." });
    }
    next();
  });
}

// --- API ROUTES ---

// 1. AUTHENTICATION

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  // 1. Deadline check: June 10, 2026 (inclusive). Closed starting June 11, 2026.
  const now = new Date();
  const deadline = new Date("2026-06-11T00:00:00-06:00"); // User timezone is GMT-0600
  if (now >= deadline) {
    return res.status(400).json({ error: "El registro de participantes ha finalizado el 10 de junio." });
  }

  // 2. Validate parameters
  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios." });
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: "El usuario debe tener entre 3 y 20 caracteres." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  try {
    const user = await dbHelper.registerUser(username, '', password);
    res.status(201).json({ message: "Usuario registrado con éxito.", user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son requeridos." });
  }

  try {
    const user = await dbHelper.verifyUserPassword(username, password);
    if (!user) {
      return res.status(400).json({ error: "Nombre de usuario o contraseña incorrectos." });
    }
    res.json({ message: "Inicio de sesión exitoso.", user });
  } catch (error) {
    console.error("Login error details:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Public Password Reset
app.post('/api/auth/reset-password-public', async (req, res) => {
  const { username, newPassword } = req.body;
  if (!username || !newPassword) {
    return res.status(400).json({ error: "El nombre de usuario y la nueva contraseña son requeridos." });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  try {
    const user = await dbHelper.findUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    await dbHelper.resetUserPassword(user.id, newPassword);
    res.json({ message: "Contraseña restaurada con éxito." });
  } catch (error) {
    console.error("Public reset password error:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// 2. MATCHES

// Get matches
app.get('/api/matches', authenticate, async (req, res) => {
  try {
    const matches = await dbHelper.getMatches();
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener los partidos." });
  }
});

// Update match result (Admin)
app.post('/api/admin/matches/result', requireAdmin, async (req, res) => {
  const { matchId, result } = req.body;

  if (matchId === undefined) {
    return res.status(400).json({ error: "ID de partido es requerido." });
  }

  if (result !== null && result !== 'L' && result !== 'E' && result !== 'V') {
    return res.status(400).json({ error: "Resultado debe ser 'L' (Local), 'E' (Empate), 'V' (Visitante) o null." });
  }

  try {
    await dbHelper.updateMatchResult(matchId, result);
    res.json({ message: "Resultado del partido actualizado y puntos recalculados." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Sync matches with FIFA API (Admin)
app.post('/api/admin/matches/sync', requireAdmin, async (req, res) => {
  try {
    const stats = await dbHelper.syncFifaResults();
    res.json({ message: "Sincronización con FIFA completada.", stats });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: "Error al sincronizar con la API de FIFA: " + error.message });
  }
});

// Broadcast notification to all users (Admin)
app.post('/api/admin/notifications/broadcast', requireAdmin, async (req, res) => {
  const { title, body } = req.body;
  
  if (!title || !body) {
    return res.status(400).json({ error: "Título y mensaje son requeridos." });
  }

  try {
    const webpush = require('web-push');
    const users = await dbHelper.getUsers();
    let inAppSent = 0;
    let pushSent = 0;

    for (const user of users) {
      // 1. In-app notification
      const notificationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const notification = {
        id: notificationId,
        userId: user.id,
        title,
        body,
        read: false,
        createdAt: new Date().toISOString()
      };

      if (process.env.FIREBASE_CONFIG) {
        const admin = require('firebase-admin');
        const firestoreDb = admin.firestore();
        await firestoreDb.collection('notifications').doc(notificationId).set(notification);
      } else {
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(__dirname, 'db.json');
        if (fs.existsSync(dbPath)) {
          const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
          if (!db.notifications) db.notifications = [];
          db.notifications.push(notification);
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        }
      }
      inAppSent++;

      // 2. Web Push Notification
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        const payload = JSON.stringify({ title, body });
        const updatedSubscriptions = [...user.pushSubscriptions];
        let subChanged = false;

        for (const sub of user.pushSubscriptions) {
          try {
            await webpush.sendNotification(sub, payload);
            pushSent++;
          } catch (err) {
            console.error(`Failed to send broadcast push for user ${user.username}`, err.statusCode);
            if (err.statusCode === 410 || err.statusCode === 404) {
              const idx = updatedSubscriptions.findIndex(s => s.endpoint === sub.endpoint);
              if (idx > -1) {
                updatedSubscriptions.splice(idx, 1);
                subChanged = true;
              }
            }
          }
        }

        if (subChanged) {
          if (process.env.FIREBASE_CONFIG) {
            const admin = require('firebase-admin');
            const firestoreDb = admin.firestore();
            await firestoreDb.collection('users').doc(user.id).update({ pushSubscriptions: updatedSubscriptions });
          } else {
            const fs = require('fs');
            const path = require('path');
            const dbPath = path.join(__dirname, 'db.json');
            if (fs.existsSync(dbPath)) {
              const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
              const dbUser = db.users.find(u => u.id === user.id);
              if (dbUser) {
                dbUser.pushSubscriptions = updatedSubscriptions;
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
              }
            }
          }
        }
      }
    }

    res.json({ message: "Envío masivo completado con éxito.", stats: { inAppSent, pushSent } });
  } catch (error) {
    console.error("Broadcast notification error:", error);
    res.status(500).json({ error: "Error al realizar el envío masivo: " + error.message });
  }
});

// 3. PREDICTIONS

// Get current user predictions
app.get('/api/predictions', authenticate, async (req, res) => {
  try {
    const predictions = await dbHelper.getPredictionsByUser(req.user.id);
    res.json(predictions);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener las predicciones." });
  }
});

// Save predictions
app.post('/api/predictions', authenticate, async (req, res) => {
  const { predictions } = req.body;

  if (!predictions || !Array.isArray(predictions)) {
    return res.status(400).json({ error: "Predicciones inválidas o vacías." });
  }

  try {
    await dbHelper.savePredictions(req.user.id, predictions);
    res.json({ message: "Predicciones guardadas con éxito." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 4. LEADERBOARD & DETAILS

// Get leaderboard
app.get('/api/leaderboard', authenticate, async (req, res) => {
  try {
    const leaderboard = await dbHelper.getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la tabla de posiciones." });
  }
});

// Get matches voting trends (next 2 unplayed matches)
app.get('/api/matches/trends', authenticate, async (req, res) => {
  try {
    const trends = await dbHelper.getMatchTrends();
    res.json(trends);
  } catch (error) {
    console.error("Error getting match trends:", error);
    res.status(500).json({ error: "Error al obtener las tendencias de votación." });
  }
});

app.get('/api/streaks', authenticate, async (req, res) => {
  try {
    const streaks = await dbHelper.getStreaks();
    res.json(streaks);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener las rachas." });
  }
});

// Get top scorers list
app.get('/api/top-scorers', authenticate, async (req, res) => {
  try {
    const topScorers = await dbHelper.getTopScorers();
    res.json(topScorers);
  } catch (error) {
    console.error("Error fetching top scorers:", error);
    res.status(500).json({ error: "Error al obtener la tabla de goleadores." });
  }
});

// Get another user's predictions details
app.get('/api/predictions/user/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;

  try {
    const details = await dbHelper.getUserPredictionsDetail(userId);
    res.json(details);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 5. NOTIFICATIONS

// Get VAPID public key
app.get('/api/notifications/vapid-key', authenticate, (req, res) => {
  res.json({ publicKey: 'BEaWhoAX6YwyIPLLnk8d5c2N6pF7sHKylPha5CaCp7Pcvk8UzPvhg-uejox0vCJRUX6pwG4t1GO5roeXPKwS-ww' });
});

// Save push subscription
app.post('/api/notifications/subscribe', authenticate, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) {
    return res.status(400).json({ error: "Suscripción es requerida." });
  }
  try {
    await dbHelper.savePushSubscription(req.user.id, subscription);
    res.json({ message: "Suscripción guardada con éxito." });
  } catch (error) {
    res.status(500).json({ error: "Error al guardar la suscripción: " + error.message });
  }
});

// Get user notifications list
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const list = await dbHelper.getNotificationsByUser(req.user.id);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener notificaciones: " + error.message });
  }
});

// Mark all user notifications as read
app.post('/api/notifications/read', authenticate, async (req, res) => {
  try {
    await dbHelper.markNotificationsAsRead(req.user.id);
    res.json({ message: "Notificaciones marcadas como leídas." });
  } catch (error) {
    res.status(500).json({ error: "Error al marcar notificaciones: " + error.message });
  }
});

// Delete a specific notification
app.delete('/api/notifications/:notificationId', authenticate, async (req, res) => {
  const { notificationId } = req.params;
  try {
    await dbHelper.deleteNotification(notificationId, req.user.id);
    res.json({ message: "Notificación eliminada con éxito." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all users (Admin only)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await dbHelper.getUsers();
    // Return users without password field
    const safeUsers = users.map(u => {
      const { password, ...userWithoutPass } = u;
      return userWithoutPass;
    });
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la lista de usuarios." });
  }
});

// Delete user (Admin only)
app.delete('/api/admin/users/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;

  if (req.user.id === userId) {
    return res.status(400).json({ error: "No puedes eliminar tu propia cuenta de administrador." });
  }

  try {
    await dbHelper.deleteUser(userId);
    res.json({ message: "Usuario eliminado con éxito." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reset user password (Admin only)
app.post('/api/admin/users/:userId/reset-password', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }

  try {
    await dbHelper.resetUserPassword(userId, newPassword.trim());
    res.json({ message: "Contraseña actualizada con éxito." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user predictions (Admin only)
app.post('/api/admin/predictions/user/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { predictions } = req.body;

  if (!predictions || !Array.isArray(predictions)) {
    return res.status(400).json({ error: "Predicciones inválidas o vacías." });
  }

  try {
    await dbHelper.savePredictions(userId, predictions, true);
    res.json({ message: "Pronósticos actualizados con éxito por el administrador." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// Info helper
app.get('/api/info', (req, res) => {
  res.json({
    app: "Quiniela Mundial 2026",
    status: "online",
    adminCredentials: "admin / admin2026",
    deployment: process.env.FIREBASE_CONFIG ? "Firebase Functions" : "Local",
    dbType: dbHelper.getDbType ? dbHelper.getDbType() : "unknown"
  });
});

app.get('/api/debug-guest', async (req, res) => {
  try {
    const u = await dbHelper.findUserByUsername('invitado');
    const u_raw = u ? { ...u, password: '[PROTECTED]' } : null;
    const test_pwd = u ? require('bcryptjs').compareSync('mundial', u.password) : false;
    res.json({
      dbType: dbHelper.getDbType ? dbHelper.getDbType() : "unknown",
      userExists: !!u,
      userRaw: u_raw,
      passwordValid: test_pwd
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Catch-all route to serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HYBRID RUNTIME: Firebase Functions or Local Server
if (process.env.FIREBASE_CONFIG) {
  // Running in Firebase Cloud Functions v2
  const { onRequest } = require("firebase-functions/v2/https");
  const { onSchedule } = require("firebase-functions/v2/scheduler");

  exports.api = onRequest(app);
  
  // Scheduled Cloud Function running at 5 and 55 minutes past the hour (PM 13-23) to automatically pull FIFA results
  exports.scheduledFifaSync = onSchedule({
    schedule: "5 12-23/2 * * *",
    timeZone: "America/Mexico_City"
  }, async (event) => {
    console.log("Starting scheduled FIFA match results synchronization...");
    try {
      const stats = await dbHelper.syncFifaResults();
      console.log(`FIFA Sincronización automática terminada con éxito: ${JSON.stringify(stats)}`);
      return null;
    } catch (err) {
      console.error("Error en FIFA Sincronización automática:", err);
      throw err;
    }
  });
} else {
  // Running locally
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`  QUINIELA MUNDIAL 2026 SERVER IS RUNNING LOCALLY! `);
    console.log(`  URL: http://localhost:${PORT}                    `);
    console.log(`  Admin credentials: admin / admin2026             `);
    console.log(`===================================================`);
  });
}
