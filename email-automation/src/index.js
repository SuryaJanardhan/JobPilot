const { loadUnsentEmails } = require("../scripts/phase1");
const { prepareBatches } = require("../scripts/phase2");
const { sendEmails } = require("../scripts/phase3");
const { updateSentStatus } = require("../scripts/phase4");
const { generateEmailVariants } = require("../scripts/llm");

async function main() {
  // Google Drive resume link instead of file attachment
  const resumeLink =
    "https://drive.google.com/file/d/1q45pza2gyP6Pf7z4kyQv2yvOY2KZtCZl/view?usp=sharing";
  const sheetLink =
    "https://docs.google.com/spreadsheets/d/1bPYyC4wrnSfz8swLO2NGgMigfNo1cSwhhTgPud-5QLE/edit?gid=0#gid=0";

  // Base subject and body - will be varied by LLM
  const baseSubject = "Application for SDE / Full Stack / AI Intern Role";
  const baseBody = `Hi,

I debug code for fun, so I figured applying here was the next logical step. I am looking for SDE / Full Stack / AI intern roles and would love to contribute to your team.

Resume: ${resumeLink}

Thanks & Regards,
Surya Janardhan
+91 93914 69392`;

  try {
    // Phase 1: Load unsent emails
    const allUnsentEmails = await loadUnsentEmails(sheetLink);
    console.log(`Found ${allUnsentEmails.length} unsent emails`);

    // Take only first 20 unsent emails for this run (reduced to avoid Sheets quota)
    const unsentEmails = allUnsentEmails.slice(0, 20);
    console.log(
      `Processing ${unsentEmails.length} emails this run (max 20 to stay under Sheets quota)`,
    );

    if (unsentEmails.length === 0) {
      console.log("No unsent emails found. All done!");
      return;
    }

    // Generate 5 email variants using Groq LLM
    console.log("\n Generating email variants using Groq LLM...");
    const { subjects, bodies } = await generateEmailVariants(
      baseSubject,
      baseBody,
    );

    // Phase 2: Prepare 5 batches of 10 emails each
    const batches = prepareBatches(unsentEmails, 10);
    console.log(`Prepared ${batches.length} batch(es) of 10 emails each`);

    let allSentEmails = [];

    // Process each batch with different subject/body variant
    for (let i = 0; i < batches.length && i < 5; i++) {
      const batch = batches[i];
      const subject = subjects[i] || baseSubject;
      const body = bodies[i] || baseBody;

      console.log(
        `\n Processing batch ${i + 1}/${Math.min(batches.length, 5)} (${batch.length} emails)`,
      );
      console.log(`   Subject: "${subject.substring(0, 30)}..."`);

      // Phase 3: Send emails for this batch
      const result = await sendEmails(batch, subject, body, resumeLink);
      allSentEmails.push(...result.sentEmails);

      // Small delay between batches to avoid rate limiting
      if (i < batches.length - 1 && i < 4) {
        console.log("   Waiting 2 seconds before next batch...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Phase 4: Update sent status for all sent emails
    await updateSentStatus(sheetLink, allSentEmails);

    console.log(
      `\n All batches processed successfully! Total sent: ${allSentEmails.length}`,
    );
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
