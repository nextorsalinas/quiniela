const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function check() {
  const usersSnap = await db.collection('users').get();
  console.log(`Usuarios: ${usersSnap.size}`);
  
  const predsSnap = await db.collection('predictions').get();
  console.log(`Predicciones: ${predsSnap.size}`);

  const matchesSnap = await db.collection('matches').where('result', '!=', null).get();
  console.log(`Partidos con resultado: ${matchesSnap.size}`);

  process.exit(0);
}

check().catch(console.error);
