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
  "yandex.ru",
]);

/**
 * Parses and extracts the domain name from the recruiter's email
 * without performing any external web search or scraping.
 * @param {string} email Recruiter email
 * @returns {Promise<Object>} Extracted domain context object
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

  console.log(`🔍 Extracted company domain: ${domain} (from email: ${email})`);
  return {
    status: "domain_extracted",
    domain,
    companyDescription: "",
    jobOpenings: [],
  };
}

module.exports = {
  scrapeRecruiterDomain,
};
