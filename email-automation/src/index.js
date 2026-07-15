process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { loadUnsentEmails } = require("../scripts/phase1");
const { prepareBatches } = require("../scripts/phase2");
const { sendEmails } = require("../scripts/phase3");
const { updateSentStatus } = require("../scripts/phase4");
const { generateBatchPersonalizedEmails } = require("../scripts/llm");
const { scrapeRecruiterDomain } = require("../scripts/scraper");
const nodemailer = require("nodemailer");
require("dotenv").config();

async function sendSummaryReport(stats, totalSent) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("⚠️ EMAIL_USER or EMAIL_PASS not set. Skipping summary report email.");
    return;
  }

  console.log("\n📬 Sending outreach summary report to user...");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: `Job Automation - Recruiter Cold Outreach Summary Report`,
    text: `Hi Surya,

Here is the summary report for today's recruiter cold outreach run:

📊 Run Summary Statistics:
- Total Emails Sent: ${totalSent}
- Homepage Scraped (personalized based on company info): ${stats.homepageScraped}
- Careers Openings Referenced (personalized with job titles/IDs): ${stats.careersReferenced}
- Generic / Fallback (failed scraping or public domain): ${stats.generic}

All sent statuses have been updated in your Google Sheet.

Best,
Your Job Automation Bot`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Summary report email sent successfully: ${info.messageId}`);
  } catch (err) {
    console.error(`❌ Failed to send summary report email: ${err.message}`);
  }
}

async function main() {
  const resumeLink =
    "https://drive.google.com/file/d/19Qs48C5Xg4TpRfApoQYZ_pp2zcnnApsf/view?usp=sharing";
  const sheetLink =
    "https://docs.google.com/spreadsheets/d/1bPYyC4wrnSfz8swLO2NGgMigfNo1cSwhhTgPud-5QLE/edit?gid=0#gid=0";

  // Keep track of statistics
  const stats = {
    generic: 0,
    homepageScraped: 0,
    careersReferenced: 0,
  };

  try {
    // Phase 1: Load unsent emails
    const allUnsentEmails = await loadUnsentEmails(sheetLink);
    console.log(`Found ${allUnsentEmails.length} unsent emails`);

    // Take only first 20 unsent emails for this run
    const unsentEmails = allUnsentEmails.slice(0, 20);
    console.log(
      `Processing ${unsentEmails.length} emails this run (max 20 to stay under Sheets quota)`,
    );

    if (unsentEmails.length === 0) {
      console.log("No unsent emails found. All done!");
      return;
    }

    // Phase 2: Prepare batches of 10 emails each
    const batches = prepareBatches(unsentEmails, 10);
    console.log(`Prepared ${batches.length} batch(es) of 10 emails each`);

    let allSentEmails = [];

    // Process each batch
    for (let i = 0; i < batches.length && i < 2; i++) {
      const batch = batches[i];
      console.log(
        `\n🚀 Processing batch ${i + 1}/${Math.min(batches.length, 2)} (${batch.length} emails)`,
      );

      // Step 1: Scrape recruiter domains in parallel
      console.log("   🌐 Scraping recruiter domains in parallel...");
      const scrapePromises = batch.map(async (recipient) => {
        try {
          const context = await scrapeRecruiterDomain(recipient.email);
          return { recipient, context };
        } catch (err) {
          console.error(`      Error scraping ${recipient.email}: ${err.message}`);
          return {
            recipient,
            context: { status: "failed/public", domain: "", companyDescription: "", jobOpenings: [] }
          };
        }
      });

      const scrapeResults = await Promise.all(scrapePromises);

      // Map contexts for the LLM prompt and update stats
      const batchContexts = [];
      scrapeResults.forEach(({ recipient, context }) => {
        batchContexts.push({
          email: recipient.email,
          domain: context.domain,
          companyDescription: context.companyDescription,
          status: context.status,
          jobOpenings: context.jobOpenings
        });

        // Track stats
        if (context.status === "careers_scraped") {
          stats.careersReferenced++;
        } else if (context.status === "homepage_scraped") {
          stats.homepageScraped++;
        } else {
          stats.generic++;
        }
      });

      // Step 2: Call the LLM to personalize the 10 emails in one batch call
      console.log("   🧠 Generating personalized email bodies using Groq LLM...");
      const personalizedMap = await generateBatchPersonalizedEmails(batchContexts, resumeLink);

      // Phase 3: Send emails for this batch
      console.log("   ✉️ Sending batch emails...");
      const result = await sendEmails(batch, "", "", resumeLink, personalizedMap);
      allSentEmails.push(...result.sentEmails);

      // Small delay between batches to avoid rate limiting
      if (i < batches.length - 1 && i < 1) {
        console.log("   Waiting 2 seconds before next batch...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Phase 4: Update sent status for all sent emails
    if (allSentEmails.length > 0) {
      await updateSentStatus(sheetLink, allSentEmails);
    }

    console.log(
      `\n All batches processed successfully! Total sent: ${allSentEmails.length}`,
    );

    // Send summary email report
    await sendSummaryReport(stats, allSentEmails.length);

  } catch (error) {
    console.error("Error in orchestrator:", error);
  }
}

main();
