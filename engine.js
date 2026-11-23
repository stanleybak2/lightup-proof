// Light Up proof engine. No DOM here: puzzle model, the three base rules as
// cardinality constraints, and a Fitch-style proof (steps, assumptions, cases).
(function (global) {
  'use strict';
  const INF = 99;

  // ---------- puzzle model ----------
  function parse(def) {
    const grid = def.grid, h = grid.length, w = grid[0].length;
    const P = { id: def.id, title: def.title, level: def.level, h, w, grid,
      white: [], nums: [], hseg: {}, vseg: {}, vis: {}, nbrs: {} };
    const isW = (r, c) => r >= 0 && c >= 0 && r < h && c < w && grid[r][c] === '.';
    P.isWhite = id => isW(Math.floor(id / w), id % w);
    P.numAt = id => { const ch = grid[Math.floor(id / w)][id % w]; return ch >= '0' && ch <= '4' ? +ch : null; };
    P.cn = id => String.fromCharCode(65 + (id % w)) + (Math.floor(id / w) + 1);
    const run = (r, c, dr, dc) => { const o = []; r += dr; c += dc; while (isW(r, c)) { o.push(r * w + c); r += dr; c += dc; } return o; };
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const id = r * w + c;
      if (isW(r, c)) {
        P.white.push(id);
        P.hseg[id] = [...run(r, c, 0, -1).reverse(), id, ...run(r, c, 0, 1)];
        P.vseg[id] = [...run(r, c, -1, 0).reverse(), id, ...run(r, c, 1, 0)];
        P.vis[id] = [...P.hseg[id], ...P.vseg[id]].filter(x => x !== id);
      } else if (P.numAt(id) !== null) {
        P.nums.push(id);
        P.nbrs[id] = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => isW(r + d[0], c + d[1])).map(d => (r + d[0]) * w + c + d[1]);
      }
    }
    return P;
  }

  // An anchor is the clue the student clicked: {t:'N'|'L'|'B', cell}.
  //   N: numbered wall  -> exactly k bulbs among its neighbours
  //   L: white cell     -> at least one bulb among the cells that light it
  //   B: bulb           -> at most one bulb in its row segment / column segment
  function constraints(P, a) {
    if (a.t === 'N') { const k = P.numAt(a.cell); return [{ S: P.nbrs[a.cell], lo: k, hi: k }]; }
    if (a.t === 'L') return [{ S: [a.cell, ...P.vis[a.cell]], lo: 1, hi: INF }];
    const out = [];
    if (P.hseg[a.cell].length > 1) out.push({ S: P.hseg[a.cell], lo: 0, hi: 1 });
    if (P.vseg[a.cell].length > 1) out.push({ S: P.vseg[a.cell], lo: 0, hi: 1 });
    return out;
  }
  function anchorOk(P, a, f) {
    if (!a) return false;
    if (a.t === 'N') return P.numAt(a.cell) !== null;
    if (a.t === 'L') return P.isWhite(a.cell);
    return P.isWhite(a.cell) && f.has(a.cell) && f.get(a.cell).val === 1;
  }
  function scope(P, a) { const s = new Set(); constraints(P, a).forEach(c => c.S.forEach(x => s.add(x))); return s; }
  function anchorText(P, a) {
    if (a.t === 'N') return 'the ' + P.numAt(a.cell) + ' at ' + P.cn(a.cell);
    if (a.t === 'L') return P.cn(a.cell) + ' must be lit';
    return 'the bulb at ' + P.cn(a.cell);
  }
  function tally(con, f) {
    let b = 0; const u = [];
    for (const c of con.S) { const v = f.get(c); if (!v) u.push(c); else if (v.val === 1) b++; }
    return { b, u };
  }
  const plural = (n, s) => n + ' ' + s + (n === 1 ? '' : 's');
  const fail = msg => ({ ok: false, msg });
  const newBlock = (kind, assume) => ({ kind, assume: assume || null, items: [], closed: null });

  // ---------- proof ----------
  // block: {kind:'root'|'suppose'|'case', assume:{cell,val}|null, items:[], closed:null|{anchor}|{byCases:true}}
  // items: {type:'step', anchor, val, cells:[]}
  //        {type:'suppose', block}                       closed block => assumed cell has the opposite value
  //        {type:'cases', src, branches:[block], sel, ended, exports:[{cell,val}]}
  class Proof {
    constructor(P) { this.P = P; this.root = newBlock('root'); this.hist = []; }
    snap() { this.hist.push(JSON.stringify(this.root)); }
    undo() { if (!this.hist.length) return fail('Nothing to undo.'); this.root = JSON.parse(this.hist.pop()); return { ok: true }; }

    // Blocks from the root down to the one that new steps go into.
    path() {
      const p = [this.root]; let b = this.root;
      for (;;) {
        const it = b.items[b.items.length - 1];
        if (!it) break;
        if (it.type === 'suppose' && !it.block.closed) b = it.block;
        else if (it.type === 'cases' && !it.ended) b = it.branches[it.sel];
        else break;
        p.push(b);
        if (b.closed) break;
      }
      return p;
    }
    // Everything known at the end of the given path: cell -> {val, depth, assumed}.
    facts(path) {
      path = path || this.path();
      const f = new Map();
      path.forEach((b, d) => {
        if (b.assume) f.set(b.assume.cell, { val: b.assume.val, depth: d, assumed: true });
        for (const it of b.items) {
          if (it.type === 'step') it.cells.forEach(c => f.set(c, { val: it.val, depth: d }));
          else if (it.type === 'suppose' && it.block.closed) f.set(it.block.assume.cell, { val: 1 - it.block.assume.val, depth: d });
          else if (it.type === 'cases' && it.ended) it.exports.forEach(e => f.set(e.cell, { val: e.val, depth: d }));
        }
      });
      return f;
    }
    lit(f) {
      const s = new Set();
      for (const [c, v] of f) if (v.val === 1) { s.add(c); this.P.vis[c].forEach(x => s.add(x)); }
      return s;
    }
    _open(path) {
      const blk = path[path.length - 1];
      return blk.closed ? null : blk;
    }
    forcedBy(a, f) {
      f = f || this.facts();
      if (!anchorOk(this.P, a, f)) return [];
      const out = [], seen = new Set();
      for (const con of constraints(this.P, a)) {
        const t = tally(con, f);
        if (!t.u.length || t.b > con.hi || t.b + t.u.length < con.lo) continue;
        const val = t.b === con.hi ? 0 : (t.b + t.u.length === con.lo ? 1 : null);
        if (val !== null) t.u.forEach(c => { if (!seen.has(c)) { seen.add(c); out.push({ cell: c, val }); } });
      }
      return out;
    }
    isBroken(a, f) {
      f = f || this.facts();
      if (!anchorOk(this.P, a, f)) return false;
      return constraints(this.P, a).some(con => { const t = tally(con, f); return t.b > con.hi || t.b + t.u.length < con.lo; });
    }

    // A direct step: `cell` gets `val` because the cited rule alone forces it.
    tryStep(a, cell, val, noSnap) {
      const P = this.P, path = this.path(), blk = this._open(path);
      if (!blk) return fail('This case is already closed by a contradiction. Click another case, or end the cases.');
      const f = this.facts(path);
      if (!P.isWhite(cell)) return fail('Only white cells can be marked.');
      if (f.has(cell)) return fail(P.cn(cell) + ' is already decided.');
      if (!anchorOk(P, a, f)) return fail('That clue cannot be cited here.');
      let inScope = false, ok = false;
      for (const con of constraints(P, a)) {
        if (!con.S.includes(cell)) continue;
        inScope = true;
        const t = tally(con, f);
        if (val === 0 && t.b === con.hi) ok = true;
        if (val === 1 && t.b + t.u.length === con.lo) ok = true;
      }
      if (!inScope) return fail(P.cn(cell) + ' is not one of the cells this rule talks about.');
      if (!ok) return fail(this._explain(a, f, val));
      if (!noSnap) this.snap();
      const last = blk.items[blk.items.length - 1];
      if (last && last.type === 'step' && last.val === val && last.anchor.t === a.t && last.anchor.cell === a.cell) last.cells.push(cell);
      else blk.items.push({ type: 'step', anchor: { t: a.t, cell: a.cell }, val, cells: [cell] });
      return { ok: true };
    }
    // Apply one cited rule to every cell it forces (used for "a bulb empties all it sees").
    stepAll(a) {
      const forced = this.forcedBy(a);
      if (!forced.length) return fail('This rule does not force any cell right now.');
      this.snap();
      for (const m of forced) this.tryStep(a, m.cell, m.val, true);
      return { ok: true, n: forced.length };
    }
    _explain(a, f, val) {
      const P = this.P, want = val === 1 ? 'a bulb' : 'empty';
      if (a.t === 'B') return val === 1 ? 'A bulb can only force the cells it sees to be empty, never to be a bulb.'
        : 'This rule does not force that.';
      const con = constraints(P, a)[0], t = tally(con, f);
      if (a.t === 'N') {
        const k = con.lo, head = 'The ' + k + ' at ' + P.cn(a.cell) + ' has ' + plural(t.b, 'bulb') + ' and ' + plural(t.u.length, 'undecided neighbour') + '. ';
        if (t.b > k || t.b + t.u.length < k) return head + 'The rule is already broken, so it cannot justify a step.';
        if (t.b === k) return head + 'It is full, so the rest must be empty, not ' + want + '.';
        if (t.b + t.u.length === k) return head + 'It needs all of them, so they must be bulbs, not ' + want + '.';
        return head + 'It still needs ' + (k - t.b) + ', so no single neighbour is forced yet.';
      }
      if (val === 0) return 'The rule "' + P.cn(a.cell) + ' must be lit" can only ever force a bulb, never an empty cell.';
      if (t.b > 0) return P.cn(a.cell) + ' is already lit, so this rule forces nothing more.';
      if (t.u.length === 0) return 'Nothing can light ' + P.cn(a.cell) + ' any more: the rule is broken.';
      return P.cn(a.cell) + ' could still be lit from ' + plural(t.u.length, 'undecided cell') + ', so none of them is forced yet.';
    }

    // Assumption box: suppose `cell` is `val`; closing it with a contradiction proves the opposite.
    suppose(cell, val) {
      const P = this.P, path = this.path(), blk = this._open(path);
      if (!blk) return fail('This case is already closed. Click another case, or end the cases.');
      if (!P.isWhite(cell) || this.facts(path).has(cell)) return fail('Pick an undecided white cell to make an assumption about.');
      this.snap();
      blk.items.push({ type: 'suppose', block: newBlock('suppose', { cell, val }) });
      return { ok: true };
    }
    _addCases(blk, src, assumes) {
      this.snap();
      blk.items.push({ type: 'cases', src, sel: 0, ended: false, exports: [], branches: assumes.map(a => newBlock('case', a)) });
      return { ok: true };
    }
    // Cases on one cell: it is a bulb, or it is empty.
    casesCell(cell) {
      const P = this.P, path = this.path(), blk = this._open(path);
      if (!blk) return fail('This case is already closed. Click another case, or end the cases.');
      if (!P.isWhite(cell) || this.facts(path).has(cell)) return fail('Pick an undecided white cell to split on.');
      return this._addCases(blk, { cell }, [{ cell, val: 1 }, { cell, val: 0 }]);
    }
    // Cases from a rule that still needs a bulb: "at least one of these undecided cells is a bulb".
    casesAnchor(a) {
      const P = this.P, path = this.path(), blk = this._open(path);
      if (!blk) return fail('This case is already closed. Click another case, or end the cases.');
      const f = this.facts(path);
      if (!anchorOk(P, a, f)) return fail('That clue cannot be cited here.');
      for (const con of constraints(P, a)) {
        const t = tally(con, f);
        if (t.b > con.hi || t.b + t.u.length < con.lo) return fail('This rule is already broken; declare the contradiction instead.');
        if (t.b < con.lo) {
          if (t.u.length < 2) return fail('Only one cell is left for this rule, so that is a direct step, not a choice.');
          if (t.b + t.u.length === con.lo) return fail('This rule needs all of its undecided cells, so that is a direct step, not a choice.');
          return this._addCases(blk, { anchor: { t: a.t, cell: a.cell } }, t.u.map(c => ({ cell: c, val: 1 })));
        }
      }
      return fail('This rule does not leave a choice between cells right now.');
    }
    // Cite a broken rule to close the current assumption or case.
    contradiction(a) {
      const P = this.P, path = this.path(), blk = this._open(path);
      if (!blk) return fail('This case is already closed.');
      const f = this.facts(path);
      if (!anchorOk(P, a, f)) return fail('That clue cannot be cited here.');
      if (!this.isBroken(a, f)) return fail(this._notBroken(a, f));
      if (path.length === 1) return fail('There is no assumption to contradict here.');
      this.snap();
      blk.closed = { anchor: { t: a.t, cell: a.cell } };
      this._afterClose(path);
      return { ok: true };
    }
    _notBroken(a, f) {
      const P = this.P;
      if (a.t === 'B') return 'The bulb at ' + P.cn(a.cell) + ' does not see another bulb, so this rule is not broken.';
      const con = constraints(P, a)[0], t = tally(con, f);
      if (a.t === 'N') return 'The ' + con.lo + ' at ' + P.cn(a.cell) + ' has ' + plural(t.b, 'bulb') + ' and ' + plural(t.u.length, 'undecided neighbour') + ', so it can still come out right.';
      return t.b > 0 ? P.cn(a.cell) + ' is lit, so this rule is not broken.'
        : P.cn(a.cell) + ' can still be lit from ' + plural(t.u.length, 'undecided cell') + ', so this rule is not broken.';
    }
    _afterClose(path) {
      if (path.length < 2) return;
      const parent = path[path.length - 2], item = parent.items[parent.items.length - 1];
      if (item.type !== 'cases') return;
      const open = item.branches.findIndex(b => !b.closed);
      if (open >= 0) { item.sel = open; return; }
      // Every case failed: that is a contradiction for the enclosing block.
      item.ended = true; item.exports = [];
      if (path.length > 2) { parent.closed = { byCases: true }; this._afterClose(path.slice(0, -1)); }
    }
    _innerCases(path) {
      for (let i = path.length - 1; i >= 1; i--) {
        const item = path[i - 1].items[path[i - 1].items.length - 1];
        if (item.type === 'cases' && !item.ended) return { i, item };
      }
      return null;
    }
    inCases() { return !!this._innerCases(this.path()); }
    // Close a case split: whatever holds in every surviving case holds outside it.
    endCases() {
      const P = this.P, path = this.path(), found = this._innerCases(path);
      if (!found) return fail('There is no open case split to end.');
      const { i, item } = found, parentPath = path.slice(0, i);
      for (let k = 0; k < item.branches.length; k++) {
        const br = item.branches[k], last = br.items[br.items.length - 1];
        if (!br.closed && last && ((last.type === 'suppose' && !last.block.closed) || (last.type === 'cases' && !last.ended)))
          return fail('Case ' + (k + 1) + ' still has an open assumption or case split inside it. Finish or discard that first.');
      }
      const live = item.branches.filter(b => !b.closed);
      if (!live.length) return fail('Every case is closed already.');
      const pf = this.facts(parentPath);
      let common = null;
      for (const br of live) {
        const bf = this.facts([...parentPath, br]), m = new Map();
        for (const [c, v] of bf) if (!pf.has(c)) m.set(c, v.val);
        if (common === null) common = m;
        else for (const [c, v] of [...common]) if (m.get(c) !== v) common.delete(c);
      }
      if (!common.size) return fail('No cell has the same value in every open case yet. Keep deducing inside the cases.');
      this.snap();
      item.ended = true;
      item.exports = [...common].sort((x, y) => x[0] - y[0]).map(([cell, val]) => ({ cell, val }));
      return { ok: true, n: item.exports.length, survivors: live.length };
    }
    // Throw away the innermost open assumption or case split.
    discard() {
      const path = this.path();
      if (path.length < 2) return fail('There is no open assumption or case split to discard.');
      this.snap();
      path[path.length - 2].items.pop();
      return { ok: true };
    }
    // Make `target` (an open assumption or case) the block that receives new steps.
    select(target) {
      const dfs = b => {
        if (b === target) return true;
        const it = b.items[b.items.length - 1];
        if (!it) return false;
        if (it.type === 'suppose' && !it.block.closed) return dfs(it.block);
        if (it.type === 'cases' && !it.ended)
          for (let k = 0; k < it.branches.length; k++) if (dfs(it.branches[k])) { it.sel = k; return true; }
        return false;
      };
      return dfs(this.root);
    }
    solved() {
      const P = this.P, path = this.path();
      if (path.length !== 1) return false;
      const f = this.facts(path), lit = this.lit(f);
      const bulb = c => f.has(c) && f.get(c).val === 1;
      if (!P.nums.every(n => P.nbrs[n].filter(bulb).length === P.numAt(n))) return false;
      return P.white.every(c => lit.has(c) && !(bulb(c) && P.vis[c].some(bulb)));
    }
  }

  global.LU = { parse, constraints, anchorOk, anchorText, scope, tally, Proof, INF };
})(typeof window !== 'undefined' ? window : globalThis);
