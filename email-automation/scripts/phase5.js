const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const path = require("path");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
require("dotenv").config();

/**
 * Phase 5: Verify email delivery status after 20 minutes
 *
 * IMPROVED APPROACH:
 * 1. Read SENT folder to find our recently sent emails
 * 2. Read INBOX for bounce notifications
 * 3. Match bounces to sent emails using:
 *    - In-Reply-To / References headers (contains original Message-ID)
 *    - Email addresses mentioned in bounce
 * 4. Update sheet with accurate failure status
 */

// Common bounce error patterns
const ERROR_PATTERNS = [
  {
    pattern: /user unknown|user not found|no such user|unknown user/i,
    message: "User not found",
  },
  {
    pattern: /mailbox not found|mailbox unavailable|mailbox does not exist/i,
    message: "Mailbox not found",
  },
  {
    pattern: /address rejected|recipient rejected|rejected recipient/i,
    message: "Address rejected",
  },
  {
    pattern: /domain not found|no mx record|domain.*not exist|host.*not found/i,
    message: "Domain not found",
  },
  {
    pattern: /quota exceeded|mailbox full|over quota|storage.*full/i,
    message: "Mailbox full",
  },
  {
    pattern: /spam|blocked|blacklisted|policy|rejected.*policy/i,
    message: "Blocked/Policy",
  },
  {
    pattern: /invalid.*address|bad.*address|syntax error/i,
    message: "Invalid address",
  },
  {
    pattern: /connection refused|connection timeout|timed out/i,
    message: "Connection failed",
  },
  {
    pattern: /relay denied|relay not permitted|relaying denied/i,
    message: "Relay denied",
  },
  { pattern: /too many recipients/i, message: "Too many recipients" },
  { pattern: /authentication required/i, message: "Auth required" },
  {
    pattern: /message rejected|rejected.*message/i,
    message: "Message rejected",
  },
  {
    pattern: /delivery.*failed|could not.*deliver|undeliverable|not delivered/i,
    message: "Delivery failed",
  },
  {
    pattern: /permanent.*failure|permanent.*error/i,
    message: "Permanent failure",
  },
  {
    pattern: /temporary.*failure|try again later/i,
    message: "Temporary failure",
  },
  { pattern: /550|551|552|553|554/i, message: "SMTP Error" },
];

function extractSimpleError(bounceContent) {
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (pattern.test(bounceContent)) {
      return message;
    }
  }
  return "Delivery failed";
}

/**
 * Get IMAP connection config
 */
function getImapConfig() {
  return {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 30000,
  };
}

/**
 * Read recent emails from Gmail SENT folder
 * Returns sent emails with their Message-IDs for tracking
 */
async function readSentEmails(minutesBack = 35) {
  console.log(`\n📤 Reading SENT folder (last ${minutesBack} minutes)...`);

  const sentMessages = []; // { messageId, recipients[], subject, date }

  return new Promise((resolve) => {
    const imap = new Imap(getImapConfig());

    imap.once("ready", () => {
      console.log("Connected to Gmail IMAP");

      // Gmail's sent folder is "[Gmail]/Sent Mail"
      imap.openBox("[Gmail]/Sent Mail", true, (err, box) => {
        if (err) {
          console.error("Error opening Sent folder:", err.message);
          // Try alternative name
          imap.openBox("Sent", true, (err2, box2) => {
            if (err2) {
              console.error("Could not open Sent folder");
              imap.end();
              return resolve(sentMessages);
            }
            processSentBox(imap, box2, minutesBack, sentMessages, resolve);
          });
          return;
        }
        processSentBox(imap, box, minutesBack, sentMessages, resolve);
      });
    });

    imap.once("error", (err) => {
      console.error("IMAP error:", err.message);
      resolve(sentMessages);
    });

    imap.connect();
  });
}

