const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const Groq = require("groq-sdk");
require("dotenv").config();

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Google Sheets quota protection
const QUOTA_LIMIT_PER_MINUTE = 60;
const SAFE_QUOTA_PERCENT = 0.5;
const MAX_WRITES_PER_MINUTE = Math.floor(QUOTA_LIMIT_PER_MINUTE * SAFE_QUOTA_PERCENT);

let writeCountThisMinute = 0;
let minuteStartTime = Date.now();

function resetQuotaIfNewMinute() {
  const now = Date.now();
  if (now - minuteStartTime >= 60000) {
    writeCountThisMinute = 0;
    minuteStartTime = now;
    console.log("  [Quota] Minute reset, quota restored");
  }
}

function canWrite() {
  resetQuotaIfNewMinute();
  return writeCountThisMinute < MAX_WRITES_PER_MINUTE;
}

function incrementWriteCount() {
  writeCountThisMinute++;
  if (writeCountThisMinute % 5 === 0) {
    console.log(`  [Quota] ${writeCountThisMinute}/${MAX_WRITES_PER_MINUTE} writes this minute`);
  }
}

async function waitForQuotaReset() {
  const waitTime = Math.max(1000, 60000 - (Date.now() - minuteStartTime) + 1000);
  console.log(`  [Quota] Limit reached, waiting ${Math.ceil(waitTime/1000)}s for reset...`);
  await new Promise(resolve => setTimeout(resolve, waitTime));
  resetQuotaIfNewMinute();
}

function getServiceAccountPath() {
  const possiblePaths = [
    path.join(__dirname, "..", "seismic-rarity-468405-j1-cd12fe29c298.json"),
    path.join(__dirname, "..", "youtube-comments-468405-69c215cd5075.json"),
    path.join(__dirname, "..", "..", "seismic-rarity-468405-j1-cd12fe29c298.json"),
    path.join(__dirname, "..", "..", "youtube-comments-468405-69c215cd5075.json"),
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE
  ];
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      console.log(`🔑 Using service account file: ${p}`);
      return p;
    }
  }
  return path.join(__dirname, "..", "seismic-rarity-468405-j1-cd12fe29c298.json");
}

const SHEET_LINK =
  process.env.JOB_SHEET_LINK ||
  "https://docs.google.com/spreadsheets/d/1DvNSIB_M9yMx6u3Fh2wzdzRpZ_toJmaIwfrelnwP6Ts/edit?gid=0#gid=0";
const TARGET_JOBS = Number(process.env.TARGET_JOBS || 10);
const MAX_RUN_MINUTES = Number(process.env.MAX_RUN_MINUTES || 120);
const DRY_RUN = process.env.JOB_HUNTER_DRY_RUN === "1";
const RECIPIENT = process.env.JOB_EMAIL_RECIPIENT || "chintalajanardhan2004@gmail.com";
const FETCH_RETRIES = Number(process.env.JOB_FETCH_RETRIES || 3);
const FETCH_DELAY_MS = Number(process.env.JOB_FETCH_DELAY_MS || 450);
const SERVICE_ACCOUNT_FILE = getServiceAccountPath();

const REQUIRED_HEADERS = [
  "Domains",
  "Valid Domain",
  "scrapped at",
  "Total found jobs count",
  "Alligned jobs count",
  "Email sent with links",
];

const RESUME_KEYWORDS = [
  "software engineer",
  "software developer",
  "sde",
  "backend",
  "full stack",
  "node",
  "react",
  "javascript",
  "typescript",
  "python",
  "java",
  "ai",
  "ml",
  "machine learning",
  "deep learning",
  "llm",
  "rag",
  "langchain",
  "langgraph",
  "api",
  "intern",
];

const STACK_REQUIRED = [
  "software engineer",
  "software developer",
  "sde",
  "backend",
  "full stack",
  "node",
  "node.js",
  "react",
  "javascript",
  "typescript",
  "python",
  "java",
  "api",
  "ai",
  "ml",
  "llm",
];

