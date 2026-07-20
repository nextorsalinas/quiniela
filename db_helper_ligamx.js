const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

let firestoreDb = null;
let dbType = 'json'; // 'firestore' or 'json'

const dbPath = path.join(__dirname, 'db.json');
const excelPath = path.join(__dirname, 'Apertura_2026.xlsx');

// Initialize Firebase Admin if not already initialized
try {
  const admin = require('firebase-admin');
  if (process.env.FIREBASE_CONFIG || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    firestoreDb = admin.firestore();
    dbType = 'firestore';
    console.log("Liga MX: Firebase Admin initialized. USING FIRESTORE DB!");
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
      console.log("Liga MX: Firebase initialized via serviceAccountKey.json");
    } else {
      console.log("Liga MX: No Firebase configuration found. USING LOCAL JSON!");
    }
  }
} catch (e) {
  console.log("Liga MX: Firebase initialization skipped/failed. USING LOCAL JSON!", e.message);
}

function readDb() {
  let db = { users: [], ligamx_matches: [], ligamx_predictions: [] };
  if (fs.existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      console.error("Liga MX: Error reading db.json", e);
    }
  }
  if (!db.ligamx_matches) db.ligamx_matches = [];
  if (!db.ligamx_predictions) db.ligamx_predictions = [];
  if (!db.users) db.users = [];
  return db;
}

function writeDb(db) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("Liga MX: Error writing db.json", e);
  }
}

// Helper to parse the Excel file
function parseExcelMatches() {
  if (!fs.existsSync(excelPath)) {
    console.log(`Liga MX: Excel file not found at ${excelPath}. Skipping sync.`);
    return [];
  }

  try {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);
    
    return rows.map((row, index) => {
      // Find keys in a case-insensitive, space-insensitive way
      const findKey = (pattern) => {
        return Object.keys(row).find(k => k.trim().toLowerCase().replace(/\s+/g, '') === pattern.toLowerCase());
      };

      const localKey = findKey('local');
      const visitanteKey = findKey('visitante');
      const fechaKey = findKey('fecha');
      const horaKey = findKey('hora');
      const jornadaKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'jornada');

      const local = row[localKey] || 'TBD';
      const visitante = row[visitanteKey] || 'TBD';
      let date = row[fechaKey] || 'TBD';
      
      if (typeof date === 'number' || !isNaN(Number(date))) {
        const num = Number(date);
        if (num > 40000) {
          const jsDate = new Date((num - 25569) * 86400 * 1000);
          const day = String(jsDate.getUTCDate()).padStart(2, '0');
          const month = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
          const year = jsDate.getUTCFullYear();
          date = `${day}/${month}/${year}`;
        }
      }
      
      const time = row[horaKey] || 'TBD';
      const jornada = parseInt(row[jornadaKey]) || 1;

      // Try to parse goals/results if present
      const glKey = Object.keys(row).find(k => k.toLowerCase().includes('goles') && (k.toLowerCase().includes('local') || k.toLowerCase().includes('l')));
      const gvKey = Object.keys(row).find(k => k.toLowerCase().includes('goles') && (k.toLowerCase().includes('visitante') || k.toLowerCase().includes('v')));
      
      let result = null;
      if (glKey && gvKey && row[glKey] !== undefined && row[gvKey] !== undefined && row[glKey] !== '' && row[gvKey] !== '') {
        const team1Score = parseInt(row[glKey]);
        const team2Score = parseInt(row[gvKey]);
        if (!isNaN(team1Score) && !isNaN(team2Score)) {
          const winner = team1Score > team2Score ? 'L' : (team1Score < team2Score ? 'V' : 'E');
          result = { team1Score, team2Score, winner };
        }
      }

      // Generate a stable composite ID based on jornada, local, visitor
      const idStr = `mx_${jornada}_${local.replace(/\s+/g, '')}_${visitante.replace(/\s+/g, '')}`.toLowerCase().replace(/[^a-z0-9_]/g, '');

      return {
        id: idStr,
        jornada,
        date: `${date} ${time}`.trim(),
        team1: local,
        team2: visitante,
        result
      };
    });
  } catch (err) {
    console.error("Liga MX: Error parsing excel file:", err);
    return [];
  }
}

