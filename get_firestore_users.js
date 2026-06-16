const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.log("No serviceAccountKey.json found");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const firestoreDb = admin.firestore();

async function run() {
  try {
    const usersSnap = await firestoreDb.collection('users').get();
    console.log("--- USERS ---");
    usersSnap.forEach(doc => {
      console.log(doc.id, doc.data());
    });
    
    console.log("\n--- COLLECTIONS ---");
    const collections = await firestoreDb.listCollections();
    console.log(collections.map(c => c.id).join(", "));
  } catch (err) {
    console.error(err);
  }
}
run();
