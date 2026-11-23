// Interface for the Light Up proof prototype. All logic lives in engine.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let P, proof, anchor = null, mode = 'deduce', mark = 1, msg = null, wasSolved = false;

  // Fireworks on a canvas over the page, for a few seconds after a puzzle is solved.
  function celebrate() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('fx'), ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
    const W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
    const colors = ['#f2a900', '#ff5a5f', '#4cc9f0', '#7ae582', '#c77dff', '#ffffff'];
    let parts = [], rockets = [], launched = 0, last = performance.now();
    const launch = () => rockets.push({ x: W * (0.15 + 0.7 * Math.random()), y: H, vy: -H * (0.55 + 0.25 * Math.random()), top: H * (0.15 + 0.3 * Math.random()), c: colors[launched++ % colors.length] });
    const burst = r => { for (let i = 0; i < 70; i++) { const a = Math.random() * 6.283, s = (60 + Math.random() * 240) * dpr; parts.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: Math.random() < 0.2 ? '#ffffff' : r.c }); } };
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (launched < 9 && Math.random() < dt * 3.5) launch();
      ctx.clearRect(0, 0, W, H);
      rockets = rockets.filter(r => { r.y += r.vy * dt; ctx.fillStyle = r.c; ctx.fillRect(r.x - dpr, r.y, 2 * dpr, 10 * dpr); if (r.y <= r.top) { burst(r); return false; } return true; });
      parts = parts.filter(p => { p.vy += 220 * dpr * dt; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.7;
        if (p.life <= 0) return false; ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * dpr, 0, 6.283); ctx.fill(); return true; });
      ctx.globalAlpha = 1;
      if (launched < 9 || rockets.length || parts.length) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
    };
    launch(); requestAnimationFrame(tick);
  }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const valWord = (v, n) => v === 1 ? (n > 1 ? 'are bulbs' : 'is a bulb') : (n > 1 ? 'are empty' : 'is empty');
  const names = cells => cells.map(P.cn).join(', ');
  const say = (text, kind) => { msg = text ? { text, kind: kind || 'err' } : null; };

  // Progress is kept in this browser's localStorage, one saved proof per puzzle, so a reload resumes it.
  const KEY = 'lightup-proof:v1';
  const readSaved = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  function store() {
    try {
      const all = readSaved(); all.last = P.id; all.p = all.p || {};
      if (proof.root.items.length || proof.hist.length) all.p[P.id] = { root: proof.root, hist: proof.hist.slice(-300) };
      else delete all.p[P.id];
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) { /* storage unavailable: play on without saving */ }
  }
  function load(i, fresh) {
    P = LU.parse(PUZZLES[i]); proof = new LU.Proof(P);
    const saved = (readSaved().p || {})[P.id];
    if (saved && !fresh) { proof.root = saved.root; proof.hist = saved.hist || []; }
    anchor = null; mode = 'deduce'; msg = saved && !fresh ? { text: 'Picked up where you left off. Restart clears this puzzle.', kind: 'ok' } : null;
    window.LUI = { P, proof };   // handy for poking at state from the console
    wasSolved = proof.solved();  // no fireworks for a puzzle that was already solved when it was opened
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
    } else if (f.has(id) && f.get(id).val === 1) {
      anchor = null; say('A bulb already rules out every cell it shines on, so there is nothing to cite here.', 'ok');
    } else {
      anchor = { t: 'L', cell: id };
    }
    render();
  }
  const act = (fn, okText) => () => { say(null); if (report(fn(), typeof okText === 'function' ? null : okText)) { if (typeof okText === 'function') okText(); } render(); };

  // ---------- board ----------
  function renderBoard(f) {
    // Leave about half the width for the proof, which sits to the right of the board.
    const room = innerWidth <= 520 ? innerWidth - 60 : innerWidth * 0.5 - 50;
    const b = $('board'), sz = Math.max(20, Math.min(54, Math.floor(Math.min(480, room) / P.w)));
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
            if (v.val === 1) d.appendChild(el('span', 'bulb')); else if (!v.auto) d.appendChild(el('span', 'x', '×'));
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
    if (!anchor) { h.appendChild(el('div', 'rule', 'Click a clue to cite it as your reason: a number, or any white cell (it must be lit).')); return; }
    let text;
    if (anchor.t === 'N') text = 'Rule: exactly ' + P.numAt(anchor.cell) + ' of the outlined cells ' + (P.numAt(anchor.cell) === 1 ? 'is a bulb.' : 'are bulbs.');
    else if (anchor.t === 'L') text = 'Rule: ' + P.cn(anchor.cell) + ' must be lit, so at least one outlined cell is a bulb.';
    else text = 'Rule: the bulb at ' + P.cn(anchor.cell) + ' must not shine on another bulb, so no other outlined cell is a bulb.';
    h.appendChild(el('div', 'rule', text));
    h.appendChild(el('div', null, 'Now mark an outlined cell that this rule forces.'));
    const acts = el('div', 'acts');
    const btn = (label, fn) => { const x = el('button', null, label); x.onclick = fn; acts.appendChild(x); };
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
    const solvedNow = proof.solved();
    $('solved').style.display = solvedNow ? 'block' : 'none';
    if (solvedNow && !wasSolved) celebrate();
    wasSolved = solvedNow;
    store();
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
  $('restart').onclick = () => load($('pick').selectedIndex, true);
  // Everything needed to reproduce the current situation, as text that can be pasted to someone else.
  function stateText() {
    const f = proof.facts(), rows = [];
    for (let r = 0; r < P.h; r++) {
      let s = '';
      for (let c = 0; c < P.w; c++) { const id = r * P.w + c, v = f.get(id); s += !P.isWhite(id) ? P.grid[r][c] : !v ? '.' : v.val === 1 ? 'B' : v.auto ? '~' : 'x'; }
      rows.push(s);
    }
    return JSON.stringify({ puzzle: P.id, title: P.title, board: rows, legend: 'B bulb, x marked empty, ~ lit so empty, . undecided',
      cited: anchor ? LU.anchorText(P, anchor) : null, message: msg ? msg.text : null, proof: proof.root }, null, 1);
  }
  $('copystate').onclick = () => {
    const text = stateText();
    const done = () => { say('State copied. Paste it into a message to report a problem.', 'ok'); render(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy this:', text));
    else window.prompt('Copy this:', text);
  };
  window.LUstate = stateText;
  window.addEventListener('resize', () => render());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { anchor = null; mode = 'deduce'; say(null); render(); } });
  const pick = $('pick');
  PUZZLES.forEach((p, i) => { const o = el('option', null, p.title); o.value = i; pick.appendChild(o); });
  pick.onchange = () => load(pick.selectedIndex);
  const lastIdx = Math.max(0, PUZZLES.findIndex(p => p.id === readSaved().last));
  pick.selectedIndex = lastIdx;
  load(lastIdx);
})();
