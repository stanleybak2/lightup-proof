// Interface for the Light Up proof prototype. All logic lives in engine.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let P, proof, anchor = null, mode = 'deduce', mark = 1, msg = null, wasSolved = false;

  // Fireworks on a canvas over the page, for a few seconds after a puzzle is solved.
  function celebrate() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Capped resolution: a full-density canvas made each frame too slow on high-density screens.
    const cv = $('fx'), ctx = cv.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const stats = window.LUI.fx = { start: performance.now(), frames: 0, firstBurst: null, end: null };
    const W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
    const colors = ['#f2a900', '#ff5a5f', '#4cc9f0', '#7ae582', '#c77dff', '#ffffff'];
    let parts = [], rockets = [], launched = 0, last = performance.now();
    const launch = () => rockets.push({ x: W * (0.15 + 0.7 * Math.random()), y: H, vy: -H * (1.0 + 0.4 * Math.random()), top: H * (0.15 + 0.3 * Math.random()), c: colors[launched++ % colors.length] });
    const ROCKETS = 14, big = Math.min(W, H) / dpr / 700 + 0.6;   // bursts scale with the window
    const burst = r => {
      const n = 170, second = colors[(colors.indexOf(r.c) + 2) % colors.length];
      if (stats.firstBurst === null) stats.firstBurst = Math.round(performance.now() - stats.start);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, ring = i % 3 === 0, s = (ring ? 430 : 90 + Math.random() * 380) * dpr * big;
        parts.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, size: ring ? 3.4 : 2.6, c: Math.random() < 0.15 ? '#ffffff' : ring ? second : r.c });
      }
    };
    const tick = now => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now; stats.frames++;
      if (launched < ROCKETS && Math.random() < dt * 12) launch();
      // Fade the previous frame instead of clearing it, so sparks leave trails.
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      rockets = rockets.filter(r => { r.y += r.vy * dt; ctx.fillStyle = r.c; ctx.fillRect(r.x - 1.5 * dpr, r.y, 3 * dpr, 16 * dpr); if (r.y <= r.top) { burst(r); return false; } return true; });
      parts = parts.filter(p => { p.vy += 220 * dpr * dt; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.55;
        if (p.life <= 0) return false; ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * dpr, 0, 6.283); ctx.fill(); return true; });
      ctx.globalAlpha = 1;
      if (launched < ROCKETS || rockets.length || parts.length) requestAnimationFrame(tick); else { ctx.clearRect(0, 0, W, H); stats.end = Math.round(performance.now() - stats.start); }
    };
    launch(); requestAnimationFrame(tick);
  }

  const BULB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="glass" d="M12 2.2a6.8 6.8 0 0 0-4 12.3c.7.5 1.1 1.3 1.1 2.1v.6h5.8v-.6c0-.8.4-1.6 1.1-2.1a6.8 6.8 0 0 0-4-12.3z"/>'
    + '<path class="shine" d="M8.6 8.4a3.6 3.6 0 0 1 2.3-2.6"/><rect class="base" x="9.1" y="18.1" width="5.8" height="1.9" rx=".9"/><rect class="base" x="10.2" y="20.7" width="3.6" height="1.6" rx=".8"/></svg>';
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
            if (v.val === 1) { const s = el('span', 'bulb'); s.innerHTML = BULB; d.appendChild(s); } else if (!v.auto) d.appendChild(el('span', 'x', '×'));
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
    if (mode === 'suppose') { h.appendChild(el('div', 'rule', 'Click an undecided cell to assume it ' + valWord(mark, 1) + '. Right-click to assume it ' + valWord(1 - mark, 1) + '.')); return; }
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
    const closedLine = b => el('div', 'bot', 'Contradiction: ' + (b.closed.byCases ? 'every case ended in a contradiction' : brokenText(b.closed.anchor)));
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
          into.appendChild(box(it.block, 'Assume ' + P.cn(a.cell) + ' ' + valWord(a.val, 1)));
          if (it.block.closed) into.appendChild(line(P.cn(a.cell) + ' ' + valWord(1 - a.val, 1), 'the assumption led to a contradiction', [a.cell]));
        } else {
          const src = it.src.anchor ? LU.anchorText(P, it.src.anchor) + ', so one of these is a bulb' : P.cn(it.src.cell) + ' is a bulb or it is empty';
          into.appendChild(el('div', 'caseshead', 'Cases: ' + src));
          const row = el('div', 'branches');
          it.branches.forEach((br, k) => row.appendChild(box(br, 'Case ' + (k + 1) + ': ' + P.cn(br.assume.cell) + ' ' + valWord(br.assume.val, 1))));
          into.appendChild(row);
          if (it.ended) for (const v of [1, 0]) {
            const cells = it.exports.filter(e => e.val === v).map(e => e.cell);
            if (cells.length) into.appendChild(line(names(cells) + ' ' + valWord(v, cells.length), 'true in every open case', cells));
          }
        }
      }
    }
    block(proof.root, root);
    if (!proof.root.items.length) root.appendChild(el('div', 'empty', 'No steps yet. Click a clue on the board to start.'));
    // Keep the place where the next step will go in view: the active box, or else the end of the proof.
    const box0 = root.querySelector('.box.active');
    if (!box0) root.scrollTop = root.scrollHeight;
    else {
      const pr = root.getBoundingClientRect();
      root.scrollTop = root.scrollHeight;
      const r2 = box0.getBoundingClientRect();
      if (r2.bottom < pr.top + 40 || r2.bottom > pr.bottom) root.scrollTop += r2.bottom - pr.bottom + 10;
    }
  }

  // The proof column ends at the bottom of the window, wherever its top currently is.
  function fitProof() {
    const col = document.querySelector('.right');
    col.style.maxHeight = innerWidth <= 520 ? '' : Math.max(220, innerHeight - col.getBoundingClientRect().top - 12) + 'px';
  }
  function render() {
    const path = proof.path(), f = proof.facts(path);
    if (anchor && !LU.anchorOk(P, anchor, f)) anchor = null;
    renderBoard(f); renderHint(f); fitProof(); renderProof(path);
    for (const m of ['deduce', 'suppose', 'split']) $('m-' + m).classList.toggle('on', mode === m);
    $('v-bulb').classList.toggle('on', mark === 1); $('v-empty').classList.toggle('on', mark === 0);
    $('v-bulb').textContent = 'Bulb (' + (mark === 1 ? 'left' : 'right') + ' click)';
    $('v-empty').textContent = 'Empty (' + (mark === 0 ? 'left' : 'right') + ' click)';
    $('undo').disabled = !proof.hist.length;
    $('endcases').disabled = !proof.inCases();
    $('discard').disabled = path.length < 2;
    const item = path.length > 1 ? path[path.length - 2].items.slice(-1)[0] : null;
    $('discard').textContent = item && item.type === 'cases' ? 'Discard cases' : 'Discard assumption';
    const m = $('msg'); m.textContent = msg ? msg.text : ''; m.className = msg ? msg.kind : '';
    const solvedNow = proof.solved();
    $('solved').style.display = solvedNow ? 'block' : 'none';
    if (solvedNow && !wasSolved) { celebrate(); openWin(); }
    wasSolved = solvedNow;
    store();
  }

  // ---------- wiring ----------
  const cellOf = e => { const d = e.target.closest('.cell'); return d ? +d.dataset.id : null; };
  $('board').addEventListener('click', e => { const id = cellOf(e); if (id !== null) onCell(id, mark); });
  $('board').addEventListener('contextmenu', e => { const id = cellOf(e); if (id !== null) { e.preventDefault(); onCell(id, 1 - mark); } });
  for (const m of ['deduce', 'suppose', 'split']) $('m-' + m).onclick = () => { mode = mode === m ? 'deduce' : m; anchor = null; say(null); render(); };
  $('v-bulb').onclick = () => { mark = 1; render(); };
  $('v-empty').onclick = () => { mark = 0; render(); };
  $('undo').onclick = act(() => proof.undo());
  $('discard').onclick = act(() => proof.discard(), 'Discarded.');
  $('endcases').onclick = () => {
    say(null);
    const r = proof.endCases();
    if (r.ok) say(r.survivors === 1 ? 'Only one case is still open, so everything in it holds.' : (r.n === 1 ? 'Kept the 1 cell that agrees' : 'Kept the ' + r.n + ' cells that agree') + ' in every open case.', 'ok');
    else say(r.msg);
    render();
  };
  $('restart').onclick = () => load($('pick').selectedIndex, true);
  // The popup shown after a win: pick the next puzzle and start it.
  function openWin() {
    const cur = $('pick').selectedIndex;
    $('win-pick').selectedIndex = cur < PUZZLES.length - 1 ? cur + 1 : 0;
    $('win').classList.add('show');
    $('win-start').focus();
  }
  const closeWin = () => $('win').classList.remove('show');
  $('next').onclick = openWin;
  $('win-close').onclick = closeWin;
  $('win').addEventListener('click', e => { if (e.target === $('win')) closeWin(); });
  $('win-start').onclick = () => { const i = $('win-pick').selectedIndex; closeWin(); $('pick').selectedIndex = i; load(i); window.scrollTo(0, 0); };
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
  window.addEventListener('scroll', fitProof, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('win').classList.contains('show')) { closeWin(); return; } if (e.key === 'Escape') { anchor = null; mode = 'deduce'; say(null); render(); } });
  // Remember whether each help section was left open or closed.
  const UIKEY = 'lightup-proof:sections';
  let sections = {};
  try { sections = JSON.parse(localStorage.getItem(UIKEY)) || {}; } catch (e) { /* keep defaults */ }
  for (const d of document.querySelectorAll('details[id]')) {
    if (d.id in sections) d.open = sections[d.id];
    d.addEventListener('toggle', () => { sections[d.id] = d.open; try { localStorage.setItem(UIKEY, JSON.stringify(sections)); } catch (e) { /* not saved */ } });
  }
  const pick = $('pick');
  PUZZLES.forEach((p, i) => { const o = el('option', null, p.title); o.value = i; pick.appendChild(o); $('win-pick').appendChild(o.cloneNode(true)); });
  pick.onchange = () => load(pick.selectedIndex);
  const lastIdx = Math.max(0, PUZZLES.findIndex(p => p.id === readSaved().last));
  pick.selectedIndex = lastIdx;
  load(lastIdx);
})();
