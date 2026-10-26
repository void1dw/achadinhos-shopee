# GA4 reporting setup

The site sends the `select_item`, `affiliate_click`, and `select_category` events to the existing GA4 property. The affiliate event includes the selected product in the GA4 ecommerce `items` array and sends only the destination hostname as `link_domain`.

The private endpoint `GET /api/analytics/report` uses the Google Analytics Data API. It returns daily page views, sessions and users; daily counts for the three commercial events; session source/medium; selected products; affiliate clicks by product and domain; and category selections. Join `productSelections.itemId` to `affiliateProducts.affiliate_product_id` to compare product interest with affiliate exits. The endpoint is intentionally an API, not a public dashboard: it requires a bearer token and does not expose credentials to the browser.

## Google configuration required

1. In Google Cloud Console, select or create a project and enable **Google Analytics Data API**.
2. Create a service account and a JSON key. Keep the downloaded key outside the repository.
3. In GA4 Admin, copy the numeric **Property ID** and add the service-account email as a property user with the **Viewer** role.
4. In GA4 Admin → **Custom definitions**, register five event-scoped custom dimensions:
   - `link_domain` (description: affiliate destination hostname)
   - `affiliate_product_id` (description: product ID associated with an affiliate click)
   - `affiliate_product_name` (description: product name associated with an affiliate click)
   - `affiliate_product_category` (description: product category associated with an affiliate click)
   - `category_name` (description: selected site category)
     Custom dimensions are not retroactive and may take time to appear in reports.
5. In Cloudflare Workers → `achadinholia` → **Settings → Variables and Secrets**, create these secrets:
   - `GA4_PROPERTY_ID`: numeric GA4 property ID
   - `GA4_SERVICE_ACCOUNT_EMAIL`: service-account email
   - `GA4_SERVICE_ACCOUNT_PRIVATE_KEY`: the `private_key` value from the JSON key
   - `GA4_DASHBOARD_TOKEN`: a new, high-entropy random secret (at least 32 random bytes)
   - `ADMIN_USERNAME`: a unique administrator login name
   - `ADMIN_PASSWORD`: a randomly generated password with at least 32 characters
   - `ADMIN_SESSION_SECRET`: an independent random value with at least 32 characters for signing 8-hour sessions
6. Keep the service account key and dashboard token out of Git, browser code, query strings, and chat. Rotate/revoke them if they are exposed.

Until all seven Worker secrets, the API enablement, the GA4 property permission, and all five custom dimensions are configured, the dashboard will show the protected integration-pending state or incomplete custom-dimension reports. A report that fails individually (for example, an unregistered custom dimension) returns an empty array and a message under `reports.errors.<section>`; the other sections still return data. Authentication or authorization failures against Google still return HTTP 502.

## Administrator access

Open `/admin`. A server-side username/password check issues an 8-hour HMAC-signed `HttpOnly`, `Secure` (on HTTPS), `SameSite=Strict` cookie. The page server uses the report API token internally; neither that token nor Google credentials are returned to the browser. Configure a long random password and keep it distinct from the API token. For organizations with Cloudflare Zero Trust, add Cloudflare Access on a custom domain as an additional identity-aware gate.

## Request the report

Send the dashboard token in the `Authorization` header from a trusted terminal or server. The default range is the most recent 30 days; custom dates are inclusive and limited to 90 days.

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $GA4_DASHBOARD_TOKEN" \
  "https://achadinholia.brunomarinhomattoss2.workers.dev/api/analytics/report?startDate=2026-10-01&endDate=2026-10-26"
```

The endpoint is uncached and makes eight read-only Data API reports per request. It returns `401` for a missing/invalid token, `400` for an invalid date range, `503` when credentials are not configured, and `502` when Google OAuth or the Data API fails.