// Sync Excel matches to database on startup
async function initDb() {
  const excelMatches = parseExcelMatches();
  if (excelMatches.length === 0) return;

  console.log(`Liga MX: Found ${excelMatches.length} matches in Apertura_2026.xlsx. Syncing...`);

  if (dbType === 'firestore') {
    for (const match of excelMatches) {
      const docRef = firestoreDb.collection('ligamx_matches').doc(match.id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        await docRef.set(match);
        console.log(`Liga MX: Created match ${match.id} (${match.team1} vs ${match.team2})`);
      } else {
        // Keep existing results if Excel doesn't have it, but update dates or result if excel has it
        const currentData = docSnap.data();
        const updatedData = { ...currentData, date: match.date };
        if (match.result !== null) {
          updatedData.result = match.result;
        }
        await docRef.set(updatedData);
      }
    }
  } else {
    // Local JSON
    const db = readDb();
    excelMatches.forEach(match => {
      const existingIndex = db.ligamx_matches.findIndex(m => m.id === match.id);
      if (existingIndex === -1) {
        db.ligamx_matches.push(match);
        console.log(`Liga MX (Local): Created match ${match.id}`);
      } else {
        db.ligamx_matches[existingIndex].date = match.date;
        if (match.result !== null) {
          db.ligamx_matches[existingIndex].result = match.result;
        }
      }
    });
    writeDb(db);
  }
  console.log("Liga MX: Database sync complete.");
}

async function getMatches() {
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('ligamx_matches').get();
    return snap.docs.map(doc => doc.data());
  } else {
    return readDb().ligamx_matches;
  }
}

async function getPredictionsByUser(userId) {
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('ligamx_predictions').where('userId', '==', userId).get();
    return snap.docs.map(doc => doc.data());
  } else {
    return readDb().ligamx_predictions.filter(p => p.userId === userId);
  }
}

async function savePredictions(userId, matchPredictions) {
  if (dbType === 'firestore') {
    const batch = firestoreDb.batch();
    for (const pred of matchPredictions) {
      const docId = `${userId}_${pred.matchId}`;
      const docRef = firestoreDb.collection('ligamx_predictions').doc(docId);
      
      const predObj = {
        userId,
        matchId: pred.matchId,
        prediction: {
          winner: pred.prediction.winner, // 'L', 'E', 'V'
          team1Score: parseInt(pred.prediction.team1Score),
          team2Score: parseInt(pred.prediction.team2Score)
        },
        timestamp: new Date().toISOString()
      };
      
      batch.set(docRef, predObj, { merge: true });
    }
    await batch.commit();
  } else {
    const db = readDb();
    for (const pred of matchPredictions) {
      const matchId = pred.matchId;
      const existingIndex = db.ligamx_predictions.findIndex(p => p.userId === userId && p.matchId === matchId);
      const predObj = {
        userId,
        matchId,
        prediction: {
          winner: pred.prediction.winner,
          team1Score: parseInt(pred.prediction.team1Score),
          team2Score: parseInt(pred.prediction.team2Score)
        },
        timestamp: new Date().toISOString()
      };

      if (existingIndex !== -1) {
        db.ligamx_predictions[existingIndex] = predObj;
      } else {
        db.ligamx_predictions.push(predObj);
      }
    }
    writeDb(db);
  }
}

async function getUserPredictionsDetail(userId) {
  const matches = await getMatches();
  const userPreds = await getPredictionsByUser(userId);
  
  const predictionsMap = {};
  userPreds.forEach(p => {
    predictionsMap[p.matchId] = p.prediction;
  });

  return {
    userId,
    predictions: predictionsMap
  };
}

function calculatePoints(matchResult, predValue) {
  if (!matchResult || matchResult.team1Score === undefined || !predValue || predValue.team1Score === undefined) return 0;
  const r1 = parseInt(matchResult.team1Score);
  const r2 = parseInt(matchResult.team2Score);
  const p1 = parseInt(predValue.team1Score);
  const p2 = parseInt(predValue.team2Score);
  if (isNaN(r1) || isNaN(r2) || isNaN(p1) || isNaN(p2)) return 0;
  
  const realWinner = matchResult.winner || (r1 > r2 ? 'L' : (r1 < r2 ? 'V' : 'E'));
  const predWinner = predValue.winner || (p1 > p2 ? 'L' : (p1 < p2 ? 'V' : 'E'));
  
  // 2 points for exact score, 1 point for correct outcome (L, E, V)
  if (r1 === p1 && r2 === p2) {
    return 2; // Exact score (implicitly gets outcome correct)
  }
  if (realWinner === predWinner) {
    return 1; // Correct outcome only
  }
  return 0;
}

