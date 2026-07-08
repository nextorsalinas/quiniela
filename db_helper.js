const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');

// Configure VAPID keys
const publicVapidKey = 'BEaWhoAX6YwyIPLLnk8d5c2N6pF7sHKylPha5CaCp7Pcvk8UzPvhg-uejox0vCJRUX6pwG4t1GO5roeXPKwS-ww';
const privateVapidKey = 'HFfMYamVkTBFIak9jxDfdDTlPw_hNAL39WhkOZJDEb4';

webpush.setVapidDetails(
  'mailto:admin@quiniela.com.mx',
  publicVapidKey,
  privateVapidKey
);

const dbPath = path.join(__dirname, 'db.json');
const excelPath = path.join(__dirname, 'Quiniela_Mundial_2026_Fase_Grupos.xlsx');

// Database Detection
let dbType = 'json'; // 'json' or 'firestore'
let firestoreDb = null;

// --- IN-MEMORY CACHE ---
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = {
  leaderboard: { data: null, timestamp: 0 },
  trends: { data: null, timestamp: 0 },
  streaks: { data: null, timestamp: 0 },
  topScorers: { data: null, timestamp: 0 }
};

function invalidateCache() {
  console.log("Invalidating in-memory cache due to data change.");
  cache.leaderboard.timestamp = 0;
  cache.trends.timestamp = 0;
  cache.streaks.timestamp = 0;
  cache.topScorers.timestamp = 0;
}
// -----------------------

try {
  const admin = require('firebase-admin');
  if (process.env.FIREBASE_CONFIG || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    firestoreDb = admin.firestore();
    dbType = 'firestore';
    console.log("===================================================");
    console.log("  Firebase Admin initialized. USING FIRESTORE DB!  ");
    console.log("===================================================");
  } else {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(require(serviceAccountPath))
        });
      }
      firestoreDb = admin.firestore();
      dbType = 'firestore';
      console.log("===================================================");
      console.log("  Firebase initialized via serviceAccountKey.json  ");
      console.log("  USING FIRESTORE DB!                              ");
      console.log("===================================================");
    } else {
      console.log("No Firebase configuration found. USING LOCAL JSON!");
    }
  }
} catch (e) {
  console.log("Firebase Admin SDK failed to initialize. USING LOCAL JSON!", e.message);
}

// Initialize database with default structure and seed data if empty
async function initDb() {
  if (dbType === 'firestore') {
    try {
      // 1. Seed matches if empty
      const matchesSnap = await firestoreDb.collection('matches').limit(1).get();
      if (matchesSnap.empty) {
        console.log("Firestore matches are empty. Loading from Excel...");
        const excelMatches = loadMatchesFromExcel();
        if (excelMatches.length > 0) {
          const batch = firestoreDb.batch();
          excelMatches.forEach(m => {
            const docRef = firestoreDb.collection('matches').doc(String(m.id));
            batch.set(docRef, m);
          });
          await batch.commit();
          console.log(`Loaded ${excelMatches.length} matches into Firestore.`);
        }
      }

      // 2. Seed default admin if no users exist
      const usersSnap = await firestoreDb.collection('users').limit(1).get();
      if (usersSnap.empty) {
        console.log("No users found in Firestore. Seeding default admin...");
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync('admin2026', salt);
        
        await firestoreDb.collection('users').doc('admin_id_2026').set({
          id: 'admin_id_2026',
          username: 'admin',
          username_lower: 'admin',
          email: 'admin@quiniela.com',
          password: hashedPassword,
          points: 0,
          isAdmin: true,
          createdAt: new Date().toISOString()
        });
        console.log("Default admin created in Firestore: admin / admin2026");
      }
    } catch (err) {
      console.error("Error initializing Firestore DB:", err);
    }
    return;
  }

  // Fallback to JSON database
  let db = {
    users: [],
    matches: [],
    predictions: []
  };

  if (fs.existsSync(dbPath)) {
    try {
      const fileData = fs.readFileSync(dbPath, 'utf8');
      db = JSON.parse(fileData);
    } catch (e) {
      console.error("Error reading db.json, recreating...", e);
    }
  }

  if (!db.users) db.users = [];
  if (!db.matches) db.matches = [];
  if (!db.predictions) db.predictions = [];

  let dbUpdated = false;

  if (db.matches.length === 0) {
    console.log("Database matches are empty. Loading from Excel...");
    const excelMatches = loadMatchesFromExcel();
    if (excelMatches.length > 0) {
      db.matches = excelMatches;
      dbUpdated = true;
      console.log(`Loaded ${excelMatches.length} matches from Excel.`);
    }
  }

  if (db.users.length === 0) {
    console.log("No users found. Seeding default admin user...");
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('admin2026', salt);
    
    db.users.push({
      id: 'admin_id_2026',
      username: 'admin',
      email: 'admin@quiniela.com',
      password: hashedPassword,
      points: 0,
      isAdmin: true,
      createdAt: new Date().toISOString()
    });
    dbUpdated = true;
    console.log("Default admin created: admin / admin2026");
  }

  if (dbUpdated || !fs.existsSync(dbPath)) {
    writeDb(db);
  }
}

// Read from Excel file
function loadMatchesFromExcel() {
  if (!fs.existsSync(excelPath)) {
    console.error("Excel file not found at: " + excelPath);
    return [];
  }

  try {
    const workbook = xlsx.readFile(excelPath);
    const sheetName = 'Mi Quiniela';
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.error(`Sheet '${sheetName}' not found in Excel file.`);
      return [];
    }

    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const matches = [];

    for (let i = 4; i < data.length; i++) {
      const row = data[i];
      if (row && row[0] !== undefined) {
        const matchId = parseInt(row[0]);
        if (isNaN(matchId)) continue;

        matches.push({
          id: matchId,
          group: row[1] ? String(row[1]).trim() : '',
          date: row[2] ? String(row[2]).trim() : '',
          team1: row[3] ? String(row[3]).trim() : '',
          team2: row[5] ? String(row[5]).trim() : '',
          result: null // 'L', 'E', 'V' or null
        });
      }
    }
    return matches;
  } catch (error) {
    console.error("Error reading excel file:", error);
    return [];
  }
}

