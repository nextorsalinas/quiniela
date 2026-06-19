const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error("No serviceAccountKey.json found.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();

async function checkMatches() {
  console.log("Consultando colección 'matches' en Firestore...");
  
  const allSnap = await db.collection('matches').get();
  console.log(`Total de documentos en 'matches': ${allSnap.size}`);

  const withOrderSnap = await db.collection('matches').orderBy('excelOrder').get();
  console.log(`Documentos con 'excelOrder' (vía orderBy): ${withOrderSnap.size}`);

  if (allSnap.size > 0 && withOrderSnap.size === 0) {
    console.error("ALERTA: Se encontraron partidos pero ninguno tiene el campo 'excelOrder' o el índice no funciona.");
    
    // Mostrar el primer documento para ver qué tiene
    console.log("Primer documento de muestra:");
    console.log(allSnap.docs[0].data());
  }

  process.exit(0);
}

checkMatches().catch(err => {
  console.error(err);
  process.exit(1);
});
