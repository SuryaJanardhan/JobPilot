const Groq = require("groq-sdk");
require("dotenv").config();

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

/**
 * Generate 5 alternative subjects and bodies using Groq LLM
 * @param {string} baseSubject - The original subject line
 * @param {string} baseBody - The original email body
 * @returns {Promise<{subjects: string[], bodies: string[]}>}
 */
async function generateEmailVariants(baseSubject, baseBody) {
  const prompt = `You are a witty yet professional email copywriter helping with job applications. Generate 5 alternative versions of the following job application email.

Original Subject: "${baseSubject}"

Original Body:
"${baseBody}"

IMPORTANT: Return ONLY valid JSON in this exact format, no markdown, no code blocks:
{"subjects":["subject1","subject2","subject3","subject4","subject5"],"bodies":["body1","body2","body3","body4","body5"]}

Rules:
1. Subjects must be plain and normal (no puns, no gimmicks, under 60 characters)
2. Bodies must be very short (3-4 lines max), unique, written in simple English
3. Each body must include one subtle tech or work-related pun - keep it light but still sharp and serious
4. Maintain the key points in the body: SDE/Full Stack/AI roles, resume link mention, eager to contribute
5. The tone should feel genuine and direct - not salesy, not overly formal
6. Do NOT use any special characters that could break JSON parsing
7. Return ONLY the JSON object, nothing else`;

  try {
    if (!groq) {
      throw new Error("Groq API client is not initialized because GROQ_API_KEY is missing in env");
    }
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "";
    console.log("LLM Response received, parsing JSON...");

    // Parse the JSON response
    const parsed = JSON.parse(responseText);

    if (
      !parsed.subjects ||
      !parsed.bodies ||
      parsed.subjects.length !== 5 ||
      parsed.bodies.length !== 5
    ) {
      throw new Error("Invalid response format from LLM");
    }

    console.log("✅ Successfully generated 5 email variants from LLM");
    return parsed;
  } catch (error) {
    console.error(
      "❌ Failed to generate email variants from LLM:",
      error.message,
    );
    console.log("⚠️ Using fallback: creating variants from base template");

    // Fallback: create simple variants if LLM fails
    return createFallbackVariants(baseSubject, baseBody);
  }
}

/**
 * Fallback function to create variants if LLM fails
 */
function createFallbackVariants(baseSubject, baseBody) {
  const resumeLink = baseBody.match(/Resume: (https?:\/\/\S+)/)?.[1] ?? "";
  const signature = "Thanks & Regards,\nSurya Janardhan\n+91 93914 69392";

  const subjects = [
    "Application for SDE / Full Stack / AI Intern Role",
    "SDE / Full Stack / AI Intern Application",
    "Internship Application - SDE / Full Stack / AI",
    "Applying for SDE / Full Stack / AI Intern Position",
    "SDE / Full Stack / AI Intern - Application",
  ];

  const bodies = [
    baseBody,
    `Hi,\n\nI debug code for fun, so I figured applying here was the next logical step. I am looking for SDE / Full Stack / AI intern roles and would love to contribute to your team.\n\nResume: ${resumeLink}\n\n${signature}`,
    `Hi,\n\nThey say every bug is just an undocumented feature - I am here to fix both. Sharing my resume for any SDE / Full Stack / AI intern openings you may have.\n\nResume: ${resumeLink}\n\n${signature}`,
    `Hi,\n\nI compile well under pressure and am eager to contribute to real projects. Please find my resume for SDE / Full Stack / AI intern roles.\n\nResume: ${resumeLink}\n\n${signature}`,
    `Hi,\n\nI have zero exceptions when it comes to learning fast. Looking for SDE / Full Stack / AI intern opportunities - resume linked below.\n\nResume: ${resumeLink}\n\n${signature}`,
  ];

  return { subjects, bodies };
}

/**
 * Generate personalized subject/body for a batch of 10 recruiters in a single LLM call
 * @param {Array} batchContexts List of recruiter contexts
 * @param {string} resumeLink Link to Surya's resume
 * @returns {Promise<Object>} Object mapping lowercase recruiter email to { subject, body }
 */