// Read database (JSON helper)
function readDb() {
  if (!fs.existsSync(dbPath)) {
    // Run initialization synchronously for JSON fallback
    let db = { users: [], matches: [], predictions: [] };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    return db;
  }
  try {
    const fileData = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(fileData);
  } catch (e) {
    return { users: [], matches: [], predictions: [] };
  }
}

// Write database (JSON helper)
function writeDb(db) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error("Error writing db.json", e);
  }
}

// Generate unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// --- DB API Helpers ---

// User functions
async function findUserByUsername(username) {
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('users')
      .where('username_lower', '==', username.toLowerCase().trim()).get();
    if (snap.empty) return null;
    return snap.docs[0].data();
  }
  const db = readDb();
  return db.users.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
}

async function findUserByEmail(email) {
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('users')
      .where('email', '==', email.toLowerCase().trim()).get();
    if (snap.empty) return null;
    return snap.docs[0].data();
  }
  const db = readDb();
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
}

async function findUserById(userId) {
  if (dbType === 'firestore') {
    const doc = await firestoreDb.collection('users').doc(userId).get();
    if (!doc.exists) return null;
    return doc.data();
  }
  const db = readDb();
  return db.users.find(u => u.id === userId);
}

async function registerUser(username, email, password, isAdmin = false) {
  const existingUser = await findUserByUsername(username);
  if (existingUser) {
    throw new Error("El nombre de usuario ya está registrado.");
  }
  if (email && email.trim() !== '') {
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      throw new Error("El correo electrónico ya está registrado.");
    }
  }

  const id = generateId();
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);

  const newUser = {
    id: id,
    username: username.trim(),
    email: email ? email.trim().toLowerCase() : '',
    password: hashedPassword,
    points: 0,
    isAdmin: isAdmin,
    createdAt: new Date().toISOString()
  };

  if (dbType === 'firestore') {
    newUser.username_lower = username.trim().toLowerCase();
    await firestoreDb.collection('users').doc(id).set(newUser);
    invalidateCache();
  } else {
    const db = readDb();
    db.users.push(newUser);
    writeDb(db);
  }
  
  const { password: _, ...userWithoutPass } = newUser;
  return userWithoutPass;
}

async function verifyUserPassword(username, password) {
  const normalizedUsername = username.toLowerCase().trim();
  if (normalizedUsername === 'invitado' && password === 'mundial') {
    let user = await findUserByUsername('invitado');
    if (!user) {
      console.log("Guest user 'invitado' not found. Creating on the fly...");
      try {
        await registerUser('invitado', '', 'mundial');
        user = await findUserByUsername('invitado');
      } catch (err) {
        console.error("Failed to auto-create guest user:", err);
      }
    }
    if (user) {
      const { password: _, username_lower: __, ...userWithoutPass } = user;
      return userWithoutPass;
    }
  }

  const user = await findUserByUsername(username);
  if (!user) return null;
  
  const isValid = bcrypt.compareSync(password, user.password);
  if (isValid) {
    const { password: _, username_lower: __, ...userWithoutPass } = user;
    return userWithoutPass;
  }
  return null;
}

// Match functions
let cachedMatches = null;

async function getMatches() {
  if (dbType === 'firestore') {
    if (cachedMatches) {
      return cachedMatches;
    }
    const snap = await firestoreDb.collection('matches').orderBy('id', 'asc').get();
    cachedMatches = snap.docs.map(d => d.data());
    return cachedMatches;
  }
  const db = readDb();
  return db.matches;
}

async function updateMatchResult(matchId, result) {
  if (result !== null && result !== 'L' && result !== 'E' && result !== 'V') {
    throw new Error("Resultado inválido. Debe ser 'L', 'E', 'V' o null");
  }

  cachedMatches = null;
  invalidateCache(); // INVALIDATE CACHE ON RESULT CHANGE

  if (dbType === 'firestore') {
    // 1. Update Match Doc
    const matchRef = firestoreDb.collection('matches').doc(String(matchId));
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Partido no encontrado");
    
    await matchRef.update({ result, updatedAt: new Date().toISOString() });

    // 2. Fetch all predictions for this match to recalculate points
    const predsSnap = await firestoreDb.collection('predictions').where('matchId', '==', parseInt(matchId)).get();
    
    const batch = firestoreDb.batch();
    const userPointsChange = {};

    for (const doc of predsSnap.docs) {
      const pred = doc.data();
      const prevPoints = pred.pointsEarned || 0;
      let newPoints = 0;
      if (result !== null && pred.prediction === result) {
        newPoints = 3;
      }
      
      batch.update(doc.ref, { pointsEarned: newPoints });

      const diff = newPoints - prevPoints;
      if (diff !== 0) {
        userPointsChange[pred.userId] = (userPointsChange[pred.userId] || 0) + diff;
      }
    }
    await batch.commit();

    // 3. Update all users' points
    for (const [uId, diff] of Object.entries(userPointsChange)) {
      const userRef = firestoreDb.collection('users').doc(uId);
      await firestoreDb.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (userDoc.exists) {
          const currentPoints = userDoc.data().points || 0;
          transaction.update(userRef, { points: currentPoints + diff });
        }
      });
    }

    if (result !== null) {
      notifyUsersForMatch(matchId, result, matchDoc.data()).catch(err => {
        console.error("Error sending notifications in Firestore:", err);
      });
    }
  } else {
    // JSON logic
    const db = readDb();
    const match = db.matches.find(m => m.id === parseInt(matchId));
    if (!match) throw new Error("Partido no encontrado");

    match.result = result;
    match.updatedAt = new Date().toISOString();
    writeDb(db);

    // Recalculate all scores
    recalculateScoresSync(db);

    if (result !== null) {
      notifyUsersForMatch(matchId, result, match).catch(err => {
        console.error("Error sending notifications in JSON:", err);
      });
    }
  }
}

// Prediction functions
async function getPredictionsByUser(userId) {
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('predictions').where('userId', '==', userId).get();
    return snap.docs.map(d => d.data());
  }
  const db = readDb();
  return db.predictions.filter(p => p.userId === userId);
}

