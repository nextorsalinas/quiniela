const dbHelper = require('./db_helper');

async function test() {
  await dbHelper.initDb();
  try {
    const user = await dbHelper.verifyUserPassword('Liliana', 'mundial');
    console.log("Logged in:", user);
  } catch (e) {
    console.error(e);
  }
  process.exit();
}
test();
