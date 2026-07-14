const dbHelper = require('./db_helper.js');

async function test() {
  try {
    console.log("Calling getMatchTrendsAll()...");
    const trends = await dbHelper.getMatchTrendsAll();
    console.log("Success! Total matches returned:", trends.length);
    if (trends.length > 0) {
      console.log("Sample trends structure:", JSON.stringify(trends[0], null, 2));
    }
  } catch (err) {
    console.error("ERROR running getMatchTrendsAll():", err);
  }
  process.exit(0);
}

test();
