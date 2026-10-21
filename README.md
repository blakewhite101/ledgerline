# Ledgerline

A clean, free stock market site: markets, heatmap, watchlist with alerts, portfolio with sector weights and dividends, compare, calendar, an oil tanker map, and notes.

Static site served by GitHub Pages. GitHub Actions refresh the data:

- `update.yml`: prices and headlines every 30 minutes in market hours (`scripts/update.py`)
- `daily.yml`: key stats, analyst ratings and one year of history (`scripts/daily.py`)
- `tankers.yml`: tanker positions every 2 hours (`scripts/tankers.py`, needs the `AISSTREAM_API_KEY` secret)

Accounts use Supabase when `assets/config.js` has a project URL and anon key (schema in `supabase/schema.sql`); otherwise data stays in the visitor's browser.
