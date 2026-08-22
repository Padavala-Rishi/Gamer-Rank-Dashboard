# Gamer Rank Dashboard

A leaderboard UI built for a 2-hour AI mini hackathon. Given a Player ID, it dynamically shows the top 3 overall players plus that player's score and their immediate neighbors on the leaderboard.

## Problem Statement

> Gamer Rank Dashboard: Build a leaderboard UI. Given a specific player's ID, the interface must dynamically render only the top 3 overall players, along with the specific player's score and the players immediately above and below them.

## Description

The dashboard holds a dataset of 45 fictional players (ID, name, score). On load, it sorts the dataset by score and computes every player's rank live — nothing is hardcoded. A search bar lets you enter a Player ID; the app then shows:

- The top 3 players overall (always visible)
- The searched player's name, ID, rank, and score
- The player ranked directly above them and directly below them
- Friendly handling for rank #1 (no "above"), the last-ranked player (no "below"), invalid IDs, and empty searches

## Features

- Live search by Player ID
- Top 3 podium display
- "Nearby standings" ladder (above / selected / below)
- Full edge-case handling (rank 1, rank 2, rank 3, last place, invalid ID, empty input)
- Responsive, dark gaming-inspired UI with no external JS dependencies
- Zero build step — a single static HTML file

## Tech Stack

- HTML, CSS, vanilla JavaScript (single file, no framework, no backend)
- Google Fonts (Rajdhani, Inter, JetBrains Mono) loaded via CDN
- Mock in-browser data — no database or API needed for this scope

This stack was chosen deliberately for a 2-hour hackathon window: no build tooling, no server, no dependency installs — you can open `index.html` directly in a browser and it works.

## How the Ranking Logic Works

1. `buildPlayers()` generates 45 players with descending, realistic scores (deterministic seeded random, so results are reproducible).
2. `getRankedPlayers()` sorts the full dataset by score (descending, ties broken by ID) and assigns `rank = index + 1`. This is the **only** source of truth for rank — it is recalculated from the data every time, never hardcoded.
3. `getTop3()` takes the first 3 entries of the ranked list.
4. `findPlayerById()` looks up the searched player in the ranked list.
5. `getSurroundingWindow()` finds the players at `rank - 1` and `rank + 1` relative to the searched player, returning `null` when there is no such rank (i.e., searched player is #1 or last).

## How to Run Locally

No install required:

```bash
git clone https://github.com/<your-username>/gamer-rank-dashboard.git
cd gamer-rank-dashboard
open index.html   # macOS
# or just double-click index.html / drag it into a browser
```

## Testing Performed

| Test | Scenario | Result |
|---|---|---|
| 1 | Mid-pack player search | Correct rank, score, above/below neighbors, top 3 unaffected |
| 2 | Rank #1 search | "Above" correctly empty, "below" shows rank #2 |
| 3 | Rank #2 / #3 search | Correct neighbors on both sides |
| 4 | Last-ranked player search | "Below" correctly empty, "above" shows second-to-last |
| 5 | Invalid Player ID | Friendly error state, no crash |
| 6 | Empty search submit | Validation message, no crash |

Logic was additionally verified with a standalone Node script that asserts the dataset sorts correctly in descending order and that all edge cases return the expected `null`/neighbor values.

## AI Usage

AI was used to: scaffold the HTML/CSS/JS structure, generate the mock player dataset, implement and sanity-check the ranking/search logic, design the visual UI, and write this documentation. The core ranking algorithm was verified independently with a small Node.js test script before being placed into the app.

## Future Improvements

- Replace mock data with a real backend/API and persistent database
- Add pagination or infinite scroll for browsing the full leaderboard
- Add player avatars and regional/seasonal leaderboards
- Add fuzzy/partial name search in addition to exact ID search
