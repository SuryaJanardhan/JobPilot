const { prepareBatches } = require("./phase2");
const { sendEmails } = require("./phase3");
const { generateBatchPersonalizedEmails } = require("./llm");
const { scrapeRecruiterDomain } = require("./scraper");
const nodemailer = require("nodemailer");
require("dotenv").config();

// Ensure DRY_RUN is active for testing
process.env.DRY_RUN = "true";

const MOCK_RECRUITERS = [
  { email: "recruiter@stripe.com", name: "Stripe Recruiter" },
  { email: "careers@vercel.com", name: "Vercel Careers" },
  { email: "hr@supabase.io", name: "Supabase HR" },
  { email: "jobs@clerk.com", name: "Clerk Jobs" },
  { email: "recruiter@posthog.com", name: "PostHog Recruiter" },
  { email: "hiring@linear.app", name: "Linear Hiring" },
  { email: "contact@gmail.com", name: "Public Gmail Contact" },
  { email: "hr@resend.com", name: "Resend HR" },
  { email: "jobs@retool.com", name: "Retool Jobs" },
  { email: "recruiter@hashicorp.com", name: "HashiCorp Recruiter" }
];

async function sendSummaryReport(stats, totalSent) {
  console.log("\n=========================================");
  console.log("📬 SIMULATED OUTREACH SUMMARY REPORT");
  console.log("=========================================");
  console.log(`To: ${process.env.EMAIL_USER || "user@example.com"}`);
  console.log(`Subject: Job Automation - Recruiter Cold Outreach Summary Report`);
  console.log(`Body:\n`);
  console.log(`Hi Surya,

Here is the summary report for today's recruiter cold outreach run:

📊 Run Summary Statistics:
- Total Emails Sent: ${totalSent}
- Homepage Scraped (personalized based on company info): ${stats.homepageScraped}
- Careers Openings Referenced (personalized with job titles/IDs): ${stats.careersReferenced}
- Generic / Fallback (failed scraping or public domain): ${stats.generic}

All sent statuses have been updated in your Google Sheet.

Best,
Your Job Automation Bot`);
  console.log("=========================================\n");
}

async function main() {
  console.log("🏁 Starting local validation test for Recruiter outreach personalization...\n");

  const resumeLink =
    "https://drive.google.com/file/d/19Qs48C5Xg4TpRfApoQYZ_pp2zcnnApsf/view?usp=sharing";

  const stats = {
    generic: 0,
    homepageScraped: 0,
    careersReferenced: 0,
  };

  try {
    const unsentEmails = MOCK_RECRUITERS;
    console.log(`Loaded ${unsentEmails.length} mock recruiters.`);

    const batches = prepareBatches(unsentEmails, 10);
    console.log(`Prepared ${batches.length} batch(es) of 10 emails each.`);

    let allSentEmails = [];

    // Process each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(
        `\n🚀 Processing batch ${i + 1}/${batches.length} (${batch.length} emails)`
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

      // Phase 3: Send emails for this batch (Dry run will only print to console)
      console.log("   ✉️ Sending batch emails...");
      const result = await sendEmails(batch, "", "", resumeLink, personalizedMap);
      allSentEmails.push(...result.sentEmails);
    }

    console.log(
      `\n✅ All batches processed successfully! Total simulated sent: ${allSentEmails.length}`
    );

    // Send summary email report
    await sendSummaryReport(stats, allSentEmails.length);

  } catch (error) {
    console.error("Error in validation run:", error);
  }
}

main();
