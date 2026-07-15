const { scrapeRecruiterDomain } = require("./scraper");

const TEST_EMAILS = [
  "recruiter@stripe.com",
  "careers@vercel.com",
  "hr@supabase.io",
  "jobs@clerk.com",
  "recruiter@posthog.com",
  "hiring@linear.app",
  "contact@gmail.com", // public provider fallback test
  "hr@resend.com",
  "jobs@retool.com",
  "recruiter@hashicorp.com"
];

async function runTest() {
  console.log("=========================================");
  console.log("🧪 TESTING DOMAIN SCRAPER ON 10 DOMAINS");
  console.log("=========================================\n");

  const startTime = Date.now();
  
  // Run all scraping requests in parallel
  const scrapePromises = TEST_EMAILS.map(async (email) => {
    try {
      const result = await scrapeRecruiterDomain(email);
      return { email, success: true, result };
    } catch (err) {
      return { email, success: false, error: err.message };
    }
  });

  const results = await Promise.all(scrapePromises);
  const elapsed = (Date.now() - startTime) / 1000;

  console.log("\n=========================================");
  console.log("📊 SCRAPING RESULTS SUMMARY");
  console.log(`⏱️ Elapsed Time: ${elapsed.toFixed(2)} seconds`);
  console.log("=========================================\n");

  results.forEach(({ email, success, result, error }, index) => {
    console.log(`[${index + 1}/10] Recruiter Email: ${email}`);
    if (!success) {
      console.log(`  ❌ Failed with error: ${error}\n`);
      return;
    }

    console.log(`  Status:  ${result.status}`);
    console.log(`  Domain:  ${result.domain}`);
    if (result.companyDescription) {
      console.log(`  Desc:    ${result.companyDescription.slice(0, 120)}...`);
    } else {
      console.log(`  Desc:    N/A`);
    }
    
    if (result.jobOpenings && result.jobOpenings.length > 0) {
      console.log(`  Openings found (${result.jobOpenings.length}):`);
      result.jobOpenings.forEach((job) => {
        console.log(`    - Title: "${job.title}" | ID: ${job.id || "N/A"} | URL: ${job.url}`);
      });
    } else {
      console.log(`  Openings: None matched Surya's resume keywords`);
    }
    console.log();
  });
}

runTest().catch((err) => {
  console.error("Test execution failed:", err);
});
