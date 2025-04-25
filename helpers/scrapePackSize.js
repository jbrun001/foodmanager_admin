// const puppeteer = require("puppeteer");  // was working non headless with page titles but not when click on cookie
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const fs = require("fs");
const path = require("path");

async function scrapePackSize(url) {
  const log = [];
  const container = true; // true = chrome runs headless without UI
  let browser;

  let result = {
    packSize: null,
    units: null,
    title: null,
    rawText: "",
    logs: log,
  };

  try {
    log.push("launching browser...");
    if (container) {
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        protocolTimeout: 120000, // increased from 45000 because of timeouts
      });
    } else {
      browser = await puppeteer.launch({
        headless: false, // show browser for debugging
        defaultViewport: null, // full-size window
        args: ["--start-maximized"], // open maximized
        timeout: 0, // no global timeout cap
      });
    }
    // headers - to avoid http2 errors and blocking
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-GB,en;q=0.9",
    });

    log.push(`navigating to: ${url}`);
    const startNav = Date.now();
    // put this in another try catch so we can get debug info
    let response;
    let status = null;
    let htmlSize = 0;

    try {
      response = await page.goto(url, {
        waitUntil: "networkidle2", // wait until no traffic
        timeout: 20000, // wait a long time for the load
      });

      status = response?.status();
      const html = await response?.text();
      htmlSize = html?.length || 0;
      result.html = html;

      log.push(`page loaded in ${Date.now() - startNav}ms`);
      log.push(`http status code: ${status}`);
      log.push(`html size: ${htmlSize} bytes`);
      log.push(`html preview: ${html?.slice(0, 500).replace(/\s+/g, " ")}`);
    } catch (err) {
      log.push(`page failed to fully load: ${err.message}`);

      // fallback: try to extract what we can from the partially loaded page
      try {
        const fallbackUrl = page.url();
        const fallbackTitle = await page.title();
        const fallbackText = await page.evaluate(() => document.body.innerText);

        result.title = fallbackTitle;
        result.rawText = fallbackText;

        log.push(`partial url: ${fallbackUrl}`);
        log.push(`partial title: "${fallbackTitle}"`);
        log.push(`partial text length: ${fallbackText.length} characters`);
      } catch (fallbackErr) {
        log.push(`could not extract partial content: ${fallbackErr.message}`);
      }

      // continue anyway even if it failed
    }

    // check the page title right after load if it contains the pack size
    // we can skip the rest
    const title = await page.title();
    result.title = title;
    log.push(`page title: "${title}"`);
    log.push("checking title for pack size...");

    const titleMatch = title.match(
      /\b(\d+(?:[\.,]\d+)?)(?:\s*)(g|grams|kg|ml|litre|litres|pieces|pcs|pack|sachets?)\b/i
    );

    if (titleMatch) {
      result.packSize = parseFloat(titleMatch[1].replace(",", "."));
      result.units = titleMatch[2].toLowerCase();
      log.push(`found pack size in title: ${result.packSize} ${result.units}`);
      await browser.close(); // we're done early
      return result;
    }

    // not in title need to look further in the page - at the body
    // first click the popup
    // check for cookie popup and click it
    try {
      log.push("checking for cookie popup...");

      const accepted = await Promise.race([
        page.evaluate(() => {
          for (const button of document.querySelectorAll("button")) {
            const text = button.innerText?.trim().toLowerCase();
            if (
              text === "accept" ||
              text === "accept all" ||
              text.includes("accept") ||
              text.includes("allow all")
            ) {
              button.click();
              return true;
            }
          }
          return false;
        }),
        new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
      ]);

      if (accepted) {
        log.push("cookie popup button clicked");
        await new Promise((resolve) => setTimeout(resolve, 4000)); // wait 4 seconds before moving on
      } else {
        log.push("no cookie popup matched or click timed out");
      }
    } catch (err) {
      log.push(`error handling cookie popup: ${err.message}`);
    }

    // check if we are blocked
    const content = await page.content();
    if (content.toLowerCase().includes("access denied")) {
      log.push("page content includes access denied — likely blocked");
      result.blocked = true;
      await new Promise((resolve) => setTimeout(resolve, 10000)); // pause for 10s
      await browser.close();
      return result;
    }

    // scrape the visible text from the page body (with timeout)
    log.push("extracting page text...");
    let bodyText = "";
    try {
      bodyText = await Promise.race([
        page.evaluate(() => document.body.innerText),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("body text timeout")), 10000)
        ),
      ]);
    } catch (err) {
      log.push(`could not extract body text: ${err.message}`);
    }

    result.rawText = bodyText;

    log.push("searching for pack size in body...");
    const regex =
      /\b(\d+(?:[\.,]\d+)?)(?:\s*)(g|grams|kg|ml|litre|loose|each|litres|pieces|pcs|pack|sachets?)\b/i;
    const match = bodyText?.match(regex);
    if (match) {
      const matchText = match[0].toLowerCase();
      const surroundingText = bodyText
        .toLowerCase()
        .slice(Math.max(0, match.index - 40), match.index + 40);

      const likelyNutrition =
        /per\s+\d+(?:[\.,]\d+)?\s*(g|grams|ml|kg|litre|litres)/i.test(
          surroundingText
        ) || surroundingText.includes("typical values");

      if (likelyNutrition) {
        log.push(
          `excluded "${
            match[0]
          }" because it looks like nutrition info: "${surroundingText.trim()}"`
        );
      } else {
        result.packSize = parseFloat(match[1].replace(",", "."));
        result.units = match[2].toLowerCase();
        log.push(`found pack size in body: ${result.packSize} ${result.units}`);
      }
    } else {
      log.push("no pack size found in body.");
    }

    await browser.close();
  } catch (err) {
    log.push(`error: ${err.message}`);
  }

  return result;
}

module.exports = { scrapePackSize };