function processSentBox(imap, box, minutesBack, sentMessages, resolve) {
  console.log(`Sent folder opened. Total messages: ${box.messages.total}`);

  const searchDate = new Date();
  searchDate.setMinutes(searchDate.getMinutes() - minutesBack);

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const dateStr = `${searchDate.getDate()}-${months[searchDate.getMonth()]}-${searchDate.getFullYear()}`;

  // Search for recent sent emails
  imap.search([["SINCE", dateStr]], (err, results) => {
    if (err || !results || results.length === 0) {
      console.log("No recent sent emails found");
      imap.end();
      return resolve(sentMessages);
    }

    console.log(`Found ${results.length} recently sent emails`);

    const fetch = imap.fetch(results, {
      bodies: [
        "HEADER.FIELDS (MESSAGE-ID TO BCC CC SUBJECT DATE X-FAILED-RECIPIENTS)",
      ],
      struct: true,
    });

    let processedCount = 0;

    fetch.on("message", (msg) => {
      let headerData = "";

      msg.on("body", (stream) => {
        stream.on("data", (chunk) => {
          headerData += chunk.toString("utf8");
        });
      });

      msg.once("end", () => {
        processedCount++;

        // Parse headers
        const messageIdMatch = headerData.match(
          /Message-ID:\s*<?([^>\r\n]+)>?/i,
        );
        const toMatch = headerData.match(/To:\s*([^\r\n]+)/i);
        const bccMatch = headerData.match(/Bcc:\s*([^\r\n]+)/i);
        const subjectMatch = headerData.match(/Subject:\s*([^\r\n]+)/i);
        const failedMatch = headerData.match(
          /X-Failed-Recipients:\s*([^\r\n]+)/i,
        );

        const messageId = messageIdMatch ? messageIdMatch[1].trim() : null;
        const subject = subjectMatch ? subjectMatch[1].trim() : "";

        // Extract all recipient emails
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const toEmails = (toMatch ? toMatch[1].match(emailRegex) : []) || [];
        const bccEmails = (bccMatch ? bccMatch[1].match(emailRegex) : []) || [];
        const allRecipients = [...toEmails, ...bccEmails].map((e) =>
          e.toLowerCase(),
        );

        // Check for X-Failed-Recipients header (immediate failures)
        const failedRecipients = failedMatch
          ? failedMatch[1].match(emailRegex) || []
          : [];

        if (messageId && allRecipients.length > 0) {
          sentMessages.push({
            messageId,
            recipients: allRecipients,
            subject,
            failedRecipients: failedRecipients.map((e) => e.toLowerCase()),
          });
        }
      });
    });

    fetch.once("end", () => {
      console.log(`Processed ${processedCount} sent messages`);
      imap.end();
      resolve(sentMessages);
    });

    fetch.once("error", (err) => {
      console.error("Fetch error:", err.message);
      imap.end();
      resolve(sentMessages);
    });
  });
}

/**
 * Read bounce notifications from INBOX
 * Returns failed emails with error messages
 */
