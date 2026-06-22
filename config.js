// config.js — DO NOT put real secrets here.
// This file is overwritten automatically during GitHub Actions deployment,
// using the MONTHLY_PASS_SHEET_URL and PIN_MONTHLY_PASS secrets. Locally,
// replace the placeholders below for testing only, and never commit real values.
//
// NOTE: Since this is a static site, anything in this file is visible to
// anyone who views page source on the deployed site. The PIN here is a
// casual-access gate, not real security — it keeps random visitors out,
// not a determined attacker.
window.SHEET_API_URL = "PLACEHOLDER_SHEET_URL";
window.APP_PIN = "PLACEHOLDER_PIN";