const STACK_EXCLUDED = [
  ".net",
  "dotnet",
  "asp.net",
  "c#",
  "azure devops engineer",
  "sharepoint",
  "dynamics 365",
];

const FRESHER_POSITIVE = [
  "fresher",
  "freshers",
  "entry level",
  "entry-level",
  "graduate",
  "new grad",
  "intern",
  "internship",
  "trainee",
  "associate",
  "junior",
  "0-1 years",
  "0-2 years",
  "0 to 1 years",
  "0 to 2 years",
  "1 year",
  "2 years",
];

const SENIOR_NEGATIVE = [
  "senior",
  "staff",
  "lead",
  "principal",
  "architect",
  "manager",
  "director",
  "vp",
  "head of",
  "8+ years",
  "7+ years",
  "6+ years",
  "5+ years",
  "4+ years",
  "3+ years",
];

const INDIA_POSITIVE = [
  "india",
  "bengaluru",
  "bangalore",
  "hyderabad",
  "pune",
  "chennai",
  "gurgaon",
  "gurugram",
  "noida",
  "mumbai",
  "delhi",
  "kolkata",
  "ahmedabad",
  "coimbatore",
  "kochi",
  "remote india",
  "work from india",
  "wfh india",
];

const NON_INDIA_NEGATIVE = [
  "united states",
  "usa",
  "canada",
  "europe",
  "uk",
  "australia",
  "singapore",
  "germany",
  "only us",
  "us only",
  "eu only",
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
];

function extractSpreadsheetId(link) {
  const match = link.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Sheet link");
  return match[1];
}

function getAuth() {
  if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    throw new Error(
      `Missing Google service account file: ${SERVICE_ACCOUNT_FILE}. Set GOOGLE_SERVICE_ACCOUNT_FILE or create the default JSON file.`,
    );
  }
  return new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

async function getFirstSheetTitle(sheets, spreadsheetId) {
  const info = await sheets.spreadsheets.get({ spreadsheetId });
  const title = info.data.sheets?.[0]?.properties?.title;
  if (!title) throw new Error("No sheet tab found");
  return title;
}

async function ensureHeaders(sheets, spreadsheetId, sheetTitle) {
  await writeSheetValues(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!A1:F1`,
      valueInputOption: "RAW",
      requestBody: { values: [REQUIRED_HEADERS] },
    }),
  );
}

async function loadDomainRows(sheets, spreadsheetId, sheetTitle) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A2:F`,
  });
  const rows = res.data.values || [];
  return rows
    .map((row, idx) => ({
      rowNumber: idx + 2,
      domain: normalizeDomain(row[0] || ""),
    }))
    .filter((r) => r.domain.length > 0);
}

function isRetryableError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return ["429", "500", "502", "503", "504", "rate limit", "quota", "econnreset", "etimedout", "socket hang up"].some(
    (token) => message.includes(token),
  );
}

