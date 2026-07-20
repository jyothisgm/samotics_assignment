// The Angular route /assets/:id and the backend API path /assets/:id share the same
// URL, so a plain path-prefix proxy can't tell "the browser navigated here" (should
// serve the SPA shell) apart from "Angular's HttpClient is fetching data" (should
// proxy to Flask). Browsers set Sec-Fetch-Mode: navigate on real page loads (typed
// URL, refresh, clicking a plain link) but not on fetch/XHR calls, so bypass proxying
// for those and let the dev server's SPA fallback serve index.html instead.
function bypassNavigations(req) {
  if (req.headers['sec-fetch-mode'] === 'navigate') {
    return '/index.html';
  }
}

module.exports = {
  '/auth': { target: 'http://127.0.0.1:5000', secure: false },
  '/assets': { target: 'http://127.0.0.1:5000', secure: false, bypass: bypassNavigations },
  '/health': { target: 'http://127.0.0.1:5000', secure: false },
};