async function savePredictions(userId, matchPredictions, isAdmin = false) {
  // We do not invalidate the cache on every prediction save anymore
  // to prevent high Firestore read volume. Leaderboard and streaks only
  // depend on match results. Trends can use the 5-minute cache.
  if (dbType === 'firestore') {
    // Verify user exists
    const userDoc = await firestoreDb.collection('users').doc(userId).get();
    if (!userDoc.exists) throw new Error("Usuario no encontrado");

    // Check if new predictions would exceed the 72 match limit
    const predsSnap = await firestoreDb.collection('predictions').where('userId', '==', userId).get();
    const existingCount = predsSnap.size;
    let newCount = 0;
    for (const pred of matchPredictions) {
      const docId = `${userId}_${parseInt(pred.matchId)}`;
      const doc = predsSnap.docs.find(d => d.id === docId);
      if (!doc) {
        newCount++;
      }
    }
    if (!isAdmin && existingCount + newCount > 72) {
      throw new Error("El total de pronósticos excede el límite de 72 partidos.");
    }

    const batch = firestoreDb.batch();
    let pointAdjustment = 0;

    for (const pred of matchPredictions) {
      const matchId = parseInt(pred.matchId);
      const val = pred.prediction;

      if (val !== null && val !== 'L' && val !== 'E' && val !== 'V') continue;

      // Fetch match result
      const matchDoc = await firestoreDb.collection('matches').doc(String(matchId)).get();
      if (!matchDoc.exists) continue;
      const match = matchDoc.data();

      // Check if prediction already exists
      const docId = `${userId}_${matchId}`;
      const predRef = firestoreDb.collection('predictions').doc(docId);
      const existingPredDoc = await predRef.get();

      if (existingPredDoc.exists && !isAdmin) {
        throw new Error(`El partido #${matchId} ya tiene un pronóstico guardado y no se puede modificar.`);
      }

      let prevPoints = 0;
      if (existingPredDoc.exists) {
        prevPoints = existingPredDoc.data().pointsEarned || 0;
      }

      if (val === null) {
        if (existingPredDoc.exists) {
          batch.delete(predRef);
          pointAdjustment -= prevPoints;
        }
      } else {
        let pointsEarned = 0;
        if (match.result !== null && val === match.result) {
          pointsEarned = 3;
        }
        pointAdjustment += (pointsEarned - prevPoints);

        batch.set(predRef, {
          userId: userId,
          matchId: matchId,
          prediction: val,
          pointsEarned: pointsEarned
        });
      }
    }
    await batch.commit();

    if (pointAdjustment !== 0) {
      const userRef = firestoreDb.collection('users').doc(userId);
      await firestoreDb.runTransaction(async (transaction) => {
        const userDocSnapshot = await transaction.get(userRef);
        if (userDocSnapshot.exists) {
          const currentPoints = userDocSnapshot.data().points || 0;
          transaction.update(userRef, { points: currentPoints + pointAdjustment });
        }
      });
    }
  } else {
    // JSON logic
    const db = readDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error("Usuario no encontrado");

    // Check if new predictions would exceed the 72 match limit
    const existingPreds = db.predictions.filter(p => p.userId === userId);
    let newCount = 0;
    for (const pred of matchPredictions) {
      const matchId = parseInt(pred.matchId);
      const exists = existingPreds.some(p => p.matchId === matchId);
      if (!exists) {
        newCount++;
      }
    }
    if (!isAdmin && existingPreds.length + newCount > 72) {
      throw new Error("El total de pronósticos excede el límite de 72 partidos.");
    }

    for (const pred of matchPredictions) {
      const matchId = parseInt(pred.matchId);
      const predictionVal = pred.prediction;

      if (predictionVal !== null && predictionVal !== 'L' && predictionVal !== 'E' && predictionVal !== 'V') continue;

      const match = db.matches.find(m => m.id === matchId);
      if (!match) continue;

      const existingIndex = db.predictions.findIndex(p => p.userId === userId && p.matchId === matchId);
      if (existingIndex > -1 && !isAdmin) {
        throw new Error(`El partido #${matchId} ya tiene un pronóstico guardado y no se puede modificar.`);
      }

      if (predictionVal === null) {
        if (existingIndex > -1) {
          db.predictions.splice(existingIndex, 1);
        }
      } else {
        const predObj = {
          userId: userId,
          matchId: matchId,
          prediction: predictionVal,
          pointsEarned: 0
        };

        if (existingIndex > -1) {
          db.predictions[existingIndex] = predObj;
        } else {
          db.predictions.push(predObj);
        }
      }
    }
    writeDb(db);
    recalculateScoresSync(db);
  }
}

// Recalculate scores for JSON fallback synchronously
function recalculateScoresSync(db) {
  db.users.forEach(user => {
    user.points = 0;
  });

  db.predictions.forEach(pred => {
    const match = db.matches.find(m => m.id === pred.matchId);
    if (match && match.result !== null) {
      if (pred.prediction === match.result) {
        pred.pointsEarned = 3;
      } else {
        pred.pointsEarned = 0;
      }
    } else {
      pred.pointsEarned = 0;
    }

    const user = db.users.find(u => u.id === pred.userId);
    if (user) {
      user.points += pred.pointsEarned;
    }
  });

  writeDb(db);
}

// Leaderboard
async function getLeaderboard() {
  if (dbType === 'firestore') {
    const now = Date.now();
    if (cache.leaderboard.data && (now - cache.leaderboard.timestamp) < CACHE_TTL_MS) {
      console.log("Serving leaderboard from cache.");
      return cache.leaderboard.data;
    }

    const snap = await firestoreDb.collection('users').orderBy('points', 'desc').get();
    const leaderboard = [];
    
    for (const doc of snap.docs) {
      const u = doc.data();
      if (u.isAdmin || u.username === 'invitado') continue;
      
      // Fast count aggregation
      const countSnap = await firestoreDb.collection('predictions')
        .where('userId', '==', u.id).count().get();
      
      leaderboard.push({
        id: u.id,
        username: u.username,
        points: u.points,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
        profilePic: u.profilePic || '',
        predictionCount: countSnap.data().count
      });
    }
    
    cache.leaderboard.data = leaderboard;
    cache.leaderboard.timestamp = now;
    return leaderboard;
  }

  const db = readDb();
  const leaderboard = db.users
    .filter(u => !u.isAdmin && u.username !== 'invitado')
    .map(u => ({
      id: u.id,
      username: u.username,
      points: u.points,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
      profilePic: u.profilePic || '',
      predictionCount: db.predictions.filter(p => p.userId === u.id).length
    }));

  return leaderboard.sort((a, b) => b.points - a.points);
}

