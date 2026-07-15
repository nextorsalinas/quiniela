const express = require('express');
const path = require('path');
const dbHelper = require('./db_helper');
const dbHelperPhase2 = require('./db_helper_phase2');
const dbHelperLigaMX = require('./db_helper_ligamx');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse request bodies
app.use(express.json({ limit: '10mb' }));

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

// Initialize DB lazily. Firebase CLI loads this file during deploy analysis without
// production credentials, so Firestore reads must not run at module load time.
let dbInitPromise = null;
function ensureDbInitialized() {
  if (!dbInitPromise) {
    console.log("Initializing database...");
    dbInitPromise = Promise.all([
      dbHelper.initDb().then(() => console.log("Phase 1 database initialized successfully.")),
      dbHelperPhase2.initDb().then(() => console.log("Phase 2 database initialized successfully.")),
      dbHelperLigaMX.initDb().then(() => console.log("Liga MX database initialized successfully."))
    ]).catch(err => {
      dbInitPromise = null;
      console.error("Error during database initialization:", err);
      throw err;
    });
  }
  return dbInitPromise;
}

app.use(async (req, res, next) => {
  try {
    await ensureDbInitialized();
    next();
  } catch (err) {
    res.status(500).json({ error: "Error al inicializar la base de datos." });
  }
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

// Simple authentication middleware for Phase 2
async function authenticatePhase2(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: "No autorizado. Falta el ID de usuario." });
  }

  try {
    let user = await dbHelperPhase2.findUserById(userId);
    if (!user) {
      // Check if user exists in Phase 1
      const p1User = await dbHelper.findUserById(userId);
      if (p1User) {
        console.log(`Syncing user ${p1User.username} to Phase 2...`);
        user = await dbHelperPhase2.registerSyncedUser(p1User);
      } else {
        return res.status(401).json({ error: "Usuario no encontrado o sesión no válida." });
      }
    }
    req.user = user;
    next();
  } catch (e) {
    console.error("Error in authenticatePhase2:", e);
    return res.status(500).json({ error: "Error interno en autenticación." });
  }
}

// Admin authorization middleware for Phase 2
async function requireAdminPhase2(req, res, next) {
  await authenticatePhase2(req, res, () => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Acceso denegado. Se requiere rol de administrador." });
    }
    next();
  });
}