async function readBounceNotifications(
  sentMessageIds,
  emailsToCheck,
  minutesBack = 35,
) {
  console.log(`\n📥 Reading INBOX for bounce notifications...`);

  const failedEmails = new Map(); // email -> error
  const emailSet = new Set(emailsToCheck.map((e) => e.toLowerCase()));
  const messageIdSet = new Set(sentMessageIds);

  return new Promise((resolve) => {
    const imap = new Imap(getImapConfig());

    imap.once("ready", () => {
      imap.openBox("INBOX", true, (err, box) => {
        if (err) {
          console.error("Error opening INBOX:", err.message);
          imap.end();
          return resolve(failedEmails);
        }

        console.log(`INBOX opened. Total messages: ${box.messages.total}`);

        const searchDate = new Date();
        searchDate.setMinutes(searchDate.getMinutes() - minutesBack);

        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const dateStr = `${searchDate.getDate()}-${months[searchDate.getMonth()]}-${searchDate.getFullYear()}`;

        // Search for bounce messages
        const searchCriteria = [
          ["SINCE", dateStr],
          [
            "OR",
            ["OR", ["FROM", "mailer-daemon"], ["FROM", "postmaster"]],
            [
              "OR",
              ["SUBJECT", "Delivery Status Notification"],
              ["SUBJECT", "Undeliverable"],
            ],
          ],
        ];

        imap.search(searchCriteria, (err, results) => {
          if (err || !results || results.length === 0) {
            console.log("No bounce messages found");
            imap.end();
            return resolve(failedEmails);
          }

          console.log(`Found ${results.length} potential bounce messages`);

          const fetch = imap.fetch(results, { bodies: "" });
          let processedCount = 0;

          fetch.on("message", (msg) => {
            let fullBody = "";

            msg.on("body", (stream) => {
              stream.on("data", (chunk) => {
                fullBody += chunk.toString("utf8");
              });
            });

            msg.once("end", () => {
              processedCount++;

              // Check if this bounce references any of our sent messages
              const referencesOurs = sentMessageIds.some((msgId) =>
                fullBody.includes(msgId),
              );

              // Extract email addresses from bounce
              const emailRegex =
                /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
              const foundEmails = [
                ...new Set(
                  (fullBody.match(emailRegex) || []).map((e) =>
                    e.toLowerCase(),
                  ),
                ),
              ];

              // System emails to ignore
              const ignorePatterns = [
                "mailer-daemon",
                "postmaster",
                "noreply",
                "no-reply",
                "googlemail.com",
                "google.com",
              ];

              for (const email of foundEmails) {
                if (ignorePatterns.some((p) => email.includes(p))) continue;
                if (email === process.env.EMAIL_USER?.toLowerCase()) continue;

                // Check if this email is in our sent list
                if (emailSet.has(email)) {
                  const errorMsg = extractSimpleError(fullBody);
                  failedEmails.set(email, errorMsg);
                  console.log(`  ❌ BOUNCE: ${email} - ${errorMsg}`);
                }
              }
            });
          });

          fetch.once("end", () => {
            console.log(`Processed ${processedCount} bounce messages`);
            imap.end();
            resolve(failedEmails);
          });

          fetch.once("error", (err) => {
            console.error("Fetch error:", err.message);
            imap.end();
            resolve(failedEmails);
          });
        });
      });
    });

    imap.once("error", (err) => {
      console.error("IMAP error:", err.message);
      resolve(failedEmails);
    });

    imap.connect();
  });
}

/**
 * Get emails sent in the last 30 minutes from Google Sheets
 */
async function getRecentlySentEmails(sheetLink) {
  console.log("📋 Reading recently sent emails from Google Sheets...");

  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(
      __dirname,
      "..",
      "seismic-rarity-468405-j1-cd12fe29c298.json",
    ),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = sheetLink.match(/\/d\/([a-zA-Z0-9-_]+)/)[1];

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Sheet1!A:D",
  });

  const rows = response.data.values || [];
  console.log(`Total rows in sheet: ${rows.length - 1}`);

  const thirtyMinutesAgo = new Date();
  thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

  console.log(
    `Looking for emails sent after: ${thirtyMinutesAgo.toISOString()}`,
  );

  const recentlySentEmails = [];
  let stats = { noTimestamp: 0, oldTimestamp: 0, hasError: 0 };

  for (let i = 1; i < rows.length; i++) {
    const [email, status, error, sentAt] = rows[i] || [];

    if (!email || status !== "email sent") continue;
    if (error && error.trim() !== "") {
      stats.hasError++;
      continue;
    }
    if (!sentAt || sentAt.trim() === "") {
      stats.noTimestamp++;
      continue;
    }

    const sentTime = new Date(sentAt);
    if (isNaN(sentTime.getTime())) {
      stats.noTimestamp++;
      continue;
    }

    if (sentTime >= thirtyMinutesAgo) {
      recentlySentEmails.push(email);
    } else {
      stats.oldTimestamp++;
    }
  }

  console.log(`\nFiltering results:`);
  console.log(`  ✅ Recent (last 30 min): ${recentlySentEmails.length}`);
  console.log(`  ⏰ Older timestamp: ${stats.oldTimestamp}`);
  console.log(`  ⚠️ No timestamp: ${stats.noTimestamp}`);
  console.log(`  ❌ Already has error: ${stats.hasError}`);

  return recentlySentEmails;
}

