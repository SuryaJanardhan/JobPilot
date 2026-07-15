const nodemailer = require("nodemailer");
const path = require("path");
const { compileTemplate } = require("../src/template");
require("dotenv").config();

/**
 * Phase 3: Send emails in batches
 * @returns {Object} Object containing sent emails and message info
 */
async function sendEmails(batch, subjectTemplate, bodyTemplate, resumeLink, personalizedMap = null) {

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const sentEmails = [];
  const messageIds = [];

  const isDryRun = process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1";

  // Compile templates as fallback
  const renderSubject = compileTemplate(subjectTemplate);
  const renderBody = compileTemplate(bodyTemplate + "\n\nResume: {{resumeLink}}");

  for (const recipient of batch) {
    const data = { ...recipient, resumeLink };
    let personalizedSubject, personalizedBody;

    const emailKey = recipient.email.toLowerCase().trim();
    if (personalizedMap && personalizedMap[emailKey]) {
      personalizedSubject = personalizedMap[emailKey].subject;
      personalizedBody = personalizedMap[emailKey].body;
    } else {
      personalizedSubject = renderSubject(data);
      personalizedBody = renderBody(data);
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipient.email,
      subject: personalizedSubject,
      text: personalizedBody,
    };

    try {
      if (isDryRun) {
        console.log(`DRY RUN: would send to ${recipient.email} subject="${personalizedSubject.substring(0, 50)}..."`);
      } else {
        const info = await transporter.sendMail(mailOptions);
        if (info && info.messageId) messageIds.push(info.messageId);
        console.log(`Sent to ${recipient.email} (${info && info.response ? info.response : 'no-response'})`);
      }

      sentEmails.push(recipient.email);
    } catch (error) {
      console.error(`Failed to send to ${recipient.email}:`, error && error.message ? error.message : error);
    }

    // Small pause to avoid hitting provider rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  // Notify owner about the batch result
  try {
    const ownerMsg = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `Batch send report: ${sentEmails.length}/${batch.length} sent`,
      text: `Sent to:\n${sentEmails.join("\n")}\n\nSubject (sample): ${subjectTemplate.substring(0, 80)}`,
    };
    if (isDryRun) {
      console.log("DRY RUN: would send owner report", ownerMsg);
    } else {
      const info = await transporter.sendMail(ownerMsg);
      if (info && info.messageId) messageIds.push(info.messageId);
    }
  } catch (err) {
    console.error("Failed to send owner report:", err && err.message ? err.message : err);
  }

  return { sentEmails, messageIds };
}

module.exports = { sendEmails };
