// Interface for the Light Up proof prototype. All logic lives in engine.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let P, proof, anchor = null, mode = 'deduce', mark = 1, msg = null;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const valWord = (v, n) => v === 1 ? (n > 1 ? 'are bulbs' : 'is a bulb') : (n > 1 ? 'are empty' : 'is empty');
  const names = cells => cells.map(P.cn).join(', ');
  const say = (text, kind) => { msg = text ? { text, kind: kind || 'err' } : null; };

  function load(i) {
    P = LU.parse(PUZZLES[i]); proof = new LU.Proof(P);
    anchor = null; mode = 'deduce'; msg = null;
    window.LUI = { P, proof };   // handy for poking at state from the console
    render();
  }

  // ---------- actions ----------
  function report(r, okText) { if (r.ok) say(okText || '', 'ok'); else say(r.msg, 'err'); return r.ok; }
  function onCell(id, val) {
    say(null);
    const f = proof.facts();
    if (mode === 'suppose') {
      report(proof.suppose(id, val), 'Assumption opened. Deduce inside it; if a rule becomes impossible, cite it as broken.');
      mode = 'deduce'; anchor = null;
    } else if (mode === 'split') {
      report(proof.casesCell(id), 'Two cases opened. Click a case to work in it.');
      mode = 'deduce'; anchor = null;
    } else if (anchor && P.isWhite(id) && !f.has(id) && LU.scope(P, anchor).has(id)) {
      report(proof.tryStep(anchor, id, val), P.cn(id) + ' ' + valWord(val, 1) + '.');
    } else if (anchor && anchor.cell === id) {
      anchor = null;
    } else if (P.numAt(id) !== null) {
      anchor = { t: 'N', cell: id };
    } else if (!P.isWhite(id)) {
      anchor = null; say('A wall without a number has no rule to cite.');
    } else {
      anchor = { t: f.has(id) && f.get(id).val === 1 ? 'B' : 'L', cell: id };
    }
    render();
  }
  const act = (fn, okText) => () => { say(null); if (report(fn(), typeof okText === 'function' ? null : okText)) { if (typeof okText === 'function') okText(); } render(); };

  // ---------- board ----------
  function renderBoard(f) {
    const b = $('board'), sz = Math.max(30, Math.min(54, Math.floor(480 / P.w)));
    b.style.setProperty('--sz', sz + 'px');
    b.style.gridTemplateColumns = '22px repeat(' + P.w + ', ' + sz + 'px)';
    b.textContent = '';
    const lit = proof.lit(f), sc = anchor ? LU.scope(P, anchor) : new Set();
    b.appendChild(el('div', 'lab'));
    for (let c = 0; c < P.w; c++) b.appendChild(el('div', 'lab', String.fromCharCode(65 + c)));
    for (let r = 0; r < P.h; r++) {
      b.appendChild(el('div', 'lab', r + 1));
      for (let c = 0; c < P.w; c++) {
        const id = r * P.w + c, d = el('div', 'cell');
        d.id = 'c' + id; d.dataset.id = id;
        if (!P.isWhite(id)) {
          d.classList.add('wall');
          if (P.numAt(id) !== null) { d.classList.add('num'); d.textContent = P.numAt(id); }
        } else {
          const v = f.get(id);
          if (lit.has(id)) d.classList.add('lit');
          if (v) {
            d.appendChild(v.val === 1 ? el('span', 'bulb') : el('span', 'x', '×'));
            if (v.depth > 0) d.classList.add('hyp');
            if (v.assumed) d.classList.add('assumed');
          }
          if (sc.has(id)) d.classList.add('scope');
        }
        if (anchor && anchor.cell === id) d.classList.add('anchor');
        b.appendChild(d);
      }
    }
  }

  // ---------- hint bar ----------
  function renderHint(f) {
    const h = $('hint'); h.textContent = '';
    const blk = proof.path().slice(-1)[0];
    if (blk.closed) { h.appendChild(el('div', 'rule', 'This case is closed by a contradiction. Click another case in the proof, or press "End cases".')); return; }
    if (mode === 'suppose') { h.appendChild(el('div', 'rule', 'Click an undecided cell to assume it is a bulb. Right-click to assume it is empty.')); return; }
    if (mode === 'split') { h.appendChild(el('div', 'rule', 'Click an undecided cell to split into two cases: it is a bulb, or it is empty.')); return; }
    if (!anchor) { h.appendChild(el('div', 'rule', 'Click a clue to cite it as your reason: a number, a bulb, or any white cell (it must be lit).')); return; }
    let text;
    if (anchor.t === 'N') text = 'Rule: exactly ' + P.numAt(anchor.cell) + ' of the outlined cells ' + (P.numAt(anchor.cell) === 1 ? 'is a bulb.' : 'are bulbs.');
    else if (anchor.t === 'L') text = 'Rule: ' + P.cn(anchor.cell) + ' must be lit, so at least one outlined cell is a bulb.';
    else text = 'Rule: the bulb at ' + P.cn(anchor.cell) + ' must not shine on another bulb, so no other outlined cell is a bulb.';
    h.appendChild(el('div', 'rule', text));
    h.appendChild(el('div', null, 'Now mark an outlined cell that this rule forces.'));
    const acts = el('div', 'acts');
    const btn = (label, fn) => { const x = el('button', null, label); x.onclick = fn; acts.appendChild(x); };
    if (anchor.t === 'B') btn('Mark every cell it sees as empty', act(() => proof.stepAll(anchor), 'Marked.'));
    btn('Cases from this rule', act(() => proof.casesAnchor(anchor), () => { anchor = null; say('Cases opened, one per cell that could be the bulb. Click a case to work in it.', 'ok'); }));
    btn('This rule is broken', act(() => proof.contradiction(anchor), () => { anchor = null; say('Contradiction accepted.', 'ok'); }));
    h.appendChild(acts);
  }

  // ---------- proof panel ----------
  function renderProof(path) {
    const root = $('proof'); root.textContent = '';
    let n = 0;
    const active = path[path.length - 1];
    const line = (text, why, cells) => {
      const d = el('div', 'ln'); d.appendChild(el('span', 'n', ++n + '.')); d.appendChild(el('span', null, text));
      if (why) d.appendChild(el('span', 'why', why));
      if (cells) { d.onmouseenter = () => cells.forEach(c => $('c' + c).classList.add('hl')); d.onmouseleave = () => cells.forEach(c => $('c' + c).classList.remove('hl')); }
      return d;
    };
    const brokenText = a => a.t === 'N' ? LU.anchorText(P, a) + ' can no longer have the right number of bulbs'
      : a.t === 'L' ? 'nothing can light ' + P.cn(a.cell) : LU.anchorText(P, a) + ' shines on another bulb';
    const closedLine = b => el('div', 'bot', 'Contradiction: ' + (b.closed.byCases ? 'every case failed' : brokenText(b.closed.anchor)));
    const box = (b, title) => {
      const d = el('div', 'box' + (b === active ? ' active' : '') + (b.closed ? ' dead' : ''));
      d.appendChild(el('div', 'head', title));
      block(b, d);
      if (b.closed) d.appendChild(closedLine(b));
      else if (!b.items.length) d.appendChild(el('div', 'empty', b === active ? 'Deduce here…' : 'Click to work in this case'));
      d.onclick = e => { e.stopPropagation(); if (proof.select(b)) { anchor = null; say(null); render(); } };
      return d;
    };
    function block(b, into) {
      for (const it of b.items) {
        if (it.type === 'step') {
          into.appendChild(line(names(it.cells) + ' ' + valWord(it.val, it.cells.length), LU.anchorText(P, it.anchor), it.cells));
        } else if (it.type === 'suppose') {
          const a = it.block.assume;
          into.appendChild(box(it.block, 'Suppose ' + P.cn(a.cell) + ' ' + valWord(a.val, 1)));
          if (it.block.closed) into.appendChild(line(P.cn(a.cell) + ' ' + valWord(1 - a.val, 1), 'the assumption led to a contradiction', [a.cell]));
        } else {
          const src = it.src.anchor ? LU.anchorText(P, it.src.anchor) + ', so one of these is a bulb' : P.cn(it.src.cell) + ' is a bulb or it is empty';
          into.appendChild(el('div', 'caseshead', 'Cases: ' + src));
          const row = el('div', 'branches');
          it.branches.forEach((br, k) => row.appendChild(box(br, 'Case ' + (k + 1) + ': ' + P.cn(br.assume.cell) + ' ' + valWord(br.assume.val, 1))));
          into.appendChild(row);
          if (it.ended) for (const v of [1, 0]) {
            const cells = it.exports.filter(e => e.val === v).map(e => e.cell);
            if (cells.length) into.appendChild(line(names(cells) + ' ' + valWord(v, cells.length), 'true in every surviving case', cells));
          }
        }
      }
    }
    block(proof.root, root);
    if (!proof.root.items.length) root.appendChild(el('div', 'empty', 'No steps yet. Click a clue on the board to start.'));
  }

  function render() {
    const path = proof.path(), f = proof.facts(path);
    if (anchor && !LU.anchorOk(P, anchor, f)) anchor = null;
    renderBoard(f); renderHint(f); renderProof(path);
    for (const m of ['deduce', 'suppose', 'split']) $('m-' + m).classList.toggle('on', mode === m);
    $('v-bulb').classList.toggle('on', mark === 1); $('v-empty').classList.toggle('on', mark === 0);
    $('undo').disabled = !proof.hist.length;
    $('endcases').disabled = !proof.inCases();
    $('discard').disabled = path.length < 2;
    const item = path.length > 1 ? path[path.length - 2].items.slice(-1)[0] : null;
    $('discard').textContent = item && item.type === 'cases' ? 'Discard cases' : 'Discard assumption';
    const m = $('msg'); m.textContent = msg ? msg.text : ''; m.className = msg ? msg.kind : '';
    $('solved').style.display = proof.solved() ? 'block' : 'none';
  }

  // ---------- wiring ----------
  const cellOf = e => { const d = e.target.closest('.cell'); return d ? +d.dataset.id : null; };
  $('board').addEventListener('click', e => { const id = cellOf(e); if (id !== null) onCell(id, mark); });
  $('board').addEventListener('contextmenu', e => { const id = cellOf(e); if (id !== null) { e.preventDefault(); onCell(id, 0); } });
  for (const m of ['deduce', 'suppose', 'split']) $('m-' + m).onclick = () => { mode = mode === m ? 'deduce' : m; anchor = null; say(null); render(); };
  $('v-bulb').onclick = () => { mark = 1; render(); };
  $('v-empty').onclick = () => { mark = 0; render(); };
  $('undo').onclick = act(() => proof.undo());
  $('discard').onclick = act(() => proof.discard(), 'Discarded.');
  $('endcases').onclick = () => {
    say(null);
    const r = proof.endCases();
    if (r.ok) say(r.survivors === 1 ? 'Only one case survived, so everything in it holds.' : (r.n === 1 ? 'Kept the 1 cell that agrees' : 'Kept the ' + r.n + ' cells that agree') + ' in every surviving case.', 'ok');
    else say(r.msg);
    render();
  };
  $('restart').onclick = () => load($('pick').selectedIndex);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { anchor = null; mode = 'deduce'; say(null); render(); } });
  const pick = $('pick');
  PUZZLES.forEach((p, i) => { const o = el('option', null, p.title); o.value = i; pick.appendChild(o); });
  pick.onchange = () => load(pick.selectedIndex);
  load(0);
})();