async function withRetry(action, label, attempts = 4, baseDelayMs = 500) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isRetryableError(err)) {
        break;
      }
      const backoff = baseDelayMs * attempt + Math.floor(Math.random() * 300);
      console.log(`  [Retry] ${label} failed (attempt ${attempt}/${attempts}), retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr || new Error(`${label} failed`);
}

async function writeSheetValues(action) {
  if (!canWrite()) {
    await waitForQuotaReset();
  }
  const result = await withRetry(action, "Google Sheets write");
  incrementWriteCount();
  return result;
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  let lastErr;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const ua = USER_AGENTS[(attempt - 1) % USER_AGENTS.length];
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": ua,
          "Accept-Language": "en-IN,en;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Connection: "keep-alive",
          Referer: "https://www.google.com/",
        },
        redirect: "follow",
      });

      // Retry on common anti-bot and transient responses
      if ([403, 408, 425, 429, 500, 502, 503, 504].includes(res.status)) {
        lastErr = new Error(`retryable_status_${res.status}`);
        await sleep(FETCH_DELAY_MS * attempt + Math.floor(Math.random() * 600));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(FETCH_DELAY_MS * attempt + Math.floor(Math.random() * 600));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr || new Error("fetch_failed");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDomain(domain) {
  const trimmed = domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return trimmed.toLowerCase();
}

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function stripHtml(input) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const href = m[1].trim();
    const text = stripHtml(m[2] || "").slice(0, 200);
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      continue;
    }
    try {
      links.push({ url: new URL(href, baseUrl).toString(), text });
    } catch {}
  }
  return links;
}

function extractAtsLinksFromHtml(html, baseUrl) {
  const found = new Set();
  const atsRegex =
    /https?:\/\/[^\s"'<>]+?(workdayjobs|greenhouse\.io|lever\.co|smartrecruiters|ashbyhq|ashby)\.[^\s"'<>]*/gi;
  let m;
  while ((m = atsRegex.exec(html || "")) !== null) {
    const n = normalizeUrl(m[0]);
    if (n) found.add(n);
  }

  // Also parse anchors because ATS URLs may be relative wrappers.
  for (const link of extractLinks(html || "", baseUrl)) {
    const n = normalizeUrl(link.url);
    if (!n) continue;
    if (/workdayjobs|greenhouse|lever\.co|smartrecruiters|ashby/i.test(n)) {
      found.add(n);
    }
  }
  return Array.from(found);
}

function looksLikeJobUrl(url, text = "") {
  const hay = `${url} ${text}`.toLowerCase();
  const include = [
    "job",
    "career",
    "opening",
    "vacanc",
    "position",
    "workdayjobs",
    "greenhouse",
    "lever.co",
    "smartrecruiters",
    "ashby",
    "job-",
    "intern",
    "software-engineer",
    "developer",
  ];
  return include.some((x) => hay.includes(x));
}

function isBlockedNonJobUrl(url, text = "") {
  const hay = `${url} ${text}`.toLowerCase();
  const blocked = [
    "login",
    "signin",
    "sign-in",
    "auth",
    "sso",
    "oauth",
    "account",
    "register",
    "signup",
    "sign-up",
    "faq",
    "help",
    "support",
    "contact",
    "about",
    "privacy",
    "terms",
    "home",
    "/#",
    "javascript:void",
  ];
  return blocked.some((b) => hay.includes(b));
}

function looksLikeDirectApplyUrl(url) {
  const lc = (url || "").toLowerCase();
  const good = [
    "apply",
    "requisition",
    "jobid=",
    "job_id=",
    "job/\\d+",
    "/jobs/",
    "/job/",
    "/careers/job",
    "workdayjobs",
    "greenhouse.io",
    "lever.co",
    "smartrecruiters",
    "ashby",
  ];
  if (good.some((g) => lc.includes(g))) return true;
  return /\/job\/\d+|\/jobs\/\d+|\/positions\/\d+/i.test(url || "");
}

function scoreAlignment(text) {
  const lc = text.toLowerCase();
  let score = 0;
  for (const k of RESUME_KEYWORDS) {
    if (lc.includes(k)) score += 1;
  }
  return score;
}

function classifyRoleType(text) {
  const lc = text.toLowerCase();
  if (/\bintern(ship)?\b/.test(lc)) return "internship";
  if (
    /\bfull[-\s]?time\b/.test(lc) ||
    /\bsoftware engineer\b/.test(lc) ||
    /\bdeveloper\b/.test(lc) ||
    /\bsde\b/.test(lc)
  ) {
    return "fte";
  }
  return "unknown";
}

function isTechAligned(text) {
  const lc = text.toLowerCase();
  if (STACK_EXCLUDED.some((k) => lc.includes(k))) return false;
  return STACK_REQUIRED.some((k) => lc.includes(k));
}

function getLocationEligibility(text) {
  const lc = text.toLowerCase();
  const hasIndia = INDIA_POSITIVE.some((k) => lc.includes(k));
  const hasNonIndia = NON_INDIA_NEGATIVE.some((k) => lc.includes(k));
  const hasRemote = /\bremote\b/.test(lc);
  const indiaEligible = hasIndia || (hasRemote && lc.includes("india"));
  if (!indiaEligible) return { indiaEligible: false, locationTag: "non-india/unknown" };
  if (hasNonIndia && !hasIndia) {
    return { indiaEligible: false, locationTag: "non-india" };
  }
  if (hasRemote) return { indiaEligible: true, locationTag: "remote-india" };
  return { indiaEligible: true, locationTag: "india-onsite/hybrid" };
}

function findFinalApplyUrl(html, baseUrl) {
  const links = extractLinks(html || "", baseUrl);
  const applySignals = [
    "apply",
    "apply now",
    "submit application",
    "job details",
    "view job",
    "start application",
  ];
  for (const l of links) {
    const hay = `${l.url} ${l.text}`.toLowerCase();
    if (isBlockedNonJobUrl(l.url, l.text)) continue;
    if (applySignals.some((s) => hay.includes(s))) {
      const normalized = normalizeUrl(l.url);
      if (normalized && looksLikeDirectApplyUrl(normalized)) return normalized;
    }
  }
  const fallback = normalizeUrl(baseUrl);
  if (
    fallback &&
    looksLikeJobUrl(fallback, "") &&
    !isBlockedNonJobUrl(fallback, "") &&
    looksLikeDirectApplyUrl(fallback)
  ) {
    return fallback;
  }
  return null;
}

function isLikelyJobPage(url, title, snippet) {
  const hay = `${url} ${title} ${snippet}`.toLowerCase();
  if (isBlockedNonJobUrl(url, `${title} ${snippet}`)) return false;
  const positive = [
    "job description",
    "responsibilities",
    "qualifications",
    "apply",
    "requisition",
    "job id",
    "job title",
    "opening",
    "position",
  ];
  return positive.some((p) => hay.includes(p));
}

function parseSitemapUrls(xml) {
  const urls = [];
  const locRegex = /<loc>([\s\S]*?)<\/loc>/gi;
  let m;
  while ((m = locRegex.exec(xml || "")) !== null) {
    const raw = stripHtml(m[1] || "");
    const n = normalizeUrl(raw);
    if (n) urls.push(n);
  }
  return urls;
}

function isBlockedPageContent(text) {
  const lc = (text || "").toLowerCase();
  
  // Check title for block/challenge signals
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].toLowerCase() : "";
  
  if (title.includes("access denied") || 
      title.includes("attention required") || 
      title.includes("security check") || 
      title.includes("checking your browser") || 
      title.includes("just a moment") ||
      title.includes("captcha")) {
    return true;
  }
  
  // Check for Cloudflare challenge markers in body
  if (lc.includes("cf-challenge-error") || 
      (lc.includes("ray id:") && lc.includes("cloudflare") && (lc.includes("captcha") || lc.includes("enable javascript")))) {
    return true;
  }
  
  // Check for generic robot/block messages in body
  if (lc.includes("please enable js and disable any ad-blockers") || 
      lc.includes("are you a robot?") ||
      lc.includes("blocked by cloudflare")) {
    return true;
  }
  
  return false;
}

function isFresherFriendly(text) {
  const lc = text.toLowerCase();
  if (SENIOR_NEGATIVE.some((k) => lc.includes(k))) return false;
  if (FRESHER_POSITIVE.some((k) => lc.includes(k))) return true;
  const yearsMatch = lc.match(/(\d+)\s*\+?\s*(year|years|yr|yrs)/);
  if (yearsMatch) {
    const years = Number(yearsMatch[1]);
    return Number.isFinite(years) && years <= 2;
  }
  return false;
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? stripHtml(titleMatch[1]).slice(0, 140) : "";
}

async function filterAlignedJobsWithLLM(candidates) {
  if (candidates.length === 0) return [];
  if (!groq) {
    console.log("⚠️ Groq client not initialized (missing GROQ_API_KEY). Using heuristic fallback.");
    return candidates.filter(j => 
      j.score >= 2 && 
      j.fresherFriendly && 
      j.techAligned && 
      j.indiaEligible && 
      (j.roleType === "internship" || j.roleType === "fte")
    );
  }

  const jobListData = candidates.map(c => ({
    title: c.title,
    url: c.url,
    snippet: c.snippet.substring(0, 500)
  }));

  const prompt = `You are an expert technical recruiter analyzing job listings for a candidate: Surya Janardhan.
Candidate Details:
- Name: Surya Janardhan
- Key Skills: Full Stack, Node.js, React, JavaScript/TypeScript, Python, Java, AI/ML, LLM applications (RAG, LangChain, LangGraph), APIs.
- Seeking: SDE / Full Stack / AI / Software Engineering intern or entry-level (fresher) roles.
- Eligibility: Located in India (hybrid/onsite India or remote).

Evaluate if each of the following jobs is a strong match for this candidate.
Requirements:
1. Must be a software development or AI/ML technical engineering role.
2. Must be an internship or entry-level/fresher role (maximum 2 years experience required). If it requires senior, lead, principal, or 3+ years of experience, reject it.
3. Must be open to candidates in India (remote or onsite/hybrid in India). If it explicitly requires being onsite in USA/Europe/UK and does not allow remote/India onsite, reject it.

Evaluate the following jobs:
${JSON.stringify(jobListData, null, 2)}

Return ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{
  "evaluations": [
    {
      "url": "job-url",
      "isAligned": true/false,
      "roleType": "internship" or "fte",
      "locationTag": "remote-india" or "india-onsite/hybrid" or "non-india",
      "reasoning": "brief explanation"
    }
  ]
}
`;

  try {
    console.log(`🧠 Calling Groq LLM to check alignment for ${candidates.length} candidate jobs in a single batch...`);
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(responseText);

    if (!parsed || !parsed.evaluations || !Array.isArray(parsed.evaluations)) {
      throw new Error("Invalid response format from LLM");
    }

    const evalMap = new Map();
    for (const item of parsed.evaluations) {
      evalMap.set(item.url, item);
    }

    const aligned = [];
    for (const c of candidates) {
      const evaluation = evalMap.get(c.url);
      if (evaluation && evaluation.isAligned) {
        aligned.push({
          ...c,
          roleType: evaluation.roleType || c.roleType,
          locationTag: evaluation.locationTag || c.locationTag,
          score: 5,
          fresherFriendly: true,
          techAligned: true,
          indiaEligible: true,
          llmVerified: true,
          reasoning: evaluation.reasoning
        });
      }
    }

    console.log(`   ✅ LLM verified ${aligned.length}/${candidates.length} jobs as aligned.`);
    return aligned;

  } catch (error) {
    console.error("❌ LLM job alignment check failed:", error.message);
    console.log("⚠️ Falling back to keyword heuristics...");
    return candidates.filter(j => 
      j.score >= 2 && 
      j.fresherFriendly && 
      j.techAligned && 
      j.indiaEligible && 
      (j.roleType === "internship" || j.roleType === "fte")
    );
  }
}

async function scrapeDomain(domain) {
  const cleanDomain = normalizeDomain(domain);
  if (!cleanDomain) {
    return { validDomain: false, totalFound: 0, aligned: [] };
  }
  const seedUrls = [
    `https://${cleanDomain}/careers`,
    `https://${cleanDomain}/career`,
    `https://${cleanDomain}/jobs`,
    `https://careers.${cleanDomain}`,
    `https://jobs.${cleanDomain}`,
    `https://${cleanDomain}/join-us`,
    `https://${cleanDomain}/careers/jobs`,
    `https://${cleanDomain}`,
  ];

  const queue = [...seedUrls];
  const visited = new Set();
  const candidates = new Map();

  // Stage 1: Seed from sitemap endpoints for deeper but targeted discovery.
  const sitemapUrls = [
    `https://${cleanDomain}/sitemap.xml`,
    `https://${cleanDomain}/sitemap_index.xml`,
  ];
  for (const sm of sitemapUrls) {
    try {
      const smRes = await fetchWithTimeout(sm, 10000);
      if (!smRes.ok) continue;
      const xml = await smRes.text();
      const urls = parseSitemapUrls(xml).filter((u) => looksLikeJobUrl(u, ""));
      for (const u of urls.slice(0, 120)) {
        if (!visited.has(u) && !isBlockedNonJobUrl(u, "")) queue.push(u);
      }
    } catch {}
  }

  const maxPages = Number(process.env.JOB_HUNTER_MAX_PAGES || 40);
  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift();
    const n = normalizeUrl(url);
    if (!n || visited.has(n)) continue;
    visited.add(n);

    let res;
    try {
      res = await fetchWithTimeout(url, 10000);
    } catch {
      continue;
    }

    if (!res.ok) continue;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) continue;

    let html = "";
    try {
      html = await res.text();
    } catch {
      continue;
    }
    if (isBlockedPageContent(html)) continue;

    const pageTitle = extractTitle(html);
    const links = extractLinks(html, res.url);
    const atsLinks = extractAtsLinksFromHtml(html, res.url);

    for (const ats of atsLinks) {
      if (!visited.has(ats) && !isBlockedNonJobUrl(ats, "")) queue.push(ats);
      if (!candidates.has(ats) && looksLikeJobUrl(ats, "")) {
        candidates.set(ats, {
          url: ats,
          title: pageTitle || "Job Opening",
          sourcePage: n,
        });
      }
    }

    for (const link of links) {
      const norm = normalizeUrl(link.url);
      if (!norm) continue;
      const sameRoot =
        norm.includes(cleanDomain) ||
        /workdayjobs|greenhouse|lever\.co|smartrecruiters|ashby/i.test(norm);

      if (!sameRoot) continue;
      if (isBlockedNonJobUrl(norm, link.text)) continue;

      if (looksLikeJobUrl(norm, link.text)) {
        const key = norm;
        if (!candidates.has(key)) {
          candidates.set(key, {
            url: norm,
            title: link.text || pageTitle || "Job Opening",
            sourcePage: n,
          });
        }
      }

      if (
        queue.length < 120 &&
        !visited.has(norm) &&
        looksLikeJobUrl(norm, link.text) &&
        !isBlockedNonJobUrl(norm, link.text)
      ) {
        queue.push(norm);
      }
    }
    await sleep(FETCH_DELAY_MS + Math.floor(Math.random() * 400));
  }

  const enriched = [];
  for (const item of candidates.values()) {
    let jobHtml = "";
    let title = item.title;
    let snippet = "";
    try {
      const jobRes = await fetchWithTimeout(item.url, 9000);
      if (jobRes.ok && (jobRes.headers.get("content-type") || "").includes("html")) {
        jobHtml = await jobRes.text();
        if (isBlockedPageContent(jobHtml)) continue;
        title = extractTitle(jobHtml) || title;
        snippet = stripHtml(jobHtml).slice(0, 900);
      }
    } catch {}

    enriched.push({
      ...item,
      title: title || "Job Opening",
      snippet,
      score: scoreAlignment(`${title} ${snippet}`),
      roleType: classifyRoleType(`${title} ${snippet}`),
      fresherFriendly: isFresherFriendly(`${title} ${snippet}`),
      techAligned: isTechAligned(`${title} ${snippet}`),
      ...getLocationEligibility(`${title} ${snippet} ${item.url}`),
      finalApplyUrl: findFinalApplyUrl(jobHtml, item.url),
    });
  }

  const candidateJobs = enriched.filter(
    (j) =>
      j.score >= 1 &&
      !!j.finalApplyUrl &&
      looksLikeDirectApplyUrl(j.finalApplyUrl) &&
      isLikelyJobPage(j.finalApplyUrl, j.title, j.snippet),
  );

  const aligned = await filterAlignedJobsWithLLM(candidateJobs);

  return {
    validDomain: visited.size > 0,
    totalFound: enriched.length,
    aligned,
  };
}