// Get comparison predictions for user
async function getUserPredictionsDetail(userId) {
  if (dbType === 'firestore') {
    const userDoc = await firestoreDb.collection('users').doc(userId).get();
    if (!userDoc.exists) throw new Error("Usuario no encontrado");
    const user = userDoc.data();

    const predsSnap = await firestoreDb.collection('predictions').where('userId', '==', userId).get();
    const predictionsMap = {};
    predsSnap.docs.forEach(d => {
      const p = d.data();
      predictionsMap[p.matchId] = p.prediction;
    });

    return {
      username: user.username,
      points: user.points,
      profilePic: user.profilePic || '',
      predictions: predictionsMap
    };
  }

  const db = readDb();
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error("Usuario no encontrado");

  const userPreds = db.predictions.filter(p => p.userId === userId);
  const predictionsMap = {};
  userPreds.forEach(p => {
    predictionsMap[p.matchId] = p.prediction;
  });

  return {
    username: user.username,
    points: user.points,
    profilePic: user.profilePic || '',
    predictions: predictionsMap
  };
}


// Spanish to English Team Names Mapping
const teamNameMap = {
  "Alemania": "Germany",
  "Arabia Saudita": "Saudi Arabia",
  "Argelia": "Algeria",
  "Argentina": "Argentina",
  "Australia": "Australia",
  "Austria": "Austria",
  "Bosnia y Herzegovina": "Bosnia and Herzegovina",
  "Brasil": "Brazil",
  "Bélgica": "Belgium",
  "Cabo Verde": "Cape Verde",
  "Canadá": "Canada",
  "Catar": "Qatar",
  "Colombia": "Colombia",
  "Corea del Sur": "South Korea",
  "Costa de Marfil": "Ivory Coast",
  "Croacia": "Croatia",
  "Curazao": "Curacao",
  "Ecuador": "Ecuador",
  "Egipto": "Egypt",
  "Escocia": "Scotland",
  "España": "Spain",
  "Estados Unidos": "United States",
  "Francia": "France",
  "Ghana": "Ghana",
  "Haití": "Haiti",
  "Inglaterra": "England",
  "Irak": "Iraq",
  "Irán": "Iran",
  "Japón": "Japan",
  "Jordania": "Jordan",
  "Marruecos": "Morocco",
  "México": "Mexico",
  "Noruega": "Norway",
  "Nueva Zelanda": "New Zealand",
  "Panamá": "Panama",
  "Paraguay": "Paraguay",
  "Países Bajos": "Netherlands",
  "Portugal": "Portugal",
  "RD Congo": "DR Congo",
  "República Checa": "Czech Republic",
  "Senegal": "Senegal",
  "Sudáfrica": "South Africa",
  "Suecia": "Sweden",
  "Suiza": "Switzerland",
  "Turquía": "Turkey",
  "Túnez": "Tunisia",
  "Uruguay": "Uruguay",
  "Uzbekistán": "Uzbekistan"
};

// Aliases to handle naming variations in the API (e.g. USA vs United States, etc.)
const teamAliases = {
  "usa": "unitedstates",
  "korearepublic": "southkorea",
  "cotedivoire": "ivorycoast",
  "republicofireland": "ireland",
  "czechia": "czechrepublic",
  "turkiye": "turkey",
  "congodr": "drcongo",
  "bosniaherzegovina": "bosniaandherzegovina"
};

function normalizeTeam(name) {
  if (!name) return "";
  const trimmed = name.trim();
  const engName = teamNameMap[trimmed] || trimmed;
  let normalized = engName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "") // remove spaces/special chars
    .trim();
    
  if (teamAliases[normalized]) {
    normalized = teamAliases[normalized];
  }
  return normalized;
}

async function syncFifaResults() {
  console.log("Sincronización de marcadores con la API externa deshabilitada.");
  return { checked: 0, updated: 0, message: "Sincronización deshabilitada por configuración." };
  
  // Código inactivo:
  /*
  console.log("Fetching live matches from openfootball GitHub repository...");
  const response = await fetch("https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json");
  if (!response.ok) {
    throw new Error(`Failed to fetch World Cup matches: ${response.statusText}`);
  }
  */
  
  const data = await response.json();
  const apiMatches = data.matches || [];
  console.log(`Fetched ${apiMatches.length} matches from openfootball JSON.`);

  // Generate a summary representation of all currently finished matches in the external API
  const finishedSummary = apiMatches
    .filter(am => !!am.score && am.score.ft)
    .map(am => `${am.team1}-${am.team2}-${am.score.ft[0]}-${am.score.ft[1]}`)
    .sort()
    .join('|');

  if (dbType === 'firestore') {
    // Read the stored summary from metadata/sync
    const syncDoc = await firestoreDb.collection('metadata').doc('sync').get();
    if (syncDoc.exists && syncDoc.data().summary === finishedSummary) {
      console.log("No changes in finished matches from FIFA API. Skipping Firestore read operations.");
      return { checked: 0, updated: 0 };
    }
  }

  // Get current matches in our DB
  const dbMatches = await getMatches();
  const pendingMatches = dbMatches.filter(m => m.result === null);
  
  console.log(`Checking ${pendingMatches.length} pending matches in DB.`);
  let updatedCount = 0;

  for (const dbMatch of pendingMatches) {
    const normT1 = normalizeTeam(dbMatch.team1);
    const normT2 = normalizeTeam(dbMatch.team2);

    // Find corresponding match in API
    const apiMatch = apiMatches.find(am => {
      const amHome = normalizeTeam(am.team1);
      const amAway = normalizeTeam(am.team2);
      
      return (amHome === normT1 && amAway === normT2) || (amHome === normT2 && amAway === normT1);
    });

    if (apiMatch) {
      const isFinished = !!apiMatch.score;
      console.log(`Found match in API: ${dbMatch.team1} vs ${dbMatch.team2} (Finished: ${isFinished})`);
      
      if (isFinished) {
        // Determine the result relative to our team1 (local) and team2 (visitor)
        const apiHomeNorm = normalizeTeam(apiMatch.team1);
        const isT1Home = (apiHomeNorm === normT1);

        let result = null;
        
        const homeGoals = parseInt(apiMatch.score.ft[0]);
        const awayGoals = parseInt(apiMatch.score.ft[1]);

        if (isNaN(homeGoals) || isNaN(awayGoals)) {
          console.warn(`Invalid scores in API match: home=${apiMatch.score.ft[0]}, away=${apiMatch.score.ft[1]}`);
          continue;
        }

        if (homeGoals === awayGoals) {
          result = 'E';
        } else if (homeGoals > awayGoals) {
          result = isT1Home ? 'L' : 'V';
        } else {
          result = isT1Home ? 'V' : 'L';
        }

        if (result) {
          console.log(`Updating Match #${dbMatch.id} (${dbMatch.team1} vs ${dbMatch.team2}) to result: ${result}`);
          await updateMatchResult(dbMatch.id, result);
          updatedCount++;
        }
      }
    }
  }

  // If we successfully checked the matches, save the new summary to Firestore
  if (dbType === 'firestore') {
    await firestoreDb.collection('metadata').doc('sync').set({ summary: finishedSummary });
  }

  return { checked: pendingMatches.length, updated: updatedCount };
}