async function getLeaderboard() {
  let users = [];
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('users').get();
    users = snap.docs.map(doc => ({ id: doc.id, username: doc.data().username, isAdmin: doc.data().isAdmin, profilePic: doc.data().profilePic || '' }));
  } else {
    users = readDb().users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, profilePic: u.profilePic || '' }));
  }

  const matches = await getMatches();
  const playedMatches = matches.filter(m => m.result !== null);

  let allPredictions = [];
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('ligamx_predictions').get();
    allPredictions = snap.docs.map(doc => doc.data());
  } else {
    allPredictions = readDb().ligamx_predictions || [];
  }

  const leaderboard = users.map(user => {
    let points = 0;
    let hits = 0; // Correct winner
    let exacts = 0; // Correct score
    let totalPredictions = allPredictions.filter(p => p.userId === user.id).length;

    playedMatches.forEach(match => {
      const pred = allPredictions.find(p => p.userId === user.id && p.matchId === match.id);
      if (pred && pred.prediction) {
        const pts = calculatePoints(match.result, pred.prediction);
        points += pts;
        
        const r1 = parseInt(match.result.team1Score);
        const r2 = parseInt(match.result.team2Score);
        const p1 = parseInt(pred.prediction.team1Score);
        const p2 = parseInt(pred.prediction.team2Score);
        const realWinner = match.result.winner || (r1 > r2 ? 'L' : (r1 < r2 ? 'V' : 'E'));
        const predWinner = pred.prediction.winner || (p1 > p2 ? 'L' : (p1 < p2 ? 'V' : 'E'));

        if (realWinner === predWinner) hits++;
        if (r1 === p1 && r2 === p2) exacts++;
      }
    });

    return {
      userId: user.id,
      username: user.username,
      profilePic: user.profilePic,
      points,
      hits,
      exacts,
      predictionCount: totalPredictions
    };
  });

  return leaderboard
    .filter(user => user.predictionCount > 0)
    .sort((a, b) => b.points - a.points || b.exacts - a.exacts || b.hits - a.hits || a.username.localeCompare(b.username));
}

async function updateMatchResult(matchId, result) {
  // result = { team1Score, team2Score }
  const winner = result.team1Score > result.team2Score ? 'L' : (result.team1Score < result.team2Score ? 'V' : 'E');
  const resultObj = {
    team1Score: parseInt(result.team1Score),
    team2Score: parseInt(result.team2Score),
    winner
  };

  if (dbType === 'firestore') {
    const docRef = firestoreDb.collection('ligamx_matches').doc(matchId);
    await docRef.update({ result: resultObj });
  } else {
    const db = readDb();
    const existingIndex = db.ligamx_matches.findIndex(m => m.id === matchId);
    if (existingIndex !== -1) {
      db.ligamx_matches[existingIndex].result = resultObj;
      writeDb(db);
    }
  }
}

async function getMatchTrends(includeVoters) {
  const matches = await getMatches();
  if (matches.length === 0) return [];

  const matchIds = matches.map(m => m.id);

  let predictions = [];
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('ligamx_predictions').get();
    predictions = snap.docs.map(doc => doc.data());
  } else {
    predictions = (readDb().ligamx_predictions || []).filter(p => matchIds.includes(p.matchId));
  }

  // Get usernames
  let users = [];
  if (dbType === 'firestore' && includeVoters) {
    const snap = await firestoreDb.collection('users').get();
    users = snap.docs.map(doc => ({ id: doc.id, username: doc.data().username }));
  } else if (includeVoters) {
    users = readDb().users;
  }

  const trends = matches.map(match => {
    const matchPreds = predictions.filter(p => p.matchId === match.id);
    const stats = {
      L: { count: 0, users: [] },
      E: { count: 0, users: [] },
      V: { count: 0, users: [] }
    };

    matchPreds.forEach(p => {
      if (p.prediction && p.prediction.winner) {
        const outcome = p.prediction.winner; // 'L', 'E', 'V'
        if (stats[outcome]) {
          stats[outcome].count++;
          if (includeVoters) {
            const user = users.find(u => u.id === p.userId);
            if (user) {
              stats[outcome].users.push(`${user.username} (${p.prediction.team1Score}-${p.prediction.team2Score})`);
            }
          }
        }
      }
    });

    return {
      matchId: match.id,
      team1: match.team1,
      team2: match.team2,
      jornada: match.jornada,
      date: match.date,
      stats
    };
  });

  return trends;
}

async function getConfig() {
  if (dbType === 'firestore') {
    const doc = await firestoreDb.collection('ligamx_config').doc('global').get();
    if (!doc.exists) {
      await firestoreDb.collection('ligamx_config').doc('global').set({ predictionsPaused: false });
      return { predictionsPaused: false };
    }
    return doc.data();
  }
  const db = readDb();
  if (!db.ligamx_config) {
    db.ligamx_config = { predictionsPaused: false };
    writeDb(db);
  }
  return db.ligamx_config;
}

async function togglePredictionsPaused() {
  const current = await getConfig();
  const newVal = !current.predictionsPaused;
  if (dbType === 'firestore') {
    await firestoreDb.collection('ligamx_config').doc('global').set({ predictionsPaused: newVal });
    return { predictionsPaused: newVal };
  }
  const db = readDb();
  if (!db.ligamx_config) db.ligamx_config = {};
  db.ligamx_config.predictionsPaused = newVal;
  writeDb(db);
  return db.ligamx_config;
}

module.exports = {
  initDb,
  getMatches,
  getPredictionsByUser,
  savePredictions,
  getUserPredictionsDetail,
  getLeaderboard,
  updateMatchResult,
  getMatchTrends,
  getConfig,
  togglePredictionsPaused
};
