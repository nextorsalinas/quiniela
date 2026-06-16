const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const firestoreDb = admin.firestore();

async function run() {
  const usernameQuery = process.argv[2];
  const newPassword = process.argv[3];

  if (!usernameQuery || !newPassword) {
    console.error("Uso: node reset_password.js <username> <new_password>");
    process.exit(1);
  }

  const queryLower = usernameQuery.toLowerCase().trim();
  
  try {
    // Buscar usuario por nombre en minúsculas (para soportar espacios/mayúsculas parciales)
    // Opcionalmente podemos iterar sobre todos si no hay un campo exacto, pero `username_lower` está en el registro.
    const snap = await firestoreDb.collection('users').get();
    let userDoc = null;
    
    snap.forEach(doc => {
      const data = doc.data();
      if (data.username && data.username.toLowerCase().includes(queryLower)) {
        userDoc = doc;
      }
    });

    if (!userDoc) {
      console.error(`No se encontró ningún usuario que coincida con: ${usernameQuery}`);
      process.exit(1);
    }

    const userId = userDoc.id;
    const userData = userDoc.data();
    console.log(`Usuario encontrado: ${userData.username} (ID: ${userId})`);

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    await firestoreDb.collection('users').doc(userId).update({
      password: hashedPassword
    });

    console.log(`¡Éxito! Contraseña actualizada a: ${newPassword}`);
  } catch (err) {
    console.error("Error al actualizar la contraseña:", err);
  }
}
run();
