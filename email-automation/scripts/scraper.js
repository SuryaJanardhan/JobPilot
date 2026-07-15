const fs = require("fs");

// Constants
const FETCH_TIMEOUT_MS = 8000;
const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "mail.com",
  "yandex.com",
  "gmx.com",
  "mail.ru",
]);

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
];

// Helper to fetch with timeout and UA rotation
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Helpers adapted from web-job-hunter
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

function isTechAligned(text) {
  const lc = text.toLowerCase();
  const STACK_EXCLUDED = [".net", "dotnet", "asp.net", "c#", "azure devops", "sharepoint"];
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
    "intern",
  ];
  if (STACK_EXCLUDED.some((k) => lc.includes(k))) return false;
  return STACK_REQUIRED.some((k) => lc.includes(k));
}

function isFresherFriendly(text) {
  const lc = text.toLowerCase();
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
  const FRESHER_POSITIVE = [
    "fresher",
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
    "1 year",
    "2 years",
  ];
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

/**
 * Scrapes a recruiter domain to extract homepage description and tech/fresher job openings
 * @param {string} email Recruiter email
 * @returns {Promise<Object>} Scraping context object
 */
async function scrapeRecruiterDomain(email) {
  const parts = (email || "").split("@");
  if (parts.length < 2) {
    return { status: "failed/public", domain: "", companyDescription: "", jobOpenings: [] };
  }

  const domain = parts[1].toLowerCase().trim();
  if (PUBLIC_DOMAINS.has(domain)) {
    return { status: "failed/public", domain, companyDescription: "", jobOpenings: [] };
  }

  console.log(`🔍 Scraping company domain: ${domain} (from email: ${email})`);

  let homepageHtml = "";
  let finalUrl = "";

  // Attempt to fetch homepage (https and www fallbacks)
  const urlsToTry = [`https://${domain}`, `https://www.${domain}`];
  for (const url of urlsToTry) {
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (res.ok) {
        const text = await res.text();
        if (text && !isBlockedPageContent(text)) {
          homepageHtml = text;
          finalUrl = res.url;
          break;
        } else if (text && isBlockedPageContent(text)) {
          console.log(`      Blocked page content detected on ${url}`);
        }
      } else {
        console.log(`      Response not OK for ${url}: status=${res.status}`);
      }
    } catch (err) {
      console.log(`      Fetch error for ${url}: ${err.message}`);
    }
  }

  if (!homepageHtml) {
    console.log(`   ⚠️ Failed to load homepage for ${domain} (timeout/blocked/offline)`);
    return { status: "failed/public", domain, companyDescription: "", jobOpenings: [] };
  }

  // Extract meta description and title to get what company does
  const title = extractTitle(homepageHtml);
  const metaDescMatch =
    homepageHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    homepageHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const metaDesc = metaDescMatch ? stripHtml(metaDescMatch[1]) : "";
  const bodyText = stripHtml(homepageHtml).slice(0, 500);

  const companyDescription = `${title}. ${metaDesc}. ${bodyText}`
    .replace(/\s+/g, " ")
    .slice(0, 1000)
    .trim();

  // Find career/job links on homepage
  const links = extractLinks(homepageHtml, finalUrl || `https://${domain}`);
  const careerLinks = [];
  const seenUrls = new Set();

  for (const l of links) {
    const url = normalizeUrl(l.url);
    if (!url || seenUrls.has(url)) continue;
    if (isBlockedNonJobUrl(url, l.text)) continue;

    const hrefLc = url.toLowerCase();
    const textLc = l.text.toLowerCase();

    // Match slash prefixes or word boundaries for careers/jobs/hiring/join-us
    const isCareerUrl = /\/(careers?|jobs?|join-us|hiring|work-at)\b/i.test(hrefLc) ||
                        /\b(careers?|jobs?|join us|openings|open positions|we are hiring)\b/i.test(textLc);

    if (isCareerUrl) {
      careerLinks.push({ url, text: l.text });
      seenUrls.add(url);
      if (careerLinks.length >= 3) break;
    }
  }

  const jobOpenings = [];
  let scrapingStatus = "homepage_scraped";

  // If career page link found, fetch it and check for job openings matching resume keywords
  if (careerLinks.length > 0) {
    console.log(`   📂 Found career link: ${careerLinks[0].url}, scraping for openings...`);
    try {
      const careerRes = await fetchWithTimeout(careerLinks[0].url, FETCH_TIMEOUT_MS);
      if (careerRes.ok) {
        const careerHtml = await careerRes.text();
        if (careerHtml && !isBlockedPageContent(careerHtml)) {
          const careerLinksInPage = extractLinks(careerHtml, careerRes.url);

          for (const l of careerLinksInPage) {
            const url = normalizeUrl(l.url);
            if (!url) continue;
            if (isBlockedNonJobUrl(url, l.text)) continue;

            const matchesJobText = looksLikeJobUrl(url, l.text) && isTechAligned(l.text) && isFresherFriendly(l.text);
            if (matchesJobText) {
              const idMatch =
                url.match(/(?:job|opening|requisition|position)s?\/([a-zA-Z0-9-_]+)/i) ||
                url.match(/[?&](?:jobid|id|job_id)=([a-zA-Z0-9-_]+)/i);
              const jobId = idMatch ? idMatch[1] : "";

              jobOpenings.push({
                title: l.text.trim(),
                url: url,
                id: jobId,
              });

              if (jobOpenings.length >= 3) break; // Limit to 3 openings max
            }
          }

          if (jobOpenings.length > 0) {
            console.log(`   ✅ Found ${jobOpenings.length} aligned openings!`);
            scrapingStatus = "careers_scraped";
          }
        }
      }
    } catch (err) {
      console.log(`   ⚠️ Failed to fetch career page: ${err.message}`);
    }
  }

  return {
    status: scrapingStatus,
    domain,
    companyDescription: companyDescription || "No description available.",
    jobOpenings,
  };
}

module.exports = {
  scrapeRecruiterDomain,
};
