const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config();

/**
 * Phase 3: Send emails in batches
 * @returns {Object} Object containing sent emails and message info
 */
async function sendEmails(batch, subject, body, resumeLink) {
  // Configure transporter - Using Gmail SMTP
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use app password for Gmail
    },
  });

  const sentEmails = [];
  const messageIds = []; // Store Message-IDs for tracking

  // Send ONE email BCC'd to all recipients in the batch
  const bccRecipients = batch.map((emailObj) => emailObj.email);

  // Keep all recipients (don't remove duplicates)
  const allRecipients = bccRecipients;

  console.log(
    `Sending to ${allRecipients.length} recipients (including duplicates)`,
  );

  // No file attachment - resume link is in the body
  const mailOptions = {
    from: process.env.EMAIL_USER,
    bcc: allRecipients, // BCC to all emails in batch
    subject: subject,
    text: body,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    sentEmails.push(...allRecipients); // All recipients are sent to

    // Store the Message-ID for bounce tracking
    if (info.messageId) {
      messageIds.push(info.messageId);
      console.log(`Message-ID: ${info.messageId}`);
    }

    console.log(`Batch email sent to ${allRecipients.length} recipients`);
    console.log(`SMTP Response: ${info.response}`);

    // sending a confirm mail to my primary mail here
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "chintalajanardhan2004@gmail.com",
      subject: `✅ Batch of ${allRecipients.length} mails sent successfully`,
      text: `✅ Successfully sent ${
        allRecipients.length
      } emails to the following recipients:\n\n${allRecipients.join(
        "\n",
      )}\n\nTotal recipients: ${
        allRecipients.length
      }\n\nSubject used: ${subject}\n\nMessage-ID: ${info.messageId || "N/A"}\n\nSMTP Response: ${info.response}`,
    });

    return { sentEmails, messageIds };
  } catch (error) {
    console.error(`Failed to send batch email:`, error);
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "chintalajanardhan2004@gmail.com",
      subject: `❌ Failed to send batch of ${allRecipients.length} mails`,
      text: `🚨 Failed to send batch email to the following recipients:\n\n${allRecipients.join(
        "\n",
      )}\n\nError: ${
        error.message
      }\n\nPlease check your email configuration and try again.`,
    });

    return { sentEmails, messageIds };
  }
}

module.exports = { sendEmails };