// Google Sheets quota protection
const QUOTA_LIMIT_PER_MINUTE = 60;
const SAFE_QUOTA_PERCENT = 0.5;
const MAX_WRITES_PER_MINUTE = Math.floor(QUOTA_LIMIT_PER_MINUTE * SAFE_QUOTA_PERCENT);
const BATCH_SIZE = 10;

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
 * Update Google Sheet with error column for failed emails (with quota protection)
 */
async function updateErrorColumn(sheetLink, failedEmails) {
  if (failedEmails.size === 0) {
    console.log("\nNo failed emails to update in sheet");
    return 0;
  }

  console.log(
    `\n📝 Updating error column for ${failedEmails.size} failed emails...`,
  );
  console.log(`  [Quota] Max ${MAX_WRITES_PER_MINUTE} writes/minute (50% of limit)`);

  const spreadsheetId = sheetLink.match(/\/d\/([a-zA-Z0-9-_]+)/)[1];

  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(
      __dirname,
      "..",
      "seismic-rarity-468405-j1-cd12fe29c298.json",
    ),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Sheet1!A:D",
  });

  const rows = response.data.values || [];
  const updates = [];

  const failedLowerMap = new Map();
  for (const [email, error] of failedEmails) {
    failedLowerMap.set(email.toLowerCase(), error);
  }

  for (let i = 1; i < rows.length; i++) {
    const email = rows[i]?.[0]?.toLowerCase();
    if (email && failedLowerMap.has(email)) {
      updates.push({
        range: `Sheet1!C${i + 1}`,
        values: [[failedLowerMap.get(email)]],
      });
    }
  }

  if (updates.length > 0) {
    // Chunk updates for quota protection
    const chunks = [];
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      chunks.push(updates.slice(i, i + BATCH_SIZE));
    }

    let successfulUpdates = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (!canWrite()) {
        console.log(`⚠️ Quota limit reached (50%), stopping after ${successfulUpdates} updates`);
        break;
      }

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: { data: chunks[i], valueInputOption: "RAW" },
      });
      incrementWriteCount();
      successfulUpdates += chunks[i].length;

      if (i < chunks.length - 1) {
        await delay(2000);
      }
    }
    console.log(`Updated error column for ${successfulUpdates} failed emails`);
    return successfulUpdates;
  }

  return 0;
}

/**
 * Send summary email
 */
async function sendSummaryEmail(emailsChecked, failedEmails) {
  console.log("\n📧 Sending summary email...");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const totalSent = emailsChecked.length;
  const failedCount = failedEmails.size;
  const successCount = totalSent - failedCount;

  const successfulEmails = emailsChecked.filter(
    (e) => !failedEmails.has(e.toLowerCase()),
  );

  const failedList =
    Array.from(failedEmails.entries())
      .map(([email, error]) => `  • ${email} - ${error}`)
      .join("\n") || "  None";

  const successList = successfulEmails.slice(0, 15).join("\n  • ") || "None";
  const moreSuccess =
    successfulEmails.length > 15
      ? `\n  ... and ${successfulEmails.length - 15} more`
      : "";

  const successRate =
    totalSent > 0 ? ((successCount / totalSent) * 100).toFixed(1) : 0;

  const subject = `📊 Delivery Report: ${successCount}/${totalSent} OK (${failedCount} bounced)`;

  const body = `
📧 EMAIL DELIVERY VERIFICATION REPORT
======================================
Generated: ${new Date().toLocaleString()}

📊 SUMMARY
-----------
Total Emails Verified: ${totalSent}
✅ No Bounce Detected: ${successCount}
❌ Bounced/Failed: ${failedCount}
📈 Success Rate: ${successRate}%

${
  failedCount > 0
    ? `
❌ FAILED DELIVERIES (${failedCount})
--------------------------------------
${failedList}

These emails bounced back. The error column in your sheet has been updated.
`
    : "🎉 No bounces detected! All emails appear to have been accepted by recipient servers."
}

✅ SUCCESSFUL (sample of ${Math.min(15, successfulEmails.length)})
-------------------------------------------------------------------
  • ${successList}${moreSuccess}

---
📝 HOW THIS WORKS:
1. We checked your Gmail SENT folder for recent emails
2. We checked your INBOX for bounce-back messages
3. We matched bounces to your sent emails
4. Emails without bounces are marked as "delivered"

⚠️ NOTE: "No bounce" means the recipient's server accepted the email.
It doesn't guarantee the email reached their inbox (could be in spam).

This is an automated delivery verification report.
`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: "chintalajanardhan2004@gmail.com",
    subject,
    text: body,
  });

  console.log("✅ Summary email sent to chintalajanardhan2004@gmail.com");
}