async function checkPhase2PredictionsComplete(userId) {
  try {
    const matches = await dbHelperPhase2.getMatches();
    const predictions = await dbHelperPhase2.getPredictionsByUser(userId);

    // Determine required matches:
    // 1. First, require unplayed Semifinals (if teams are defined)
    let requiredMatches = matches.filter(match => {
      const g = match.group ? match.group.toLowerCase().trim() : '';
      const hasTeams = match.team1 && match.team2 && 
                       match.team1 !== 'A definir' && match.team2 !== 'A definir' && 
                       match.team1 !== 'TBD' && match.team2 !== 'TBD';
      return g === 'semifinal' && match.result === null && hasTeams;
    });

    // 2. If no unplayed Semifinals remain, require unplayed Tercer Lugar and Final (if teams are defined)
    if (requiredMatches.length === 0) {
      requiredMatches = matches.filter(match => {
        const g = match.group ? match.group.toLowerCase().trim() : '';
        const hasTeams = match.team1 && match.team2 && 
                         match.team1 !== 'A definir' && match.team2 !== 'A definir' && 
                         match.team1 !== 'TBD' && match.team2 !== 'TBD';
        return (g === 'tercer lugar' || g === 'final') && match.result === null && hasTeams;
      });
    }

    const predMatchIds = new Set(predictions.map(p => parseInt(p.matchId)));

    for (const match of requiredMatches) {
      if (!predMatchIds.has(parseInt(match.id))) {
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error("Error in checkPhase2PredictionsComplete:", err);
    return false;
  }
}

async function requireCompletePredictions(req, res, next) {
  // Admin is exempt
  if (req.user && req.user.isAdmin) {
    return next();
  }

  // If requesting own predictions, exempt
  const targetUserId = req.params.userId;
  if (targetUserId && req.user && req.user.id === targetUserId) {
    return next();
  }

  try {
    const isComplete = await checkPhase2PredictionsComplete(req.user.id || req.headers['x-user-id']);
    if (!isComplete) {
      return res.status(403).json({ error: "Solo lo podrás consultar al completar los pronósticos de las rondas finales (Semifinales y Final)." });
    }
    next();
  } catch (error) {
    console.error("Error in requireCompletePredictions middleware:", error);
    res.status(500).json({ error: "Error al validar el estado de tus pronósticos." });
  }
}

// --- API ROUTES ---

// 1. AUTHENTICATION

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

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

// Get winning probabilities
app.get('/api/predictions/probability', authenticate, async (req, res) => {
  try {
    const probability = await dbHelper.calculateWinningProbabilities();
    res.json(probability);
  } catch (error) {
    console.error("Error calculating probability:", error);
    res.status(500).json({ error: "Error al calcular las probabilidades de ganar: " + error.message });
  }
});

// Get matches voting trends (next 2 unplayed matches)
app.get('/api/matches/trends', authenticate, requireCompletePredictions, async (req, res) => {
  try {
    const trends = await dbHelper.getMatchTrends();
    res.json(trends);
  } catch (error) {
    console.error("Error getting match trends:", error);
    res.status(500).json({ error: "Error al obtener las tendencias de votación." });
  }
});

// Get ALL matches voting trends (Phase 1 from beginning)
app.get('/api/matches/trends/all', authenticate, requireCompletePredictions, async (req, res) => {
  try {
    const trends = await dbHelper.getMatchTrendsAll();
    res.json(trends);
  } catch (error) {
    console.error("Error getting all match trends:", error);
    res.status(500).json({ error: "Error al obtener todas las tendencias de votación." });
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
app.get('/api/predictions/user/:userId', authenticate, requireCompletePredictions, async (req, res) => {
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

// Update profile pic
app.post('/api/user/profile-pic', authenticate, async (req, res) => {
  const { profilePic } = req.body;
  if (!profilePic) {
    return res.status(400).json({ error: "Foto de perfil es requerida." });
  }

  try {
    await dbHelper.updateProfilePic(req.user.id, profilePic);
    
    try {
      await dbHelperPhase2.updateProfilePic(req.user.id, profilePic);
    } catch (e2) {
      console.log("Error actualizando foto de perfil en Fase 2:", e2.message);
    }

    res.json({ message: "Foto de perfil actualizada con éxito.", profilePic });
  } catch (error) {
    console.error("Error al actualizar la foto de perfil:", error);
    res.status(500).json({ error: "Error al guardar la foto de perfil en el servidor: " + error.message });
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
    try {
      await dbHelperPhase2.deleteUser(userId);
    } catch (err2) {
      console.log("User did not exist in phase 2 database during main delete:", err2.message);
    }
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


// ==========================================
// --- PHASE 2 (Fase Final) API ROUTES ---
// ==========================================

// 1. Authentication (Phase 2)
app.post('/api/phase2/auth/register', async (req, res) => {
  const { username, password } = req.body;
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
    const user = await dbHelperPhase2.registerUser(username, '', password);
    res.status(201).json({ message: "Usuario registrado con éxito.", user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/phase2/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son requeridos." });
  }
  try {
    const user = await dbHelperPhase2.verifyUserPassword(username, password);
    if (!user) {
      return res.status(400).json({ error: "Nombre de usuario o contraseña incorrectos." });
    }
    res.json({ message: "Inicio de sesión exitoso.", user });
  } catch (error) {
    console.error("Login error details:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.post('/api/phase2/auth/reset-password-public', async (req, res) => {
  const { username, newPassword } = req.body;
  if (!username || !newPassword) {
    return res.status(400).json({ error: "El nombre de usuario y la nueva contraseña son requeridos." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }
  try {
    const user = await dbHelperPhase2.findUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    await dbHelperPhase2.resetUserPassword(user.id, newPassword);
    res.json({ message: "Contraseña restaurada con éxito." });
  } catch (error) {
    console.error("Public reset password error:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// 2. Matches (Phase 2)
app.get('/api/phase2/matches', authenticatePhase2, async (req, res) => {
  try {
    const matches = await dbHelperPhase2.getMatches();
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener los partidos de Fase 2." });
  }
});

// Bulk matches upload
app.post('/api/phase2/admin/matches', requireAdminPhase2, async (req, res) => {
  const { matchesText } = req.body;
  if (!matchesText) return res.status(400).json({ error: 'Texto vacío' });

  const lines = matchesText.split('\n');
  let addedCount = 0;
  const newMatches = [];

  lines.forEach(line => {
    const cols = line.split('\t');
    if (cols.length >= 4) {
      let matchId = null;
      for (let c of cols) {
        if (!isNaN(parseInt(c.trim()))) {
          matchId = parseInt(c.trim());
          break;
        }
      }
      if (matchId !== null) {
        let teams = cols.filter(c => c.trim() !== '' && c.trim() !== 'vs' && isNaN(parseInt(c.trim())));
        if (teams.length >= 2) {
          newMatches.push({
            id: matchId,
            group: 'Siguiente Fase',
            date: teams.length > 2 ? teams[2].trim() : 'TBD',
            team1: teams[0].trim(),
            team2: teams[1].trim(),
            result: null
          });
        }
      }
    }
  });

  if (newMatches.length > 0) {
    await dbHelperPhase2.addMatchesBulk(newMatches);
    addedCount = newMatches.length;
  }
  res.json({ success: true, count: addedCount });
});

// Admin update teams
app.post('/api/phase2/admin/matches/teams', requireAdminPhase2, async (req, res) => {
  const { matchId, team1, team2, date } = req.body;
  if (matchId === undefined || !team1 || !team2) {
    return res.status(400).json({ error: "Faltan datos (matchId, team1, team2)." });
  }
  try {
    await dbHelperPhase2.updateMatchTeams(matchId, String(team1).trim(), String(team2).trim(), String(date || 'TBD').trim() || 'TBD');
    res.json({ message: "Datos del partido actualizados correctamente." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin force-reset Phase 2 matches to 32 "A definir" matches
app.post('/api/phase2/admin/matches/force-reset-32', requireAdminPhase2, async (req, res) => {
  try {
    const matches = await dbHelperPhase2.forceResetMatches32();
    res.json({ success: true, message: "Base de datos de la Fase Final reiniciada a 32 partidos 'A definir'.", count: matches.length });
  } catch (error) {
    console.error("Force reset error:", error);
    res.status(500).json({ error: "Error al reiniciar la base de datos de Fase Final: " + error.message });
  }
});

// Admin update match result
app.post('/api/phase2/admin/matches/result', requireAdminPhase2, async (req, res) => {
  const { matchId, result } = req.body;
  if (matchId === undefined) {
    return res.status(400).json({ error: "ID de partido es requerido." });
  }
  if (result !== null && (typeof result !== 'object' || result.winner === undefined)) {
    return res.status(400).json({ error: "Resultado inválido. Debe ser un objeto con team1Score, team2Score y winner, o null." });
  }
  try {
    await dbHelperPhase2.updateMatchResult(matchId, result);
    res.json({ message: "Resultado del partido actualizado y puntos recalculados." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Sync matches with FIFA API (Admin)
app.post('/api/phase2/admin/matches/sync', requireAdminPhase2, async (req, res) => {
  try {
    const stats = await dbHelperPhase2.syncFifaResults();
    res.json({ message: "Sincronización con FIFA completada.", stats });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: "Error al sincronizar con la API de FIFA: " + error.message });
  }
});

// 3. Predictions (Phase 2)
app.get('/api/phase2/predictions', authenticatePhase2, async (req, res) => {
  try {
    const predictions = await dbHelperPhase2.getPredictionsByUser(req.user.id);
    res.json(predictions);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener las predicciones." });
  }
});

app.get('/api/phase2/config', authenticatePhase2, async (req, res) => {
  try {
    const config = await dbHelperPhase2.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener configuración" });
  }
});

app.post('/api/phase2/admin/toggle-predictions', authenticatePhase2, requireAdminPhase2, async (req, res) => {
  try {
    const config = await dbHelperPhase2.togglePredictionsPaused();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Error al cambiar configuración" });
  }
});

app.post('/api/phase2/predictions', authenticatePhase2, async (req, res) => {
  const config = await dbHelperPhase2.getConfig();
  if (config.predictionsPaused) return res.status(403).json({ error: 'Las ediciones están pausadas' });
  const { predictions } = req.body;
  if (!predictions || !Array.isArray(predictions)) {
    return res.status(400).json({ error: "Predicciones inválidas o vacías." });
  }
  try {
    await dbHelperPhase2.savePredictions(req.user.id, predictions);
    res.json({ message: "Predicciones guardadas con éxito." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 4. Leaderboard & Stats (Phase 2)
app.get('/api/phase2/leaderboard', authenticatePhase2, async (req, res) => {
  try {
    const leaderboard = await dbHelperPhase2.getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la tabla de posiciones." });
  }
});

app.get('/api/phase2/matches/trends', authenticatePhase2, requireCompletePredictions, async (req, res) => {
  try {
    const trends = await dbHelperPhase2.getMatchTrends();
    const filteredTrends = trends.filter(t => {
      if (!t.group) return false;
      const g = t.group.toLowerCase().trim();
      return g === 'semifinal' || g === 'tercer lugar' || g === 'final';
    });
    res.json(filteredTrends);
  } catch (error) {
    console.error("Error getting match trends:", error);
    res.status(500).json({ error: "Error al obtener las tendencias de votación." });
  }
});

app.get('/api/phase2/matches/trends/all', authenticatePhase2, requireCompletePredictions, async (req, res) => {
  try {
    const trends = await dbHelperPhase2.getMatchTrendsAll();
    const filteredTrends = trends.filter(t => {
      if (!t.group) return false;
      const g = t.group.toLowerCase().trim();
      return g === 'semifinal' || g === 'tercer lugar' || g === 'final';
    });
    res.json(filteredTrends);
  } catch (error) {
    console.error("Error getting all match trends for Phase 2:", error);
    res.status(500).json({ error: "Error al obtener todas las tendencias de votación de Fase 2." });
  }
});


app.get('/api/phase2/bonus', authenticatePhase2, async (req, res) => {
  try {
    const bonus = await dbHelperPhase2.getBonusUsers();
    res.json(bonus);
  } catch (error) {
    console.error('Error fetching bonus users:', error);
    res.status(500).json({ error: 'Failed to fetch bonus users' });
  }
});

app.get('/api/phase2/streaks', authenticatePhase2, async (req, res) => {
  try {
    const streaks = await dbHelperPhase2.getStreaks();
    res.json(streaks);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener las rachas." });
  }
});

app.get('/api/phase2/top-scorers', authenticatePhase2, async (req, res) => {
  try {
    const topScorers = await dbHelperPhase2.getTopScorers();
    res.json(topScorers);
  } catch (error) {
    console.error("Error fetching top scorers:", error);
    res.status(500).json({ error: "Error al obtener la tabla de goleadores." });
  }
});

app.get('/api/phase2/predictions/user/:userId', authenticatePhase2, requireCompletePredictions, async (req, res) => {
  const { userId } = req.params;
  try {
    const details = await dbHelperPhase2.getUserPredictionsDetail(userId);
    res.json({ success: true, ...details });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 5. Notifications (Phase 2)
app.get('/api/phase2/notifications/vapid-key', authenticatePhase2, (req, res) => {
  res.json({ publicKey: 'BEaWhoAX6YwyIPLLnk8d5c2N6pF7sHKylPha5CaCp7Pcvk8UzPvhg-uejox0vCJRUX6pwG4t1GO5roeXPKwS-ww' });
});

app.post('/api/phase2/notifications/subscribe', authenticatePhase2, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) {
    return res.status(400).json({ error: "Suscripción es requerida." });
  }
  try {
    await dbHelperPhase2.savePushSubscription(req.user.id, subscription);
    res.json({ message: "Suscripción guardada con éxito." });
  } catch (error) {
    res.status(500).json({ error: "Error al guardar la suscripción: " + error.message });
  }
});

app.get('/api/phase2/notifications', authenticatePhase2, async (req, res) => {
  try {
    const list = await dbHelperPhase2.getNotificationsByUser(req.user.id);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener notificaciones: " + error.message });
  }
});

app.post('/api/phase2/notifications/read', authenticatePhase2, async (req, res) => {
  try {
    await dbHelperPhase2.markNotificationsAsRead(req.user.id);
    res.json({ message: "Notificaciones marcadas como leídas." });
  } catch (error) {
    res.status(500).json({ error: "Error al marcar notificaciones: " + error.message });
  }
});

app.delete('/api/phase2/notifications/:notificationId', authenticatePhase2, async (req, res) => {
  const { notificationId } = req.params;
  try {
    await dbHelperPhase2.deleteNotification(notificationId, req.user.id);
    res.json({ message: "Notificación eliminada con éxito." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 6. Admin User Management (Phase 2)
app.get('/api/phase2/admin/users', requireAdminPhase2, async (req, res) => {
  try {
    const users = await dbHelperPhase2.getUsers();
    const safeUsers = users.map(u => {
      const { password, ...userWithoutPass } = u;
      return userWithoutPass;
    });
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la lista de usuarios." });
  }
});

app.delete('/api/phase2/admin/users/:userId', requireAdminPhase2, async (req, res) => {
  const { userId } = req.params;
  if (req.user.id === userId) {
    return res.status(400).json({ error: "No puedes eliminar tu propia cuenta de administrador." });
  }
  try {
    await dbHelperPhase2.deleteUser(userId);
    try {
      await dbHelper.deleteUser(userId);
    } catch (err1) {
      console.log("User did not exist in phase 1 database during phase 2 delete:", err1.message);
    }
    res.json({ message: "Usuario eliminado con éxito." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/phase2/admin/users/:userId/reset-password', requireAdminPhase2, async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }
  try {
    await dbHelperPhase2.resetUserPassword(userId, newPassword.trim());
    res.json({ message: "Contraseña actualizada con éxito." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/phase2/admin/predictions/user/:userId', requireAdminPhase2, async (req, res) => {
  const { userId } = req.params;
  const { predictions } = req.body;
  if (!predictions || !Array.isArray(predictions)) {
    return res.status(400).json({ error: "Predicciones inválidas o vacías." });
  }
  try {
    await dbHelperPhase2.savePredictions(userId, predictions, true);
    res.json({ message: "Pronósticos actualizados con éxito por el administrador." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/phase2/admin/notifications/broadcast', requireAdminPhase2, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: "Título y mensaje son requeridos." });
  }
  try {
    const webpush = require('web-push');
    const users = await dbHelperPhase2.getUsers();
    let inAppSent = 0;
    let pushSent = 0;

    for (const user of users) {
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
        await firestoreDb.collection('phase2_notifications').doc(notificationId).set(notification);
      } else {
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(__dirname, 'db.json');
        if (fs.existsSync(dbPath)) {
          const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
          if (!db.phase2_notifications) db.phase2_notifications = [];
          db.phase2_notifications.push(notification);
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        }
      }
      inAppSent++;

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
            await firestoreDb.collection('phase2_users').doc(user.id).update({ pushSubscriptions: updatedSubscriptions });
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


// ==========================================
// LIGA MX (PRONOSTICOS MX) API ENDPOINTS
// ==========================================

app.get('/api/ligamx/matches', authenticate, async (req, res) => {
  try {
    const matches = await dbHelperLigaMX.getMatches();
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ligamx/predictions', authenticate, async (req, res) => {
  try {
    const preds = await dbHelperLigaMX.getPredictionsByUser(req.user.id);
    res.json(preds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ligamx/predictions', authenticate, async (req, res) => {
  const { predictions } = req.body;
  if (!predictions || !Array.isArray(predictions)) {
    return res.status(400).json({ error: "Predicciones inválidas." });
  }
  try {
    await dbHelperLigaMX.savePredictions(req.user.id, predictions);
    res.json({ message: "Pronósticos de Liga MX guardados con éxito." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ligamx/leaderboard', authenticate, async (req, res) => {
  try {
    const lb = await dbHelperLigaMX.getLeaderboard();
    res.json(lb);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ligamx/admin/matches/result', requireAdmin, async (req, res) => {
  const { matchId, result } = req.body;
  if (!matchId || !result || result.team1Score === undefined || result.team2Score === undefined) {
    return res.status(400).json({ error: "Datos de resultado inválidos." });
  }
  try {
    await dbHelperLigaMX.updateMatchResult(matchId, result);
    res.json({ message: "Resultado de Liga MX actualizado con éxito." });
  } catch (error) {
    res.status(500).json({ error: error.message });
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



// Catch-all route to serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HYBRID RUNTIME: Firebase Functions or Local Server
if (require.main !== module || process.env.FUNCTIONS_EMULATOR || process.env.K_SERVICE || process.env.FUNCTION_TARGET) {
  // Running in Firebase Cloud Functions v2 or imported as a module
  const { onRequest } = require("firebase-functions/v2/https");
  const { onSchedule } = require("firebase-functions/v2/scheduler");

  exports.api = onRequest(app);
  
  // Sincronización automática de marcadores deshabilitada (Cloud Function programada inactiva)
  /*
  exports.scheduledFifaSync = onSchedule({
    schedule: "5 12-23/2 * * *",
    timeZone: "America/Mexico_City"
  }, async (event) => {
    console.log("Starting scheduled FIFA match results synchronization...");
    try {
      await ensureDbInitialized();
      const stats = await dbHelper.syncFifaResults();
      console.log(`FIFA Sincronización automática terminada con éxito: ${JSON.stringify(stats)}`);
      return null;
    } catch (err) {
      console.error("Error en FIFA Sincronización automática:", err);
      throw err;
    }
  });
  */
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
