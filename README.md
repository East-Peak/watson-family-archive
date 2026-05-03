# Watson Family Archive

A read-only public snapshot of the Watson family tree, built from a private research dataset. The archive contains **1,552 ancestors** going back to ~1597 across the United States, Canada, the United Kingdom, France, and Germany. Living and recent relatives are not included; see the [methodology](#methodology) below for the cutoff rules.

This repo is the data **plus** the visualization app — clone it, point it at a local Neo4j, and you can browse the tree, the 3D globe with migration arcs, and the per-person bio pages.

## What you can do with it

- **Globe view**: 3D Cesium globe with one arc per migration event. Watch the family move from England to colonial Massachusetts in the 1600s, from Quebec to New England in the 1800s, from Pennsylvania to Illinois to California across the 19th and 20th centuries.
- **Tree view**: family-chart visualization that scales to thousands of nodes. Couples are first-class units, descendant lines are easy to follow.
- **Person pages**: each ancestor has a structured frontmatter record (name, dates, places, relationships, sources) plus place-context metadata (Wikipedia summaries, geo-coords, Wikimedia images for the places they lived).
- **Search and filter**: by surname, by location, by date range, by ancestral line.
- **Optional AI chat**: if you set `ANTHROPIC_API_KEY` locally, you can ask natural-language questions over the tree.

## How to run it locally

You need:

- Node 20+
- A local Neo4j (Community Edition is fine, free)

```bash
# 1. Clone
git clone https://github.com/East-Peak/watson-family-archive
cd watson-family-archive

# 2. Start Neo4j locally. The default config in this repo expects:
#      uri: bolt://localhost:7687
#      user: neo4j
#      pass: localdev
#    Easiest way:
#      brew install neo4j
#      neo4j-admin database set-password localdev   # set initial password
#      neo4j start
#    Or use Docker / Neo4j Desktop / your favorite installer.

# 3. Install
cd app
cp .env.example .env.local       # then edit .env.local if your Neo4j config differs
npm install                      # postinstall copies Cesium assets

# 4. Load the data into Neo4j (one-time, ~30 seconds)
node scripts/rebuild-from-markdown.mjs --clear

# 5. Build and start
npm run build
npm start

# 6. Open http://localhost:3000
```

## Layout

```
data/
  verified_nodes/    # 1,552 person YAMLs (each = 1 ancestor)
  contextual_media/  # 925 per-person place-context JSON files
  places.json        # geocoded place dictionary (referenced places only)
  place-aliases.json # alias → canonical place mappings
  manifest.json      # build metadata: cutoff rules, counts, source commit

app/
  src/               # Next.js 16 app (React 19 + Tailwind v4)
  scripts/
    rebuild-from-markdown.mjs   # rebuilds Neo4j from YAML data
    copy-cesium-assets.mjs      # postinstall hook for Cesium runtime
    lib/                         # shared parsers and validators

docs/
  methodology.md     # how the public dataset was sanitized
```

## Methodology

This snapshot is produced by a one-way export pipeline that runs against a private research repo. The pipeline:

1. Filters source persons to `verified | partially_verified | deep_verified` status (skipping speculative stubs).
2. Applies a date cutoff: born before 1925 with confirmed death year, OR born before 1900, OR earliest source year before 1900.
3. Strips all biography body markdown and most frontmatter fields. Keeps `slug`, `name`, `sex`, `status`, `birth`, `death`, `burial`, `parents`, `spouses`, `children`, `siblings`, `occupations`, `religion`, `origin_country`, `sources` (with `collection`, `record_type`, `year`, `provider` only — no URLs).
4. Drops relationship references to non-eligible (living/recent) persons.
5. Sanitizes free-text place fields against a kinship-token stoplist and an excluded-name canonical-variant set.
6. Rebuilds `places.json` and `place-aliases.json` from referenced IDs only, with the same name-filter.
7. Audits every output file for kinship phrases, excluded-name variants, absolute paths, and forbidden literals before publish.

This snapshot intentionally omits: research notes, FamilySearch tree IDs, WikiTree IDs, Find A Grave memorial IDs, source URLs, person photos, the master GEDCOM, and source-document records. Those live in the private research repo and are not relicensed by this snapshot.

The pipeline source (Python + pytest, ~1700 lines, 130 tests) is in the private repo. See `docs/methodology.md` for the cutoff-rules contract that produced this specific snapshot.

## What's in scope vs out of scope

In this archive (this repo):
- ✅ The visualization app (Next.js + Cesium + family-chart)
- ✅ ~1,552 dead ancestors with structured records
- ✅ ~925 per-person place-context bundles
- ✅ ~578 geocoded places with Wikipedia/Wikimedia enrichment

Not in this archive:
- ❌ Living relatives (anyone tagged `living`, born ≥1925, or with research-only-after-1925 footprint)
- ❌ Family photos (separate curation pass; not in v1)
- ❌ Per-person biography prose (frontmatter-only ships in v1; bio markdown stays private)
- ❌ The pipeline that produced this snapshot (lives in the private research repo)
- ❌ The contribute / comment write paths (require a private GitHub backend)
- ❌ Auth / allowlist (this archive is public; the live private app at watsonfamilytree.com has auth)

## License

PolyForm Noncommercial 1.0. See [`LICENSE`](LICENSE). Public-record civic data is not relicensed by this notice; it remains in the public domain.

## Contact

Stuart Watson — <stuart@eastpeak.cc>