function oneLine(job) {
  return `${job.title.replace(/\s+/g, " ").trim()} [${job.roleType}] [${job.locationTag}] (match score: ${job.score})`;
}

async function updateDomainRow(sheets, spreadsheetId, sheetTitle, rowNumber, row) {
  await writeSheetValues(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!B${rowNumber}:F${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            row.validDomain ? "yes" : "no",
            row.scrappedAt,
            String(row.totalFound),
            String(row.alignedCount),
            row.emailSent,
          ],
        ],
      },
    }),
  );
}

async function sendJobsEmail(jobs) {
  if (DRY_RUN) {
    console.log("DRY RUN: skipping job email send");
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const lines = jobs.map(
    (job, i) =>
      `${i + 1}. ${oneLine(job)}\nType: ${job.roleType}\nFinal Apply Link: ${job.finalApplyUrl}\nCompany domain: ${job.domain}`,
  );
  const subject = `Daily Job Hunt India: ${jobs.length} aligned internship/job links`;
  const body = `Found ${jobs.length} unique India-eligible resume-aligned roles.\nOnly final apply links are included.\n\n${lines.join(
    "\n\n",
  )}\n\nGenerated at: ${new Date().toISOString()}`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: RECIPIENT,
    subject,
    text: body,
  });
  return true;
}