/**
 * Main verification function
 */
async function verifyDeliveryStatus() {
  const sheetLink =
    "https://docs.google.com/spreadsheets/d/1bKIeZoQMOmIw9Te_zMSafZOYqUsF3s2MBAqgl7Vjnds/edit?gid=0#gid=0";

  console.log("=".repeat(60));
  console.log("📧 EMAIL DELIVERY VERIFICATION (IMPROVED)");
  console.log("=".repeat(60));
  console.log(`Started at: ${new Date().toLocaleString()}\n`);

  try {
    // Step 1: Get emails to verify from sheet (with timestamps)
    const emailsToCheck = await getRecentlySentEmails(sheetLink);

    if (emailsToCheck.length === 0) {
      console.log("\n⚠️ No emails with recent timestamps found!");
      console.log("Make sure you've sent emails recently with npm start");
      return;
    }

    console.log(`\n✅ Found ${emailsToCheck.length} emails to verify`);

    // Step 2: Read SENT folder to get Message-IDs
    const sentMessages = await readSentEmails(35);
    const sentMessageIds = sentMessages.map((m) => m.messageId).filter(Boolean);
    console.log(`Found ${sentMessageIds.length} message IDs from sent folder`);

    // Check for X-Failed-Recipients in sent emails (immediate failures)
    const immediateFailures = new Map();
    for (const msg of sentMessages) {
      for (const failedEmail of msg.failedRecipients) {
        if (emailsToCheck.some((e) => e.toLowerCase() === failedEmail)) {
          immediateFailures.set(failedEmail, "Immediate rejection");
          console.log(`  ❌ IMMEDIATE FAILURE: ${failedEmail}`);
        }
      }
    }

    // Step 3: Read INBOX for bounces
    const bouncedEmails = await readBounceNotifications(
      sentMessageIds,
      emailsToCheck,
      35,
    );

    // Combine all failures
    const allFailedEmails = new Map([...immediateFailures, ...bouncedEmails]);

    console.log(`\n📊 RESULTS:`);
    console.log(`  Total checked: ${emailsToCheck.length}`);
    console.log(`  Bounced: ${allFailedEmails.size}`);
    console.log(`  No bounce: ${emailsToCheck.length - allFailedEmails.size}`);

    // Step 4: Update error column in sheet
    await updateErrorColumn(sheetLink, allFailedEmails);

    // Step 5: Send summary email
    await sendSummaryEmail(emailsToCheck, allFailedEmails);

    console.log("\n" + "=".repeat(60));
    console.log("✅ VERIFICATION COMPLETE");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Error during verification:", error);
    throw error;
  }
}

module.exports = {
  verifyDeliveryStatus,
  readSentEmails,
  readBounceNotifications,
  updateErrorColumn,
  sendSummaryEmail,
  getRecentlySentEmails,
};

if (require.main === module) {
  verifyDeliveryStatus();
}
