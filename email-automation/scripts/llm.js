const Groq = require("groq-sdk");
require("dotenv").config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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

module.exports = { generateEmailVariants };
