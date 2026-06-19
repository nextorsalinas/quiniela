const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function checkResults() {
  const snap = await db.collection('matches').get();
  const finished = snap.docs.filter(d => d.data().result !== null).length;
  console.log(`Partidos totales: ${snap.size}`);
  console.log(`Partidos con resultado: ${finished}`);
  
  if (snap.size > 0) {
    console.log("Muestra del primer partido:");
    console.log(snap.docs[0].data());
  }
  process.exit(0);
}

checkResults().catch(err => { console.error(err); process.exit(1); });
