const { google } = require("googleapis");
const path = require("path");

// Google Sheets quota: 60 write requests per minute
// We'll stop at 50% = 30 requests per minute to be safe
const QUOTA_LIMIT_PER_MINUTE = 60;
const SAFE_QUOTA_PERCENT = 0.5;
const MAX_WRITES_PER_MINUTE = Math.floor(QUOTA_LIMIT_PER_MINUTE * SAFE_QUOTA_PERCENT);
const BATCH_SIZE = 10; // Max updates per batchUpdate call

let writeCountThisMinute = 0;
let minuteStartTime = Date.now();

function resetQuotaIfNewMinute() {
  const now = Date.now();
  if (now - minuteStartTime >= 60000) {
    writeCountThisMinute = 0;
    minuteStartTime = now;
  }
}

function canWrite() {
  resetQuotaIfNewMinute();
  return writeCountThisMinute < MAX_WRITES_PER_MINUTE;
}

function incrementWriteCount() {
  writeCountThisMinute++;
  console.log(`  [Quota] ${writeCountThisMinute}/${MAX_WRITES_PER_MINUTE} writes this minute`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Phase 4: Update sent status in Google Sheets (with quota protection)
 */
async function updateSentStatus(sheetLink, sentEmails) {
  try {
    console.log("Updating sent status in Google Sheets...");
    console.log(`  [Quota] Max ${MAX_WRITES_PER_MINUTE} writes/minute (50% of limit)`);

    // Extract spreadsheet ID from the URL
    const spreadsheetId = sheetLink.match(/\/d\/([a-zA-Z0-9-_]+)/)[1];

    // Authenticate with service account (needs write access)
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(
        __dirname,
        "..",
        "seismic-rarity-468405-j1-cd12fe29c298.json",
      ),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // First, ensure headers exist for error and sent_at columns
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A1:D1",
    });

    const headers = headerResponse.data.values?.[0] || [];
    const headerUpdates = [];

    if (!headers[2] || headers[2] !== "error") {
      headerUpdates.push({ range: "Sheet1!C1", values: [["error"]] });
    }
    if (!headers[3] || headers[3] !== "sent_at") {
      headerUpdates.push({ range: "Sheet1!D1", values: [["sent_at"]] });
    }

    if (!canWrite()) {
      console.log("⚠️ Quota limit reached (50%), skipping header update");
    } else if (headerUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: { data: headerUpdates, valueInputOption: "RAW" },
      });
      incrementWriteCount();
      console.log("Added missing column headers (error, sent_at)");
    }

    // Read the current data to find rows to update
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:D",
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log("No data found in the sheet.");
      return;
    }

    const updates = [];
    let updatedCount = 0;
    const timestamp = new Date().toISOString(); // Current timestamp

    // Prepare updates for sent emails
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.length >= 1) {
        const emailValue = row[0]; // Column A

        if (emailValue && sentEmails.includes(emailValue)) {
          // Update column B (sent_status) to "email sent"
          updates.push({
            range: `Sheet1!B${i + 1}`,
            values: [["email sent"]],
          });
          // Update column D (sent_at) with timestamp
          updates.push({
            range: `Sheet1!D${i + 1}`,
            values: [[timestamp]],
          });
          updatedCount++;
        }
      }
    }

    // Batch update the sheet with quota protection
    if (updates.length > 0) {
      // Chunk updates into smaller batches to respect quota
      const chunks = [];
      for (let i = 0; i < updates.length; i += BATCH_SIZE * 2) { // *2 because 2 updates per email
        chunks.push(updates.slice(i, i + BATCH_SIZE * 2));
      }

      let successfulUpdates = 0;
      for (let i = 0; i < chunks.length; i++) {
        // Check quota before each chunk
        if (!canWrite()) {
          console.log(`⚠️ Quota limit reached (50%), stopping updates after ${successfulUpdates} emails`);
          console.log(`   Remaining ${chunks.length - i} chunks will be processed next run`);
          break;
        }

        const chunk = chunks[i];
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: { data: chunk, valueInputOption: "RAW" },
        });
        incrementWriteCount();
        successfulUpdates += chunk.length / 2; // 2 updates per email

        // Add delay between chunks to spread out requests
        if (i < chunks.length - 1) {
          await delay(2000); // 2 second delay between chunks
        }
      }

      console.log(
        `Successfully updated sent status for ${successfulUpdates} emails in Google Sheets`,
      );
    } else {
      console.log("No emails to update");
    }
  } catch (error) {
    console.error("❌ Failed to update Google Sheets:", error.message);
    console.error("Make sure the service account has edit access to the sheet");
    throw error;
  }
}

module.exports = { updateSentStatus };