async function updateDomainRowsBatch(sheets, spreadsheetId, sheetTitle, updates) {
  const data = updates.map((update) => ({
    range: `${sheetTitle}!B${update.rowNumber}:F${update.rowNumber}`,
    values: [
      [
        update.stats.validDomain ? "yes" : "no",
        update.stats.scrappedAt,
        String(update.stats.totalFound),
        String(update.stats.alignedCount),
        update.stats.emailSent,
      ],
    ],
  }));

  if (data.length > 0) {
    await writeSheetValues(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data,
        },
      }),
    );
  }
}

async function run() {
  const started = Date.now();
  const runDeadline = started + MAX_RUN_MINUTES * 60 * 1000;
  const sheets = await getSheetsClient();
  const spreadsheetId = extractSpreadsheetId(SHEET_LINK);
  const sheetTitle = await getFirstSheetTitle(sheets, spreadsheetId);

  await ensureHeaders(sheets, spreadsheetId, sheetTitle);
  const domains = await loadDomainRows(sheets, spreadsheetId, sheetTitle);
  if (domains.length === 0) {
    throw new Error("No domains found in sheet column A");
  }

  console.log(`Loaded ${domains.length} domains to process`);

  const selected = new Map();
  const domainStats = new Map();

  // Scrape each domain exactly once
  for (const domainRow of domains) {
    if (selected.size >= TARGET_JOBS) {
      console.log(`Target of ${TARGET_JOBS} jobs reached, stopping scraping.`);
      break;
    }
    if (Date.now() >= runDeadline) {
      console.log("Deadline reached, stopping scraping.");
      break;
    }

    const domain = normalizeDomain(domainRow.domain);
    const now = new Date().toISOString();
    console.log(`[Job Hunter] Scraping domain: ${domain}...`);

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

    for (const job of result.aligned) {
      if (selected.size >= TARGET_JOBS) break;
      if (!selected.has(job.url)) {
        selected.set(job.url, { ...job, domain });
      }
    }
  }

  const pickedJobs = Array.from(selected.values()).slice(0, TARGET_JOBS);
  
  // Send email if we found ANY aligned jobs (rather than strictly requiring TARGET_JOBS)
  let sent = false;
  if (pickedJobs.length > 0) {
    console.log(`Sending email for ${pickedJobs.length} picked jobs...`);
    sent = await sendJobsEmail(pickedJobs);
  } else {
    console.log("No aligned jobs found, skipping email.");
  }

  // Construct status updates for all processed domains
  const updates = [];
  for (const domainRow of domains) {
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

  // Perform a single batch update to Google Sheets to conserve API quota
  if (updates.length > 0) {
    console.log(`Updating sent status for ${updates.length} rows in Google Sheets...`);
    await updateDomainRowsBatch(sheets, spreadsheetId, sheetTitle, updates);
  }

  console.log(
    `Completed run. collected=${pickedJobs.length}, target=${TARGET_JOBS}, emailSent=${sent}`,
  );
}

if (process.env.NODE_ENV !== "test") {
  run().catch((err) => {
    console.error("web-job-hunter failed:", err.message);
    process.exit(1);
  });
} else {
  module.exports = {
    normalizeDomain,
    scrapeDomain,
    sendJobsEmail,
    TARGET_JOBS,
    run
  };
}
