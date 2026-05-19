/**
 * Send LinkedIn automation notification email
 * Usage: node send-linkedin-notification.js [success|failure]
 */

const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const status = process.argv[2] || "unknown";

async function sendNotification() {
  // Read output log if exists
  let output = "No output captured";
  const outputPath = path.join(__dirname, "..", "inb", "linkedin_output.txt");

  try {
    if (fs.existsSync(outputPath)) {
      output = fs.readFileSync(outputPath, "utf8");
    }
  } catch (e) {
    output = `Could not read output file: ${e.message}`;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const date = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const time = new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  let subject, body;

  if (status === "success") {
    subject = `✅ LinkedIn Automation SUCCESS - ${date}`;
    body = `
🔗 LINKEDIN CONNECTION AUTOMATION - SUCCESS
============================================
Date: ${date}
Time: ${time} IST
Status: ✅ COMPLETED SUCCESSFULLY

📋 EXECUTION LOG:
${"-".repeat(50)}
${output}
${"-".repeat(50)}

This is an automated notification from your GetJob system.
`;
  } else {
    subject = `❌ LinkedIn Automation FAILED - ${date}`;
    body = `
🔗 LINKEDIN CONNECTION AUTOMATION - FAILED
============================================
Date: ${date}
Time: ${time} IST
Status: ❌ FAILED

⚠️ Something went wrong with the LinkedIn automation.
Please check the GitHub Actions logs for details.

📋 ERROR LOG:
${"-".repeat(50)}
${output}
${"-".repeat(50)}

🔧 POSSIBLE ISSUES:
1. LinkedIn password may have changed
2. LinkedIn may have blocked the account temporarily
3. Session cookies may have expired
4. Rate limiting by LinkedIn

📌 ACTION REQUIRED:
- Check GitHub Actions logs
- Verify LINKEDIN_PASSWORD secret is correct
- Try running manually with --refresh-cookies

This is an automated notification from your GetJob system.
`;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "chintalajanardhan2004@gmail.com",
      subject: subject,
      text: body,
    });
    console.log(
      `✅ ${status.toUpperCase()} notification email sent to chintalajanardhan2004@gmail.com`,
    );
  } catch (error) {
    console.error(`❌ Failed to send notification: ${error.message}`);
    process.exit(1);
  }
}

sendNotification();
