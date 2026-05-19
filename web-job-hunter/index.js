const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
require("dotenv").config();

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

const SHEET_LINK =
  process.env.JOB_SHEET_LINK ||
  "https://docs.google.com/spreadsheets/d/1DvNSIB_M9yMx6u3Fh2wzdzRpZ_toJmaIwfrelnwP6Ts/edit?gid=0#gid=0";
const TARGET_JOBS = Number(process.env.TARGET_JOBS || 10);
const MAX_RUN_MINUTES = Number(process.env.MAX_RUN_MINUTES || 120);
const DRY_RUN = process.env.JOB_HUNTER_DRY_RUN === "1";
const RECIPIENT = process.env.JOB_EMAIL_RECIPIENT || "chintalajanardhan2004@gmail.com";
const FETCH_RETRIES = Number(process.env.JOB_FETCH_RETRIES || 3);
const FETCH_DELAY_MS = Number(process.env.JOB_FETCH_DELAY_MS || 450);
const SERVICE_ACCOUNT_FILE =
  process.env.GOOGLE_SERVICE_ACCOUNT_FILE ||
  path.join(__dirname, "..", "seismic-rarity-468405-j1-cd12fe29c298.json");

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
  const blockedSignals = [
    "access denied",
    "are you a robot",
    "captcha",
    "forbidden",
    "temporarily unavailable",
    "request blocked",
    "security check",
    "cloudflare",
    "akamai",
  ];
  return blockedSignals.some((s) => lc.includes(s));
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

  while (queue.length > 0 && visited.size < 40) {
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

  const aligned = enriched
    .filter(
      (j) =>
        j.score >= 2 &&
        j.fresherFriendly &&
        j.techAligned &&
        j.indiaEligible &&
        (j.roleType === "internship" || j.roleType === "fte") &&
        !!j.finalApplyUrl &&
        looksLikeDirectApplyUrl(j.finalApplyUrl) &&
        isLikelyJobPage(j.finalApplyUrl, j.title, j.snippet),
    )
    .sort((a, b) => b.score - a.score);

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

  const selected = new Map();
  const domainStats = new Map();

  while (
    selected.size < TARGET_JOBS &&
    Date.now() < runDeadline
  ) {
    let madeProgress = false;
    for (const domainRow of domains) {
      if (selected.size >= TARGET_JOBS) break;
      if (Date.now() >= runDeadline) break;
      const domain = normalizeDomain(domainRow.domain);
      const now = new Date().toISOString();

      let result;
      try {
        result = await scrapeDomain(domain);
      } catch {
        result = { validDomain: false, totalFound: 0, aligned: [] };
      }

      domainStats.set(domainRow.rowNumber, {
        validDomain: result.validDomain,
        scrappedAt: now,
        totalFound: result.totalFound,
        alignedCount: result.aligned.length,
        emailSent: "no",
      });

      for (const job of result.aligned) {
        if (selected.size >= TARGET_JOBS) break;
        if (!selected.has(job.url)) {
          selected.set(job.url, { ...job, domain });
          madeProgress = true;
        }
      }

      await updateDomainRow(
        sheets,
        spreadsheetId,
        sheetTitle,
        domainRow.rowNumber,
        domainStats.get(domainRow.rowNumber),
      );
    }

    if (!madeProgress) {
      const remainingMs = runDeadline - Date.now();
      if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(60000, remainingMs)));
      }
    }
  }

  const pickedJobs = Array.from(selected.values()).slice(0, TARGET_JOBS);
  const sent =
    pickedJobs.length === TARGET_JOBS ? await sendJobsEmail(pickedJobs) : false;

  for (const domainRow of domains) {
    if (Date.now() >= runDeadline) break;
    const prev = domainStats.get(domainRow.rowNumber);
    if (!prev) continue;
    const patch = {
      ...prev,
      emailSent: sent
        ? `yes (${new Date().toISOString()})`
        : `no (${pickedJobs.length}/${TARGET_JOBS})`,
    };
    await updateDomainRow(
      sheets,
      spreadsheetId,
      sheetTitle,
      domainRow.rowNumber,
      patch,
    );
  }

  console.log(
    `Completed run. collected=${pickedJobs.length}, target=${TARGET_JOBS}, emailSent=${sent}`,
  );
}

run().catch((err) => {
  console.error("daily-job-hunter failed:", err.message);
  process.exit(1);
});
