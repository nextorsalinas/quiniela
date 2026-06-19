const dbHelper = require('./db_helper');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

async function run() {
  console.log("Iniciando script para corregir el orden de los partidos según el Excel...");
  
  // 1. Leer el Excel para obtener el orden real
  const excelPath = path.join(__dirname, 'Quiniela_Mundial_2026_Fase_Grupos.xlsx');
  if (!fs.existsSync(excelPath)) {
    console.error("No se encontró el archivo Excel.");
    process.exit(1);
  }

  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets['Mi Quiniela'];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  const excelOrderMap = {}; // matchId -> excelOrder
  let counter = 1;
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    if (row && row[0] !== undefined) {
      const matchId = parseInt(row[0]);
      if (!isNaN(matchId)) {
        excelOrderMap[matchId] = counter++;
      }
    }
  }

  console.log(`Mapeados ${Object.keys(excelOrderMap).length} partidos desde el Excel.`);

  // 2. Inicializar DB (para detectar si es Firestore o JSON)
  await dbHelper.initDb();
  
  console.log(`Actualizando partidos en la base de datos...`);

  // Usar acceso directo a Firestore
  const admin = require('firebase-admin');
  const isFirestore = admin.apps.length > 0;

  if (isFirestore) {
    const db = admin.firestore();
    const batch = db.batch();
    let updatedCount = 0;
    
    for (const [mId, order] of Object.entries(excelOrderMap)) {
      const ref = db.collection('matches').doc(String(mId));
      batch.update(ref, { excelOrder: order });
      updatedCount++;
    }
    await batch.commit();
    console.log(`Firestore actualizado con éxito (${updatedCount} partidos).`);
  } else {
    // JSON logic (ya manejado por getMatches si es JSON y se vuelve a escribir)
    const dbPath = path.join(__dirname, 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    db.matches.forEach(m => {
      const order = excelOrderMap[m.id];
      if (order !== undefined) {
        m.excelOrder = order;
      }
    });
    
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log("Archivo db.json actualizado con éxito.");
  }

  console.log("Proceso finalizado.");
  process.exit(0);
}

run().catch(err => {
  console.error("Error ejecutando el script:", err);
  process.exit(1);
});
