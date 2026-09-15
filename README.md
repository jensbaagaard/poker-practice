# Open Range Viewer

An open-source preflop range viewer for No-Limit Hold'em, built with Next.js and
ready to deploy on Vercel.

Pick a scenario (open, vs raise, vs 3-bet, vs 4-bet, vs 5-bet), a hero seat and a
villain seat, and the 13×13 grid shows which hands raise, call or fold. Settings
live in the URL so any view can be shared as a link.

## Features

- 6-, 8- and 9-handed tables
- Cash at 100bb with four range types: PTO (one action per hand), Simple (fewer
  charts), Pro (50/50 mixes), GTO (mixed frequencies, solved for 2, 2.5 or 3bb opens)
- MTT at 100, 40, 20, 10 and 5bb with PTO and GTO charts
- Bet sizes follow the sizing profile each set was solved for, including all-in
  3-bets and 4-bets at short stacks
- Table diagram showing seats, blinds, dealer button and bets
- Two colour themes
- **Your ranges**: paste your own charts as JSON, stored in your browser
- **Play** (`/play`): play a hand against opponents who follow the charts. Every
  seat is dealt cards, opponents act in turn (one second each) from the selected
  preflop charts, and whenever the action reaches you, you choose raise, call or
  fold. Heads-up single-raised pots continue onto a solved flop: the board is drawn
  from a weighted 25-flop subset and both players act from a TexasSolver strategy
  (check, bet 33%, raise, all-in, call, fold). Each decision is graded against the
  chart or solver, and the full range or flop strategy is shown afterwards. Only the
  previous raiser has a chart for facing a re-raise, so everyone else folds to a
  3-bet. Keys `R`, `C`, `F` (and `X`, `B`, `A` on the flop) answer; `Enter` continues.

## Getting started

```bash
npm install
npm run build:ranges   # generate public/ranges/*.json from data/openSourcePokerData
npm run dev            # http://localhost:3000
npm test
npm run build          # runs build:ranges first when the data folder is present
```

Deploy by importing the repository on Vercel. No configuration is needed: the
build regenerates `public/ranges/` from `data/openSourcePokerData/` and serves
the files as static assets.

## Range data

Built-in charts are generated, not hand-written. `scripts/build-ranges.mjs` reads
the range sets in `data/openSourcePokerData/` (one file per set, laid out as
`{ "<scenarioKey>": { "<hand>": frequency } }` with keys such as `OpenBTN`,
`3BetSBvsLJ`, `Call 3BetLJvsBB`) and writes one file per set to
`public/ranges/<setId>.json`. The viewer fetches only the set that matches the
chosen format, stack, range type and open size.

| Set id                          | Selected by                    |
| ------------------------------- | ------------------------------ |
| `Cash_100_PTO` / `Simple` / `PRO` | Cash, 100bb, that range type   |
| `Cash_100_GTO`, `_2bb`, `_3bb`  | Cash, 100bb, GTO, open size    |
| `MTT_<stack>_PTO` / `_GTO`      | MTT, stack 100/40/20/10/5      |

For spots after the open (vs 3-bet and later) frequencies are divided by the
previous node, so a chart reads "given we reached this spot". Short-stack sets
omit nodes that do not exist at that depth (there is no 5-bet after an all-in
4-bet); the viewer greys those scenarios out.

Both the source data and the generated files are committed, so a fresh clone
works without running the generator. Edit the source files and run
`npm run build:ranges` to update the viewer; the tests check the generated output.

## Chart format

Each generated file is a JSON array of entries, the same format **Your ranges**
accepts:

```json
{
  "id": "Cash_100_PTO-vs-raise-BB-vs-BTN",
  "scenario": "vs-raise",
  "rangeTypes": ["pto"],
  "formats": ["cash"],
  "stacks": [100],
  "hero": ["BB"],
  "villain": ["BTN"],
  "range": { "raise": "TT+, AQs+, A5s-A4s, AKo", "call": "22-99, A2s+, ..." }
}
```

`players`, `stacks`, `openSizes` and `formats` are optional filters; a missing
filter matches everything (except `formats`, which defaults to cash).

Range notation:

| Token        | Meaning                              |
| ------------ | ------------------------------------ |
| `22+`        | every pair from 22 up                |
| `77-TT`      | 77, 88, 99, TT                       |
| `A2s+`       | A2s through AKs                      |
| `K9s+`       | K9s through KQs                      |
| `A5s-A2s`    | A5s, A4s, A3s, A2s                   |
| `T9s-54s`    | suited connectors from T9s down      |
| `ATo+`       | offsuit ATo through AKo              |
| `AK`         | both AKs and AKo                     |
| `A5s:0.5`    | A5s at 50% frequency                 |

Fold is whatever is left. When a user-authored set has no chart for the selected
range type or format the viewer falls back to PTO or cash and says so under the
grid.

The test suite checks that every generated set is valid and tagged with its own
setup, that every 100bb set covers every hero/villain combination for every table
size, and that every set covers opening and facing a raise.

## License

MIT. The range data in `data/openSourcePokerData/` is free to use; its layout
and the scenario keys are documented in `data/openSourcePokerData/README.md`.

## Postflop data

Flop strategies live in `public/postflop/<spotId>/<board>.json` with an index in
`public/postflop/index.json`. They are generated offline with
[TexasSolver](https://github.com/bupticybee/TexasSolver) (AGPL, run as a separate
program; its output is data, the app never links its code):

```bash
node scripts/flop-subset.mjs 25 > data/postflop/flops-25.json   # weighted flop subset (deterministic, ~90s)
TEXASSOLVER_BIN=/path/to/console_solver node scripts/solve-postflop.mjs [--spots srp-BTN-BB] [--flops 5] [--iterations 120]
```

`scripts/postflop-spots.mjs` derives the spots from the Cash 100bb PTO charts (every
opener/caller pair with a calling range) and defines the bet-size tree: a single 33%
flop bet, 50% raises and all-in, then 50% bets on the turn and river. One flop takes
one to two minutes on an Apple Silicon laptop and converges to about 2–3% of the pot;
the script resumes where it stopped and rewrites the index after every solve.

Building the TexasSolver console on macOS (Apple clang has no OpenMP; the bundled
pybind11 does not work with Python 3.12+):

```bash
brew install cmake libomp
git clone --branch console https://github.com/bupticybee/TexasSolver && cd TexasSolver
sed -i '' 's|^add_subdirectory(ext/pybind11)|#&|' CMakeLists.txt
sed -i '' 's|^target_link_libraries(console_solver TexasSolver)|target_link_libraries(console_solver TexasSolver ${OpenMP_omp_LIBRARY})|' CMakeLists.txt
OMP=$(brew --prefix libomp); mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DOpenMP_CXX_FLAGS="-Xpreprocessor -fopenmp -I$OMP/include" -DOpenMP_CXX_LIB_NAMES=omp \
  -DOpenMP_C_FLAGS="-Xpreprocessor -fopenmp -I$OMP/include" -DOpenMP_C_LIB_NAMES=omp \
  -DOpenMP_omp_LIBRARY="$OMP/lib/libomp.dylib"
make -j8 console_solver && cp console_solver ..    # run it from the repo root: it reads ./resources
```
