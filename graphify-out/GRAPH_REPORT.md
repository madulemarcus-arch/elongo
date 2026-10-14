# Graph Report - elongo  (2026-10-14)

## Corpus Check
- 22 files · ~59,468 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .webmanifest 1, .css 1)

## Summary
- 710 nodes · 1796 edges · 34 communities (19 shown, 15 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 182 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7258fd2d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app.js
- k
- De
- $
- B
- n
- A
- e2e.mjs
- e
- C
- push.mjs
- jspdf.umd.min.js
- jspdf.plugin.autotable.min.js
- T
- B
- .push
- wt
- B
- index.ts
- package.json
- Ee
- j
- CLAUDE.md
- scripts
- icons.mjs
- h
- U
- .upsert
- rls.sh

## God Nodes (most connected - your core abstractions)
1. `De()` - 106 edges
2. `m()` - 69 edges
3. `k()` - 62 edges
4. `$` - 56 edges
5. `n` - 42 edges
6. `e()` - 39 edges
7. `A` - 38 edges
8. `Architecture` - 36 edges
9. `C` - 33 edges
10. `a()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Architecture` --references--> `shot()`  [INFERRED]
  elongo/CLAUDE.md → elongo/tests/e2e.mjs
- `Architecture` --references--> `to()`  [INFERRED]
  elongo/CLAUDE.md → elongo/tests/push.mjs
- `Architecture` --references--> `loginId()`  [INFERRED]
  elongo/CLAUDE.md → elongo/app.js
- `Architecture` --references--> `demoBackend()`  [INFERRED]
  elongo/CLAUDE.md → elongo/backend.js
- `Architecture` --references--> `remindRound()`  [INFERRED]
  elongo/CLAUDE.md → elongo/supabase/functions/push/index.ts

## Import Cycles
- None detected.

## Communities (34 total, 15 thin omitted)

### Community 0 - "app.js"
Cohesion: 0.06
Nodes (99): acceptCall(), activityEvents(), afterTontineGone(), allTopics(), applyTheme(), attach(), audit(), auditFor() (+91 more)

### Community 1 - "k"
Cohesion: 0.08
Nodes (5): I(), k(), P(), re, z()

### Community 2 - "De"
Cohesion: 0.10
Nodes (49): De(), ae(), ar(), at(), be(), ce(), cr(), de() (+41 more)

### Community 3 - "$"
Cohesion: 0.07
Nodes (16): $, E, F(), G(), _handleTokenChanged(), _initRealtimeClient(), _initSupabaseAuthClient(), L (+8 more)

### Community 4 - "B"
Cohesion: 0.11
Nodes (7): ASSETS, B(), i(), S(), T, v(), y

### Community 7 - "e2e.mjs"
Cohesion: 0.08
Nodes (17): code, csv, daysAgo(), detail, errors, filtered, iso(), manifest (+9 more)

### Community 8 - "e"
Cohesion: 0.20
Nodes (26): a(), b(), c(), ct(), dt(), e(), er(), et() (+18 more)

### Community 9 - "C"
Cohesion: 0.17
Nodes (4): C, n(), s(), then()

### Community 10 - "push.mjs"
Cohesion: 0.08
Nodes (17): authSecret, browser, call(), clear, deps(), dir, got, members (+9 more)

### Community 11 - "jspdf.umd.min.js"
Cohesion: 0.11
Nodes (16): b(), Be(), Ct(), d(), a(), d(), f(), jt() (+8 more)

### Community 12 - "jspdf.plugin.autotable.min.js"
Cohesion: 0.26
Nodes (18): c(), d(), e(), f(), g(), h(), i(), l() (+10 more)

### Community 13 - "T"
Cohesion: 0.18
Nodes (19): C(), br(), bt(), ft(), gt(), hr(), mt(), nt() (+11 more)

### Community 15 - ".push"
Cohesion: 0.15
Nodes (11): Ce qui est vérifié, et ce qui ne l'est pas, Droits, Elongo, Fonctionnalités, Lancer, Mettre en place le serveur (Supabase), Notifications push (versements, messages, rappels), delete() (+3 more)

### Community 16 - "wt"
Cohesion: 0.25
Nodes (14): g(), k(), kt(), m(), p(), qt(), rt(), w() (+6 more)

### Community 18 - "index.ts"
Cohesion: 0.35
Nodes (9): addDays(), clip(), CORS, dayDiff(), deliver(), fmt(), handle(), reminders() (+1 more)

### Community 19 - "package.json"
Cohesion: 0.17
Nodes (11): description, devDependencies, http_ece, playwright, web-push, name, private, type (+3 more)

### Community 20 - "Ee"
Cohesion: 0.21
Nodes (11): j(), mr(), qr(), Ee(), B(), E(), M(), O() (+3 more)

### Community 22 - "CLAUDE.md"
Cohesion: 0.22
Nodes (6): demoBackend(), supabaseBackend(), Commandes, Conventions, Points d'attention, Projet

### Community 24 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, icons, start, test, test:push, test:sql

## Knowledge Gaps
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Architecture` connect `app.js` to `B`, `e2e.mjs`, `C`, `push.mjs`, `.push`, `index.ts`, `CLAUDE.md`?**
  _High betweenness centrality (0.435) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `De()` (e.g. with `kr()` and `xr()`) actually correct?**
  _`De()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.057464569986410405 - nodes in this community are weakly interconnected._
- **Why does `$` connect `$` to `k`, `B`, `n`, `A`, `C`, `.push`, `j`, `h`, `U`?**
  _High betweenness centrality (0.265) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `m()` (e.g. with `e()` and `i()`) actually correct?**
  _`m()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `k` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Why does `ee()` connect `De` to `k`?**
  _High betweenness centrality (0.258) - this node is a cross-community bridge._