# emdash-references-bench

Counts the database queries an [EmDash](https://github.com/emdash-cms/emdash) page makes to list entries together with their reference fields. Written for discussion [emdash-cms/emdash#3598](https://github.com/emdash-cms/emdash/discussions/3598).

The data is a fictional conference archive: 15 editions × 130 sessions (1,950), 300 speakers, 6 rooms. Each session links to one edition, two speakers and one room through EmDash relations. Editions and speakers also have a `sessions` field on the other end of the same relations.

The query count is EmDash's own: the `db.count` value of the `Server-Timing` header. Each route is requested twice and the second request is reported, so start-up reads are left out. No object cache is configured.

## Run

Node 22 or later.

```bash
npm install
npm run setup   # generate the seed, apply it to ./data.db, build
npm run bench
```

`EDITIONS`, `SESSIONS_PER_EDITION` and `SPEAKERS` change the size of the archive (`npm run seed:generate`, then delete `data.db` and run `npm run setup` again). `EDITION` and `SPEAKER` choose the pages measured.

## What is measured

All four ways render the same list: one edition's sessions (or one speaker's), each with its other references.

| Mode | How |
|---|---|
| `all-then-filter` | `getEmDashCollection("sessions")` page by page, then `getEmDashEntry(..., { references: { edition, speakers, room } })` per session, filter in JS. The only way with the public API when `where` on a reference field is refused. |
| `reverse-then-entry` | `getEmDashReferences(owner, id, "sessions")` page by page, then `getEmDashEntry(..., { references })` per session for the other two fields. |
| `reverse-only` | The reverse read alone, without the sessions' references. Not a usable page: the floor the other modes build on. |
| `reverse-batched-prototype` | **Prototype, not public API.** The reverse read, then each other field loaded for all listed sessions at once: one link query per 50 parents with the per-parent limit applied by `ROW_NUMBER() OVER (PARTITION BY parent_group ...)`, and one target query per 50 targets. It reads EmDash's internal tables, only to show what a batched `references` option could cost. |

The `links` column counts the references each mode resolved; it must match across modes.

## Results

EmDash 1.2.0, Node 22, SQLite 3.53 (`node:sqlite`), 8 October 2026.

| Page | Mode | Sessions | Links | Queries | Per session |
|---|---|---:|---:|---:|---:|
| Edition | `all-then-filter` | 130 | 390 | 13,671 | 105.2 |
| Edition | `reverse-then-entry` | 130 | 390 | 659 | 5.1 |
| Edition | `reverse-only` | 130 | – | 8 | 0.1 |
| Edition | `reverse-batched-prototype` | 130 | 390 | 22 | 0.2 |
| Speaker | `all-then-filter` | 13 | 26 | 13,672 | 1,051.7 |
| Speaker | `reverse-then-entry` | 13 | 26 | 70 | 5.4 |
| Speaker | `reverse-only` | 13 | – | 4 | 0.3 |
| Speaker | `reverse-batched-prototype` | 13 | 26 | 10 | 0.8 |

`getEmDashEntry` with references costs one query for the entry, then one link query and one target query per field: 7 per session with three fields, 5 with two. Not measured here: Cloudflare D1, where each query is a network round trip.

## License

MIT
