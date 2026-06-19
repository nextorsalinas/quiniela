const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function debug() {
  console.log("--- DEBUG DE RACHAS ACTIVAS ---");

  // 1. Obtener partidos finalizados ordenados por excelOrder
  const matchesSnap = await db.collection('matches').get();
  const finishedMatches = matchesSnap.docs
    .map(d => d.data())
    .filter(m => m.result !== null)
    .sort((a, b) => (a.excelOrder || a.id) - (b.excelOrder || b.id));

  console.log(`Partidos finalizados encontrados: ${finishedMatches.length}`);
  if (finishedMatches.length > 0) {
    const last = finishedMatches[finishedMatches.length - 1];
    console.log(`Último partido (ExcelOrder ${last.excelOrder}): ${last.team1} vs ${last.team2} -> Resultado: ${last.result}`);
  }

  // 2. Obtener usuarios
  const usersSnap = await db.collection('users').where('isAdmin', '==', false).get();
  const users = usersSnap.docs.map(d => d.data());

  // 3. Obtener todas las predicciones
  const predsSnap = await db.collection('predictions').get();
  const allPreds = predsSnap.docs.map(d => d.data());

  console.log(`Analizando ${users.length} usuarios...`);

  users.forEach(user => {
    let currentHits = 0;
    let history = [];

    finishedMatches.forEach(match => {
      const pred = allPreds.find(p => p.userId === user.id && p.matchId === match.id);
      const isHit = pred && pred.prediction === match.result;
      
      if (isHit) {
        currentHits++;
      } else {
        currentHits = 0;
      }
      history.push({ matchId: match.id, pred: pred ? pred.prediction : 'None', result: match.result, isHit });
    });

    if (currentHits > 0 || user.username === 'Liliana') {
      console.log(`\nUsuario: ${user.username}`);
      console.log(`Racha Activa: ${currentHits}`);
      console.log(`Últimos 3 partidos del usuario:`);
      history.slice(-3).forEach(h => {
        console.log(`  Match ${h.matchId}: Pred=${h.pred}, Res=${h.result} -> ${h.isHit ? 'ACIERTO' : 'FALLO'}`);
      });
    }
  });

  process.exit(0);
}

debug().catch(console.error);
