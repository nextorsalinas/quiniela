const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function check() {
  console.log("--- INSPECCIÓN DE DATOS ---");

  // 1. Ver usuarios
  const usersSnap = await db.collection('users').get();
  console.log(`Total usuarios: ${usersSnap.size}`);
  usersSnap.docs.forEach(d => {
    const u = d.data();
    console.log(`  - ${u.username} (ID: ${u.id}, isAdmin: ${u.isAdmin}, type: ${typeof u.isAdmin})`);
  });

  // 2. Ver predicciones (muestra)
  const predsSnap = await db.collection('predictions').limit(5).get();
  console.log(`\nMuestra de predicciones:`);
  predsSnap.docs.forEach(d => {
    const p = d.data();
    console.log(`  - User: ${p.userId}, Match: ${p.matchId} (type: ${typeof p.matchId}), Pred: ${p.prediction}`);
  });

  // 3. Ver partidos (muestra)
  const matchesSnap = await db.collection('matches').limit(5).get();
  console.log(`\nMuestra de partidos:`);
  matchesSnap.docs.forEach(d => {
    const m = d.data();
    console.log(`  - ID: ${m.id} (type: ${typeof m.id}), Team: ${m.team1}`);
  });

  process.exit(0);
}

check().catch(console.error);