// Add push subscription to a user
async function savePushSubscription(userId, subscription) {
  if (!subscription || !subscription.endpoint) return;

  if (dbType === 'firestore') {
    const userRef = firestoreDb.collection('users').doc(userId);
    await firestoreDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(userRef);
      if (doc.exists) {
        const userData = doc.data();
        let subs = userData.pushSubscriptions || [];
        // Avoid duplicates
        if (!subs.some(s => s.endpoint === subscription.endpoint)) {
          subs.push(subscription);
          transaction.update(userRef, { pushSubscriptions: subs });
        }
      }
    });
  } else {
    const db = readDb();
    const user = db.users.find(u => u.id === userId);
    if (user) {
      if (!user.pushSubscriptions) user.pushSubscriptions = [];
      if (!user.pushSubscriptions.some(s => s.endpoint === subscription.endpoint)) {
        user.pushSubscriptions.push(subscription);
        writeDb(db);
      }
    }
  }
}

// Get user notifications
async function getNotificationsByUser(userId) {
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('notifications')
      .where('userId', '==', userId)
      .get();
    
    return snap.docs
      .map(doc => doc.data())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
  }

  const db = readDb();
  if (!db.notifications) db.notifications = [];
  return db.notifications
    .filter(n => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
}

// Mark notifications as read
async function markNotificationsAsRead(userId) {
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();
    
    if (!snap.empty) {
      const batch = firestoreDb.batch();
      snap.docs.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();
    }
  } else {
    const db = readDb();
    if (!db.notifications) db.notifications = [];
    let updated = false;
    db.notifications.forEach(n => {
      if (n.userId === userId && !n.read) {
        n.read = true;
        updated = true;
      }
    });
    if (updated) writeDb(db);
  }
}

// Notify users when match result updates
async function notifyUsersForMatch(matchId, result, matchDetails) {
  if (result === null) return;
  const resultDesc = result === 'E' ? 'Empate' : (result === 'L' ? 'Ganó ' + matchDetails.team1 : 'Ganó ' + matchDetails.team2);

  if (dbType === 'firestore') {
    const predsSnap = await firestoreDb.collection('predictions').where('matchId', '==', parseInt(matchId)).get();
    
    for (const doc of predsSnap.docs) {
      const pred = doc.data();
      const userId = pred.userId;
      
      // Check if notification already exists for this user and match
      const existingSnap = await firestoreDb.collection('notifications')
        .where('userId', '==', userId)
        .where('matchId', '==', parseInt(matchId))
        .limit(1)
        .get();
      
      if (!existingSnap.empty) continue;

      const isCorrect = pred.prediction === result;
      const title = isCorrect ? '¡Felicidades! 🎉' : 'Lástima 😢';
      const body = isCorrect 
        ? `Acertaste el partido ${matchDetails.team1} vs ${matchDetails.team2} (${resultDesc}). ¡Sumaste 3 puntos!`
        : `No acertaste el partido ${matchDetails.team1} vs ${matchDetails.team2} (${resultDesc}). No sumas puntos.`;

      // Save in-app notification
      const notificationId = generateId();
      const notification = {
        id: notificationId,
        userId: userId,
        matchId: parseInt(matchId),
        title,
        body,
        read: false,
        createdAt: new Date().toISOString()
      };
      await firestoreDb.collection('notifications').doc(notificationId).set(notification);

      // Send Web Push notification
      const userDoc = await firestoreDb.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.pushSubscriptions && userData.pushSubscriptions.length > 0) {
          const payload = JSON.stringify({ title, body });
          const updatedSubscriptions = [...userData.pushSubscriptions];
          let subChanged = false;

          for (const sub of userData.pushSubscriptions) {
            try {
              await webpush.sendNotification(sub, payload);
              console.log(`Push notification sent successfully to user ${userData.username}`);
            } catch (err) {
              console.error(`Failed to send push to user ${userData.username}`, err.statusCode);
              // If status code is 410 or 404, subscription is no longer valid
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
            await firestoreDb.collection('users').doc(userId).update({ pushSubscriptions: updatedSubscriptions });
          }
        }
      }
    }
  } else {
    // JSON logic
    const db = readDb();
    if (!db.notifications) db.notifications = [];
    
    const preds = db.predictions.filter(p => p.matchId === parseInt(matchId));
    
    for (const pred of preds) {
      const userId = pred.userId;
      
      // Check if notification already exists
      const exists = db.notifications.some(n => n.userId === userId && n.matchId === parseInt(matchId));
      if (exists) continue;

      const isCorrect = pred.prediction === result;
      const title = isCorrect ? '¡Felicidades! 🎉' : 'Lástima 😢';
      const body = isCorrect 
        ? `Acertaste el partido ${matchDetails.team1} vs ${matchDetails.team2} (${resultDesc}). ¡Sumaste 3 puntos!`
        : `No acertaste el partido ${matchDetails.team1} vs ${matchDetails.team2} (${resultDesc}). No sumas puntos.`;

      const notification = {
        id: generateId(),
        userId: userId,
        matchId: parseInt(matchId),
        title,
        body,
        read: false,
        createdAt: new Date().toISOString()
      };
      
      db.notifications.push(notification);
      writeDb(db); // Save to JSON

      // Send push notification
      const user = db.users.find(u => u.id === userId);
      if (user && user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        const payload = JSON.stringify({ title, body });
        const updatedSubscriptions = [...user.pushSubscriptions];
        let subChanged = false;

        for (const sub of user.pushSubscriptions) {
          try {
            await webpush.sendNotification(sub, payload);
            console.log(`Push notification sent successfully to user ${user.username}`);
          } catch (err) {
            console.error(`Failed to send push to user ${user.username}`, err.statusCode);
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
          user.pushSubscriptions = updatedSubscriptions;
          writeDb(db);
        }
      }
    }
  }
}

