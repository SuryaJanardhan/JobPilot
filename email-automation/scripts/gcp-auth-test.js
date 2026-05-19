// scripts/gcp-auth-test.js
// Minimal test to verify Google Sheets API authentication in GitHub Actions

const { google } = require("googleapis");
const path = require("path");

async function testAuth() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(
        __dirname,
        "../seismic-rarity-468405-j1-cd12fe29c298.json",
      ),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    // Try to get spreadsheet metadata (replace with your actual spreadsheetId if needed)
    const spreadsheetId = "1bPYyC4wrnSfz8swLO2NGgMigfNo1cSwhhTgPud-5QLE";
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    console.log(
      "SUCCESS: Able to access spreadsheet title:",
      res.data.properties.title,
    );
  } catch (err) {
    console.error("FAILED: Google Sheets API auth test:", err.message);
    process.exit(1);
  }
}

testAuth();
