# Light Up proofs

A small browser prototype for solving Light Up (Akari) puzzles as proofs: every mark has to be justified by one of the game's three rules.

It is an experiment in a different design for [LEGUP](https://github.com/Bram-Hub/LEGUP) (Logic Engine for Grid-Using Puzzles), the RPI project for teaching logic through grid puzzles.

## The idea

- **Only the base rules are axioms.** A numbered wall has exactly that many bulbs next to it; every white cell must be lit; no bulb may shine on another bulb. There is no catalogue of named derived rules.
- **You cite a rule by clicking its clue**: a number, or a white cell ("this cell must be lit"). Then you mark a cell, and the step is accepted only if that one rule forces it.
- **The third rule is automatic.** A cell a bulb shines on counts as empty without a step, since spelling that out each time was the most tedious part.
- **The proof is a list with nested boxes**, not a tree of board states:
  - *Suppose* opens an assumption. If a rule becomes impossible, cite it as broken; the box closes and the opposite is proved.
  - *Cases* opens side-by-side boxes, from a cell (bulb or empty) or from a rule (one case per cell that could be the bulb it needs). Ending the cases keeps what is true in every surviving case.

## Running it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8765
```

`tests.html` runs the engine checks in the browser.

## Files

- `engine.js`: puzzle model, the rules as counting constraints, and the proof structure. No DOM.
- `ui.js`, `index.html`: the interface.
- `puzzles.js`: 17 puzzles, each checked to have exactly one solution.
- `tests.js`, `tests.html`: engine tests.

## Puzzles and licence

The puzzles are converted from the sample Light Up files in the LEGUP repository (`puzzles files/lightup`), which is licensed under GPL-3.0. This project is therefore also released under GPL-3.0; see `LICENSE`.