async function generateBatchPersonalizedEmails(batchContexts, resumeLink) {
  const prompt = `You are a witty, highly effective cold-email copywriter. You are helping Surya Janardhan apply for SDE / Full Stack / AI intern roles.
You will be given a list of recipient contexts (recruiter email, domain, company description, scraping status, and available job openings).
Generate a personalized cold email for each of the recipients.

Resume details for reference:
- Candidate name: Surya Janardhan
- Key skills: Full Stack development, Node.js, React, JavaScript/TypeScript, Python, Java, AI/ML, LLM applications (RAG, LangChain, LangGraph), APIs.
- Seeking: SDE / Full Stack / AI intern roles.
- Resume link: ${resumeLink}

For each recipient:
1. Subject line: Keep it clean, normal, professional, and direct (under 60 characters). Do not use cheesy puns or clickbait in the subject. Example: "Application for SDE / AI Intern Role" or "SDE Intern Application".
2. Email Body: Keep it very brief (max 3-4 lines). Make it engaging, direct, and tailormade based on their scraping status:
   - If status is "careers_scraped" and a matching job opening is listed: Mention that you saw the specific role (e.g. "{Job Title}") and express your interest/fit, referencing its relevance to your skills.
   - If status is "homepage_scraped": Personalize it by wittily referencing what the company does (from the description), and state that you'd love to contribute to their team as an SDE/Full Stack/AI intern.
   - If status is "failed/public": Use a witty, general tech-themed cold email body (like "I debug code for fun..." or "I compile well under pressure...").
3. Ensure every body clearly displays the resume link: "Resume: ${resumeLink}" or mentions it naturally.
4. Keep the tone friendly, confident, and direct. Do not sound salesy or overly formal.
5. Do NOT include placeholders (like [Company Name] or [Job Title]). Use the actual data provided. If info is missing or generic, write a general, witty body.

Input data (JSON array of recruiter contexts):
${JSON.stringify(batchContexts, null, 2)}

Return ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{
  "emails": [
    {
      "email": "recipient's email",
      "subject": "subject line",
      "body": "email body text"
    }
  ]
}
`;

  try {
    if (!groq) {
      throw new Error("Groq API client is not initialized because GROQ_API_KEY is missing in env");
    }
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "";
    console.log("LLM Response received for batch personalization, parsing...");
    const parsed = JSON.parse(responseText);

    if (!parsed.emails || !Array.isArray(parsed.emails)) {
      throw new Error("Invalid response format from LLM: missing 'emails' array");
    }

    // Map by email for easy lookup
    const emailMap = {};
    parsed.emails.forEach(item => {
      if (item.email) {
        emailMap[item.email.toLowerCase().trim()] = {
          subject: item.subject,
          body: item.body
        };
      }
    });

    return emailMap;
  } catch (error) {
    console.error("❌ Failed to generate batch personalized emails from LLM:", error.message);
    console.log("⚠️ Using fallback: generating generic emails for this batch");
    return createBatchFallback(batchContexts, resumeLink);
  }
}

/**
 * Fallback generator for batch emails when LLM fails
 */
function createBatchFallback(batchContexts, resumeLink) {
  const signature = "Thanks & Regards,\nSurya Janardhan\n+91 93914 69392";
  const fallbackTemplates = [
    `Hi,\n\nI debug code for fun, so I figured applying here was the next logical step. I am looking for SDE / Full Stack / AI intern roles and would love to contribute to your team.\n\nResume: ${resumeLink}\n\n${signature}`,
    `Hi,\n\nThey say every bug is just an undocumented feature - I am here to fix both. Sharing my resume for any SDE / Full Stack / AI intern openings you may have.\n\nResume: ${resumeLink}\n\n${signature}`,
    `Hi,\n\nI compile well under pressure and am eager to contribute to real projects. Please find my resume for SDE / Full Stack / AI intern roles.\n\nResume: ${resumeLink}\n\n${signature}`,
    `Hi,\n\nI have zero exceptions when it comes to learning fast. Looking for SDE / Full Stack / AI intern opportunities - resume linked below.\n\nResume: ${resumeLink}\n\n${signature}`,
  ];

  const emailMap = {};
  batchContexts.forEach((ctx, index) => {
    const template = fallbackTemplates[index % fallbackTemplates.length];
    emailMap[ctx.email.toLowerCase().trim()] = {
      subject: "Application for SDE / Full Stack / AI Intern Role",
      body: template
    };
  });

  return emailMap;
}

module.exports = { 
  generateEmailVariants, 
  generateBatchPersonalizedEmails 
};