async function deleteUser(userId) {
  if (dbType === 'firestore') {
    // 1. Check if user exists and is an admin
    const userRef = firestoreDb.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new Error("Usuario no encontrado.");
    }
    const userData = userDoc.data();
    if (userData.isAdmin) {
      throw new Error("No se puede eliminar a un administrador.");
    }

    // 2. Delete user predictions
    const predsSnap = await firestoreDb.collection('predictions').where('userId', '==', userId).get();
    if (!predsSnap.empty) {
      const batch = firestoreDb.batch();
      predsSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 3. Delete user notifications
    const notificationsSnap = await firestoreDb.collection('notifications').where('userId', '==', userId).get();
    if (!notificationsSnap.empty) {
      const batch = firestoreDb.batch();
      notificationsSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 4. Delete the user itself
    await userRef.delete();
    invalidateCache();
  } else {
    // JSON logic
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      throw new Error("Usuario no encontrado.");
    }
    if (db.users[userIndex].isAdmin) {
      throw new Error("No se puede eliminar a un administrador.");
    }

    // Remove user
    db.users.splice(userIndex, 1);

    // Remove user predictions
    if (db.predictions) {
      db.predictions = db.predictions.filter(p => p.userId !== userId);
    }

    // Remove user notifications
    if (db.notifications) {
      db.notifications = db.notifications.filter(n => n.userId !== userId);
    }

    writeDb(db);
  }
}

// Reverse map for English to Spanish
const englishToSpanishTeamMap = {};
for (const [es, en] of Object.entries(teamNameMap)) {
  const normEn = en.toLowerCase().replace(/[^a-z0-9]/g, "");
  englishToSpanishTeamMap[normEn] = es;
}
// Special case
englishToSpanishTeamMap["bosniaherzegovina"] = "Bosnia y Herzegovina";

function translateTeamToSpanish(engName) {
  if (!engName) return "";
  const key = engName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return englishToSpanishTeamMap[key] || engName;
}

async function getTopScorers() {
  console.log("Obtención de goleadores desde la API externa deshabilitada.");
  return [];
  
  // Código inactivo:
  /*
  console.log("Fetching live matches for top scorers from openfootball...");
  const response = await fetch("https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json");
  if (!response.ok) {
    throw new Error(`Failed to fetch scorers: ${response.statusText}`);
  }
  */
  const data = await response.json();
  const matches = data.matches || [];
  
  const scorersMap = {};

  matches.forEach(m => {
    if (m.goals1 && Array.isArray(m.goals1)) {
      m.goals1.forEach(g => {
        const name = g.name;
        if (!scorersMap[name]) {
          scorersMap[name] = { name, team: translateTeamToSpanish(m.team1), goals: 0 };
        }
        scorersMap[name].goals++;
      });
    }
    if (m.goals2 && Array.isArray(m.goals2)) {
      m.goals2.forEach(g => {
        const name = g.name;
        if (!scorersMap[name]) {
          scorersMap[name] = { name, team: translateTeamToSpanish(m.team2), goals: 0 };
        }
        scorersMap[name].goals++;
      });
    }
  });

  return Object.values(scorersMap).sort((a, b) => b.goals - a.goals);
}

async function deleteNotification(notificationId, userId) {
  if (dbType === 'firestore') {
    const docRef = firestoreDb.collection('notifications').doc(notificationId);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error("Notificación no encontrada.");
    if (doc.data().userId !== userId) throw new Error("No tienes permiso para eliminar esta notificación.");
    await docRef.delete();
  } else {
    const db = readDb();
    if (!db.notifications) db.notifications = [];
    const index = db.notifications.findIndex(n => n.id === notificationId);
    if (index === -1) throw new Error("Notificación no encontrada.");
    if (db.notifications[index].userId !== userId) throw new Error("No tienes permiso para eliminar esta notificación.");
    db.notifications.splice(index, 1);
    writeDb(db);
  }
}

