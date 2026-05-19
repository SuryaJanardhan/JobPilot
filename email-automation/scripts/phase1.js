const { google } = require("googleapis");
const path = require("path");

/**
 * Phase 1: Load and filter unsent emails from Google Sheets
 * @returns {Array} Array of unsent email objects
 */
async function loadUnsentEmails(sheetLink) {
  try {
    console.log("Loading data from Google Sheets...");

    // Extract spreadsheet ID from the URL
    const spreadsheetId = sheetLink.match(/\/d\/([a-zA-Z0-9-_]+)/)[1];

    // Authenticate with service account
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(
        __dirname,
        "..",
        "youtube-comments-468405-69c215cd5075.json",
      ),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Read data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:B", // Assuming data is in columns A and B
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log("No data found in the sheet.");
      return [];
    }

    const data = [];

    // Skip header row, process data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.length >= 1) {
        // Changed from >= 2 to >= 1
        data.push({
          email: row[0], // Column A
          sent_status: row[1] || "", // Column B, default to empty if not present
        });
      }
    }

    console.log(`Loaded ${data.length} rows from Google Sheets`);

    // Filter emails where sent_status is not 'email sent'
    const unsentEmails = data.filter((row) => row.sent_status !== "email sent");

    return unsentEmails;
  } catch (error) {
    console.error("❌ Failed to read from Google Sheets. Possible issues:");
    console.error("1. Service account JSON file is missing or invalid");
    console.error("2. Sheet link is incorrect");
    console.error("3. Service account doesn't have access to the sheet");
    console.error("4. Sheet structure is different than expected");
    console.error("\nPlease check your setup and try again.");
    console.error("Error details:", error.message);
    throw error;
  }
}

module.exports = { loadUnsentEmails };
