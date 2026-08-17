# Changelog

## Unreleased

### Breaking — credit redenomination (2026-08-17)

**A credit is now $0.0025 rather than $0.01.** Every credit-denominated number returned by the API
is 4× what it was; the dollar prices behind them are unchanged, apart from ingest, which got 4×
cheaper. One page of ingest now costs exactly one credit.

Most of this needs no code change — the values you read are simply larger. Two things do:

- **`createColumn`/`updateColumn` reject the old `creditRate` range.** Valid values are now **4–40**
  (previously 1–10), and the API returns **400** for anything below 4. Code that passed
  `creditRate: 1` to mean "the default" must either pass `4` or, better, **omit the field** and let
  the server apply its own default.
- **Anything comparing a balance or cost against a hardcoded threshold** is now comparing against a
  number 4× larger. A client that warned below "100 credits" is warning at a quarter of the money it
  used to.

Unchanged: the shape of every response, `previewRun()`'s contract (it still prices exactly the cells
a run would create), and 402 remaining an ordinary operating state rather than an error.

Reference: `../ragextract-docs/business/pricing-and-costs.md` §2a.