async function getMatchTrends() {
  if (dbType === 'firestore') {
    const now = Date.now();
    if (cache.trends.data && (now - cache.trends.timestamp) < CACHE_TTL_MS) {
      console.log("Serving trends from cache.");
      return cache.trends.data;
    }
  }

  // 1. Get all matches
  const matches = await getMatches();
  
  // 2. Filter matches that don't have a result (result === null) and are from Octavos
  const unplayedMatches = matches
    .filter(m => m.result === null && m.group === 'Octavos')
    .sort((a, b) => a.id - b.id);
    
  if (unplayedMatches.length === 0) {
    return [];
  }
  
  const matchIds = unplayedMatches.map(m => m.id);
  
  // 3. Fetch all predictions for these match IDs
  let predictions = [];
  let usersMap = {}; // id -> username
  
  if (dbType === 'firestore') {
    // Fetch users to map userId -> username
    const usersSnap = await firestoreDb.collection('users').get();
    usersSnap.docs.forEach(doc => {
      const u = doc.data();
      if (!u.isAdmin) {
        usersMap[u.id] = u.username;
      }
    });
    
    // Fetch predictions for the matchIds
    for (const mId of matchIds) {
      const predsSnap = await firestoreDb.collection('predictions')
        .where('matchId', '==', mId).get();
      predsSnap.docs.forEach(doc => {
        predictions.push(doc.data());
      });
    }
  } else {
    const db = readDb();
    (db.users || []).forEach(u => {
      if (!u.isAdmin) {
        usersMap[u.id] = u.username;
      }
    });
    predictions = (db.predictions || []).filter(p => matchIds.includes(p.matchId));
  }
  
  // 4. Aggregate L, E, V
  const trends = unplayedMatches.map(match => {
    const matchPreds = predictions.filter(p => p.matchId === match.id);
    
    const stats = {
      L: { count: 0, users: [] },
      E: { count: 0, users: [] },
      V: { count: 0, users: [] }
    };
    
    matchPreds.forEach(p => {
      const username = usersMap[p.userId];
      if (username && stats[p.prediction]) {
        stats[p.prediction].count++;
        stats[p.prediction].users.push(username);
      }
    });
    
    return {
      matchId: match.id,
      team1: match.team1,
      team2: match.team2,
      group: match.group,
      date: match.date,
      stats
    };
  });
  
  if (dbType === 'firestore') {
    cache.trends.data = trends;
    cache.trends.timestamp = Date.now();
  }
  
  return trends;
}

async function getMatchTrendsAll() {
  const matches = await getMatches();
  const sortedMatches = matches.sort((a, b) => a.id - b.id);
  if (sortedMatches.length === 0) {
    return [];
  }
  
  const matchIds = sortedMatches.map(m => m.id);
  let predictions = [];
  let usersMap = {};
  
  if (dbType === 'firestore') {
    const usersSnap = await firestoreDb.collection('users').get();
    usersSnap.docs.forEach(doc => {
      const u = doc.data();
      if (!u.isAdmin) {
        usersMap[u.id] = u.username;
      }
    });
    
    const predsSnap = await firestoreDb.collection('predictions').get();
    predsSnap.docs.forEach(doc => {
      predictions.push(doc.data());
    });
  } else {
    const db = readDb();
    (db.users || []).forEach(u => {
      if (!u.isAdmin) {
        usersMap[u.id] = u.username;
      }
    });
    predictions = (db.predictions || []);
  }
  
  const trends = sortedMatches.map(match => {
    const matchPreds = predictions.filter(p => p.matchId === match.id);
    
    const stats = {
      L: { count: 0, users: [] },
      E: { count: 0, users: [] },
      V: { count: 0, users: [] }
    };
    
    matchPreds.forEach(p => {
      const username = usersMap[p.userId];
      if (username && stats[p.prediction]) {
        stats[p.prediction].count++;
        stats[p.prediction].users.push(username);
      }
    });
    
    return {
      matchId: match.id,
      team1: match.team1,
      team2: match.team2,
      group: match.group,
      date: match.date,
      result: match.result,
      stats
    };
  });
  
  return trends;
}

async function getStreaks() {
  if (dbType === 'firestore') {
    const now = Date.now();
    if (cache.streaks.data && (now - cache.streaks.timestamp) < CACHE_TTL_MS) {
      console.log("Serving streaks from cache.");
      return cache.streaks.data;
    }
  }

  const matches = await getMatches();
  const finishedMatches = matches
    .filter(m => m.result !== null)
    .sort((a, b) => {
      if (a.updatedAt && b.updatedAt) {
        return new Date(a.updatedAt) - new Date(b.updatedAt);
      } else if (a.updatedAt) {
        return 1; // Put ones with date after ones without
      } else if (b.updatedAt) {
        return -1;
      }
      return (a.excelOrder || a.id) - (b.excelOrder || b.id);
    });

  let users = [];
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('users').get();
    users = snap.docs.map(doc => doc.data());
  } else {
    users = readDb().users;
  }
  const nonAdminUsers = users.filter(u => !u.isAdmin && u.username !== 'invitado');
  
  let allPredictions = [];
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('predictions').get();
    allPredictions = snap.docs.map(doc => doc.data());
  } else {
    allPredictions = readDb().predictions || [];
  }

  const userStreaks = nonAdminUsers.map(user => {
    let currentHits = 0;
    let currentMisses = 0;
    let recentHits = [];

    finishedMatches.forEach(match => {
      const pred = allPredictions.find(p => p.userId === user.id && p.matchId === match.id);
      if (!pred || pred.prediction !== match.result) {
        currentHits = 0;
        currentMisses++;
        recentHits = [];
      } else {
        currentHits++;
        currentMisses = 0;
        recentHits.push({
          matchId: match.id,
          team1: match.team1,
          team2: match.team2,
          prediction: pred.prediction,
          result: match.result,
          points: 3 // In Phase 1, an exact match is 3 points
        });
      }
    });

    return {
      id: user.id,
      username: user.username,
      points: user.points || 0,
      activeHits: currentHits,
      activeMisses: currentMisses,
      recentHits: recentHits
    };
  });

  let buenaRacha = [...userStreaks]
    .filter(u => u.activeHits > 0)
    .sort((a, b) => b.activeHits - a.activeHits || a.username.localeCompare(b.username))
    .slice(0, 3);

  if (buenaRacha.length === 0 && userStreaks.length > 0) {
    buenaRacha = [...userStreaks]
      .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username))
      .slice(0, 3)
      .map(u => ({ ...u, activeHits: 0 }));
  }

  let malaRacha = [...userStreaks]
    .filter(u => u.activeMisses > 0)
    .sort((a, b) => b.activeMisses - a.activeMisses || a.username.localeCompare(b.username))
    .slice(0, 3);

  if (malaRacha.length === 0 && userStreaks.length > 0) {
    malaRacha = [...userStreaks]
      .sort((a, b) => a.points - b.points || a.username.localeCompare(b.username))
      .slice(0, 3)
      .map(u => ({ ...u, activeMisses: 0 }));
  }

  const resultData = { buenaRacha, malaRacha };
  
  if (dbType === 'firestore') {
    cache.streaks.data = resultData;
    cache.streaks.timestamp = Date.now();
  }

  return resultData;
}

