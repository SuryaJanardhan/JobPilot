// Mock environment variables for test run
process.env.NODE_ENV = "test";
process.env.JOB_HUNTER_DRY_RUN = "1";
process.env.TARGET_JOBS = "5";
process.env.JOB_HUNTER_MAX_PAGES = "2";
process.env.JOB_FETCH_RETRIES = "1";
process.env.JOB_FETCH_DELAY_MS = "100";

const { normalizeDomain, scrapeDomain, sendJobsEmail, TARGET_JOBS } = require("./index.js");

const MOCK_DOMAINS = [
  { domain: "stripe.com", rowNumber: 2 },
  { domain: "posthog.com", rowNumber: 3 },
  { domain: "hashicorp.com", rowNumber: 4 },
  { domain: "google.com", rowNumber: 5 },
  { domain: "tcs.com", rowNumber: 6 },
  { domain: "infosys.com", rowNumber: 7 },
  { domain: "wipro.com", rowNumber: 8 },
  { domain: "hcl.com", rowNumber: 9 },
  { domain: "tech Mahindra.com", rowNumber: 10 }
];

async function runSimulation() {
  console.log("🏁 Starting Job Hunter local validation simulation...\n");
  console.log(`Target Jobs configuration: ${TARGET_JOBS}`);

  const selected = new Map();
  const domainStats = new Map();

  // Run the same loop as run()
  for (const domainRow of MOCK_DOMAINS) {
    if (selected.size >= TARGET_JOBS) {
      console.log(`Target of ${TARGET_JOBS} jobs reached, stopping.`);
      break;
    }

    const domain = normalizeDomain(domainRow.domain);
    const now = new Date().toISOString();
    console.log(`[Job Hunter Test] Scraping domain: ${domain}...`);

    let result;
    try {
      result = await scrapeDomain(domain);
    } catch (err) {
      console.error(`Error scraping domain ${domain}:`, err.message);
      result = { validDomain: false, totalFound: 0, aligned: [] };
    }

    const stats = {
      validDomain: result.validDomain,
      scrappedAt: now,
      totalFound: result.totalFound,
      alignedCount: result.aligned.length,
      emailSent: "no",
    };

    domainStats.set(domainRow.rowNumber, stats);
    console.log(`   Valid domain: ${result.validDomain}, Found jobs: ${result.totalFound}, Aligned: ${result.aligned.length}`);

    for (const job of result.aligned) {
      if (selected.size >= TARGET_JOBS) break;
      if (!selected.has(job.url)) {
        selected.set(job.url, { ...job, domain });
        console.log(`   🌟 Added aligned job: "${job.title}" -> ${job.url}`);
      }
    }
  }

  const pickedJobs = Array.from(selected.values()).slice(0, TARGET_JOBS);

  let sent = false;
  if (pickedJobs.length > 0) {
    console.log(`\n📬 Sending email for ${pickedJobs.length} picked jobs...`);
    sent = await sendJobsEmail(pickedJobs);
  } else {
    console.log("\nNo aligned jobs found, skipping email.");
  }

  // Construct batch updates
  const updates = [];
  for (const domainRow of MOCK_DOMAINS) {
    const stats = domainStats.get(domainRow.rowNumber);
    if (!stats) continue;

    stats.emailSent = sent
      ? `yes (${new Date().toISOString()})`
      : `no (${pickedJobs.length}/${TARGET_JOBS})`;

    updates.push({
      rowNumber: domainRow.rowNumber,
      stats,
    });
  }

  console.log("\n=========================================");
  console.log("📊 SIMULATED BATCH UPDATE TO GOOGLE SHEETS");
  console.log("=========================================");
  console.log(JSON.stringify(updates, null, 2));
  console.log("=========================================\n");

  console.log(`🎉 Job Hunter simulation complete! emailSent=${sent}`);
}

runSimulation().catch((err) => {
  console.error("Simulation failed:", err);
});
