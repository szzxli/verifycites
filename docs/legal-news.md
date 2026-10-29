# Citation-integrity news

The legal page shows a short list of court opinions whose text matches a
fixed CourtListener search. The browser does not call CourtListener.
`scripts/legal_news_poll.py` runs in GitHub Actions, writes
`data/legal-news.json`, and the page reads that same-origin file.

Inclusion in the list does not mean a court found misconduct. The list
is not legal advice. The note on the page is English only and is not
passed through the language switcher.

## Query

The poller does not search for the standalone word "sanctions". That
word also matches economic sanctions and other unrelated orders. A hit
has to name a fabricated, fictitious, nonexistent, hallucinated, or
AI-generated citation or case, and it also has to name an AI system or
technology.

This is the exact query string (`LEGAL_NEWS_QUERY` in
`scripts/legal_news_poll.py`):

```
("fabricated citation" OR "fabricated citations" OR "fabricated case" OR "fabricated cases" OR "fictitious citation" OR "fictitious citations" OR "fictitious case" OR "fictitious cases" OR "hallucinated citation" OR "hallucinated citations" OR "hallucinated case" OR "hallucinated cases" OR "nonexistent citation" OR "nonexistent citations" OR "nonexistent case" OR "non-existent citation" OR "non-existent case" OR "AI-generated citation" OR "AI-generated citations" OR "artificial intelligence hallucination" OR "artificial intelligence hallucinations") AND ("artificial intelligence" OR "AI-generated" OR ChatGPT OR "generative AI" OR "generative artificial intelligence" OR "large language model" OR GPT)
```

Feed URL shape (the `q` parameter is the query above, UTF-8 percent-encoded):

`https://www.courtlistener.com/feed/search/?type=o&order_by=dateFiled%20desc&q=...`

## JSON

`data/legal-news.json` fields:

| Field | Meaning |
|---|---|
| `status` | `ok` after a successful fetch, `error` after a failed attempt. |
| `updated_utc` | UTC time of the last attempt, success or failure. |
| `last_success_utc` | UTC time of the last attempt that succeeded. Unchanged when a later attempt fails. |
| `query` | The exact `LEGAL_NEWS_QUERY` string. |
| `error` | Error text when `status` is `error`, otherwise `null`. |
| `items` | Up to 20 opinions from the latest successful feed: `date`, `court`, `case_name`, `url`. On failure, the previous items are kept. |

The page shows `last_success_utc` as stored. It renders at most 10 items.
When `status` is `error`, or the last attempt time differs from
`last_success_utc`, the page says the list is from the last successful
update and does not present it as a new fetch.

Marks and preferences are not in this file. Nothing about a user is
stored on the server. Hand-check marks stay in browser `localStorage`.