async function calculateWinningProbabilities() {
  // 1. Fetch matches
  const matches = await getMatches();
  const remainingMatches = matches.filter(m => m.result === null);
  
  // 2. Fetch users (non-admin, excluding guest user 'invitado')
  let users = [];
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('users').get();
    users = snap.docs.map(doc => doc.data());
  } else {
    users = readDb().users || [];
  }
  const participants = users.filter(u => !u.isAdmin && u.username !== 'invitado');

  // 3. Fetch all predictions
  let allPredictions = [];
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('predictions').get();
    allPredictions = snap.docs.map(doc => doc.data());
  } else {
    allPredictions = readDb().predictions || [];
  }

  // 4. If there are no remaining matches, the leader wins with 100%
  if (remainingMatches.length === 0) {
    const sorted = [...participants].sort((a, b) => (b.points || 0) - (a.points || 0));
    const maxPoints = sorted.length > 0 ? (sorted[0].points || 0) : 0;
    const leaders = sorted.filter(u => (u.points || 0) === maxPoints);
    return participants.map(u => {
      const isLeader = leaders.some(l => l.id === u.id);
      return {
        id: u.id,
        username: u.username,
        points: u.points || 0,
        probability: isLeader ? parseFloat((100 / leaders.length).toFixed(2)) : 0,
        hasChance: isLeader
      };
    });
  }

  // 5. Deterministic feasibility check for each participant
  const predMap = {};
  participants.forEach(u => {
    predMap[u.id] = {};
  });
  allPredictions.forEach(p => {
    if (predMap[p.userId]) {
      predMap[p.userId][p.matchId] = p.prediction;
    }
  });

  const hasChanceMap = {};
  participants.forEach(u => {
    const currentPointsU = u.points || 0;
    let predictedRemainingCountU = 0;
    remainingMatches.forEach(m => {
      if (predMap[u.id][m.id] !== undefined && predMap[u.id][m.id] !== null) {
        predictedRemainingCountU++;
      }
    });
    const maxScoreU = currentPointsU + 3 * predictedRemainingCountU;

    let canWin = true;
    for (const v of participants) {
      if (v.id === u.id) continue;
      const currentPointsV = v.points || 0;
      let sharedPredictionsCount = 0;
      remainingMatches.forEach(m => {
        const predU = predMap[u.id][m.id];
        const predV = predMap[v.id][m.id];
        if (predU !== undefined && predU !== null && predV === predU) {
          sharedPredictionsCount++;
        }
      });
      const scoreVUnderUBest = currentPointsV + 3 * sharedPredictionsCount;
      if (maxScoreU < scoreVUnderUBest) {
        canWin = false;
        break;
      }
    }
    hasChanceMap[u.id] = canWin;
  });

  // 6. Monte Carlo Simulation
  const numSimulations = 10000;
  const winCounts = {};
  participants.forEach(u => {
    winCounts[u.id] = 0;
  });

  const remainingPredsList = {};
  participants.forEach(u => {
    remainingPredsList[u.id] = remainingMatches.map(m => predMap[u.id][m.id]);
  });

  const outcomes = ['L', 'E', 'V'];

  for (let sim = 0; sim < numSimulations; sim++) {
    const simulatedOutcomes = remainingMatches.map(() => outcomes[Math.floor(Math.random() * 3)]);

    let maxScore = -1;
    let leaders = [];

    participants.forEach(u => {
      let simScore = u.points || 0;
      const uPreds = remainingPredsList[u.id];
      for (let i = 0; i < simulatedOutcomes.length; i++) {
        if (uPreds[i] === simulatedOutcomes[i]) {
          simScore += 3;
        }
      }

      if (simScore > maxScore) {
        maxScore = simScore;
        leaders = [u.id];
      } else if (simScore === maxScore) {
        leaders.push(u.id);
      }
    });

    const tieCount = leaders.length;
    leaders.forEach(leadId => {
      winCounts[leadId] += 1 / tieCount;
    });
  }

  // 7. Compile results
  return participants.map(u => {
    const probability = (winCounts[u.id] / numSimulations) * 100;
    return {
      id: u.id,
      username: u.username,
      points: u.points || 0,
      probability: parseFloat(probability.toFixed(2)),
      hasChance: hasChanceMap[u.id]
    };
  }).sort((a, b) => b.probability - a.probability || b.points - a.points || a.username.localeCompare(b.username));
}

async function resetUserPassword(userId, newPassword) {
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(newPassword, salt);

  if (dbType === 'firestore') {
    const userRef = firestoreDb.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error("Usuario no encontrado.");
    
    await userRef.update({ password: hashedPassword });
  } else {
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("Usuario no encontrado.");
    
    db.users[userIndex].password = hashedPassword;
    writeDb(db);
  }
}

async function updateProfilePic(userId, profilePic) {
  if (dbType === 'firestore') {
    const userRef = firestoreDb.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error("Usuario no encontrado.");
    
    await userRef.update({ profilePic });
  } else {
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("Usuario no encontrado.");
    
    db.users[userIndex].profilePic = profilePic;
    writeDb(db);
  }
}

module.exports = {
  initDb,
  getUsers: async () => {
    if (dbType === 'firestore') {
      const snap = await firestoreDb.collection('users').get();
      return snap.docs.map(doc => doc.data());
    }
    return readDb().users;
  },
  getMatches,
  updateMatchResult,
  getPredictionsByUser,
  savePredictions,
  getLeaderboard,
  getUserPredictionsDetail,
  registerUser,
  verifyUserPassword,
  findUserByUsername,
  findUserByEmail,
  findUserById,
  syncFifaResults,
  savePushSubscription,
  getNotificationsByUser,
  markNotificationsAsRead,
  deleteUser,
  getTopScorers,
  deleteNotification,
  getMatchTrends,
  getMatchTrendsAll,
  getStreaks,
  calculateWinningProbabilities,
  resetUserPassword,
  updateProfilePic,
  getDbType: () => dbType
};
