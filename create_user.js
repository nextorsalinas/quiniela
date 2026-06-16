const dbHelper = require('./db_helper');

async function run() {
  await dbHelper.initDb();
  try {
    const newUser = await dbHelper.registerUser('Liliana', '', 'mundial');
    console.log("Usuario creado:", newUser.username);
  } catch (err) {
    console.error("Error al crear usuario:", err);
  }
  process.exit(0);
}

run();
