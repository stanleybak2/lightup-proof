// Headless checks for engine.js. Open tests.html; results are written into the page.
(function () {
  'use strict';
  const out = [];
  let failures = 0;
  const check = (name, cond, extra) => { if (!cond) failures++; out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')); };

  function anchors(P, pr) {
    const f = pr.facts(), a = [];
    P.nums.forEach(c => a.push({ t: 'N', cell: c }));
    P.white.forEach(c => { const v = f.get(c); a.push(v && v.val === 1 ? { t: 'B', cell: c } : { t: 'L', cell: c }); });
    return a;
  }
  function direct(P, pr) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const a of anchors(P, pr)) for (const m of pr.forcedBy(a)) {
        const r = pr.tryStep(a, m.cell, m.val);
        if (!r.ok) throw new Error('forced step rejected: ' + r.msg);
        moved = true;
      }
    }
  }
  const broken = (P, pr) => anchors(P, pr).find(a => pr.isBroken(a)) || null;
  // Solve using only the public proof actions: direct steps, plus one-level assumptions.
  function botSolve(P) {
    const pr = new LU.Proof(P); let supposes = 0;
    direct(P, pr);
    while (!pr.solved()) {
      let progress = false;
      const f = pr.facts();
      outer: for (const c of P.white) {
        if (f.has(c)) continue;
        for (const v of [1, 0]) {
          pr.suppose(c, v); direct(P, pr);
          const a = broken(P, pr);
          if (a) { const r = pr.contradiction(a); if (!r.ok) throw new Error(r.msg); supposes++; progress = true; direct(P, pr); break outer; }
          pr.discard();
        }
      }
      if (!progress) return { pr, ok: false, supposes };
    }
    return { pr, ok: true, supposes };
  }

  const solutions = {};
  for (const def of PUZZLES) {
    const P = LU.parse(def);
    let res;
    try { res = botSolve(P); } catch (e) { check('bot solves ' + def.title, false, e.message); continue; }
    check('bot solves ' + def.title, res.ok, 'assumptions used: ' + res.supposes);
    if (def.level === 'direct') check('  ' + def.title + ' needs no assumptions', res.supposes === 0);
    else check('  ' + def.title + ' needs assumptions', res.supposes > 0);
    solutions[def.id] = res.pr.facts();
  }

  // Soundness at the top level: any step the engine accepts must agree with the solution.
  {
    let tried = 0, accepted = 0, wrong = 0, seed = 12345;
    const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (const def of PUZZLES) {
      const P = LU.parse(def), sol = solutions[def.id], pr = new LU.Proof(P);
      if (!sol) continue;
      for (let k = 0; k < 4000; k++) {
        const as = anchors(P, pr), a = as[rnd(as.length)], sc = [...LU.scope(P, a)], cell = sc.length ? sc[rnd(sc.length)] : P.white[0], val = rnd(2);
        tried++;
        const r = pr.tryStep(a, cell, val);
        if (r.ok) { accepted++; const s = sol.get(cell); if (!s || s.val !== val) wrong++; }
      }
    }
    check('random steps: every accepted step matches the solution', wrong === 0, tried + ' tried, ' + accepted + ' accepted, ' + wrong + ' wrong');
  }

  // Lit cells count as empty without a step, and cannot be marked.
  {
    const P = LU.parse(PUZZLES[0]), pr = new LU.Proof(P), sol = solutions[PUZZLES[0].id];
    direct(P, pr);
    const f = pr.facts(), bulbs = [...f].filter(([, v]) => v.val === 1).map(([c]) => c);
    const seen = new Set(); bulbs.forEach(b => P.vis[b].forEach(x => seen.add(x)));
    check('every cell a bulb shines on is empty', [...seen].every(x => f.get(x).val === 0));
    check('no proof step was needed for a bulb rule', pr.root.items.every(it => it.anchor.t !== 'B'));
    const pr2 = new LU.Proof(P), n = P.nums.find(x => P.numAt(x) === P.nbrs[x].length && P.numAt(x) > 0);
    pr2.tryStep({ t: 'N', cell: n }, P.nbrs[n][0], 1);
    const litCell = P.vis[P.nbrs[n][0]][0], r = pr2.tryStep({ t: 'L', cell: litCell }, litCell, 1);
    check('a lit cell cannot be marked', !r.ok && /already lit/.test(r.msg), r.msg);
  }

  // Assumptions and cases on a puzzle that needs them.
  {
    const def = PUZZLES.find(p => p.level === 'suppose'), P = LU.parse(def), sol = solutions[def.id];
    const pr = new LU.Proof(P); direct(P, pr);
    const f0 = pr.facts(), unk = P.white.filter(c => !f0.has(c));
    check('contradiction refused with no assumption open', !pr.contradiction({ t: 'N', cell: P.nums[0] }).ok);
    check('end cases refused with no cases open', !pr.endCases().ok);
    check('discard refused at top level', !pr.discard().ok);

    // Wrong assumption -> contradiction -> opposite value concluded.
    let done = false;
    for (const c of unk) {
      const wrongVal = 1 - sol.get(c).val;
      pr.suppose(c, wrongVal); direct(P, pr);
      const a = broken(P, pr);
      if (a) {
        const fine = anchors(P, pr).find(x => !pr.isBroken(x));
        check('non-broken rule refused as contradiction', !pr.contradiction(fine).ok && pr.path().length === 2);
        const r = pr.contradiction(a);
        const f = pr.facts();
        check('wrong assumption closes and yields the opposite', r.ok && f.get(c).val === sol.get(c).val && f.get(c).depth === 0);
        check('facts from inside the closed assumption are gone', [...f.values()].every(v => v.depth === 0));
        pr.undo();
        check('undo reopens the assumption', pr.path().length === 2);
        pr.discard(); done = true; break;
      }
      pr.discard();
    }
    check('found a refutable assumption', done);

    // Correct assumption cannot be closed.
    {
      const c = unk[0]; pr.suppose(c, sol.get(c).val); direct(P, pr);
      check('true assumption gives no broken rule', broken(P, pr) === null);
      const lenBefore = pr.root.items.length; pr.discard();
      check('discard removes the assumption', pr.root.items.length === lenBefore - 1 && pr.path().length === 1);
    }

    // Cases on a cell: one branch dies, the survivor's facts are exported.
    {
      let ok = false;
      for (const c of unk) {
        pr.casesCell(c);
        const item = pr.root.items[pr.root.items.length - 1];
        const wrongIdx = item.branches.findIndex(b => b.assume.val !== sol.get(c).val);
        pr.select(item.branches[wrongIdx]); direct(P, pr);
        const a = broken(P, pr);
        if (!a) { pr.discard(); continue; }
        pr.contradiction(a);
        check('after a case closes, the open case is selected', item.sel === 1 - wrongIdx && !pr.path()[1].closed);
        direct(P, pr);
        const r = pr.endCases(), f = pr.facts();
        const agree = [...f].every(([cell, v]) => sol.get(cell).val === v.val);
        check('end cases exports the surviving case', r.ok && r.survivors === 1 && f.get(c).val === sol.get(c).val && agree && pr.path().length === 1, 'exported ' + r.n);
        pr.undo(); pr.discard(); ok = true; break;
      }
      check('ran a cell case split', ok);
    }

    // Cases with two live branches: only common facts come out. Uses a fresh proof so the cases have something in common.
    {
      let ok = false;
      const full = pr;
      for (const c of P.white) {
        const pr = new LU.Proof(P);
        pr.casesCell(c);
        const item = pr.root.items[pr.root.items.length - 1];
        pr.select(item.branches[0]); direct(P, pr); const b0 = broken(P, pr);
        pr.select(item.branches[1]); direct(P, pr); const b1 = broken(P, pr);
        if (b0 || b1) { pr.discard(); continue; }
        const pf = pr.facts([pr.root]);
        const f0b = pr.facts([pr.root, item.branches[0]]), f1b = pr.facts([pr.root, item.branches[1]]);
        const common = [...f0b].filter(([cell, v]) => !pf.has(cell) && f1b.has(cell) && f1b.get(cell).val === v.val);
        const r = pr.endCases();
        if (!common.length) { check('end cases refused when the cases share nothing', !r.ok); pr.discard(); continue; }
        const f = pr.facts();
        check('two live cases export exactly their common facts', r.ok && f.size === pf.size + common.length && !f.has(c) && common.every(([cell, v]) => f.get(cell).val === v.val && sol.get(cell).val === v.val), 'common ' + common.length);
        ok = true; break;
      }
      check('two-live-branch split exercised', ok);
    }

    // Cases from a rule, and every case failing inside an assumption.
    {
      let fromRule = false, allDie = false;
      for (const a of anchors(P, pr)) {
        const r = pr.casesAnchor(a);
        if (!r.ok) continue;
        const item = pr.root.items[pr.root.items.length - 1];
        const exhaustive = item.branches.some(b => sol.get(b.assume.cell).val === b.assume.val);
        if (!fromRule) check('rule cases cover the real solution', exhaustive, LU.anchorText(P, a) + ' -> ' + item.branches.length + ' cases');
        fromRule = true; pr.discard();
      }
      check('ran a case split from a rule', fromRule);
      for (const c of unk) {
        if (allDie) break;
        pr.suppose(c, 1 - sol.get(c).val);
        for (const a of anchors(P, pr)) {
          if (!pr.casesAnchor(a).ok) continue;
          const sup = pr.root.items[pr.root.items.length - 1].block, item = sup.items[sup.items.length - 1];
          let dead = 0;
          for (const br of item.branches) {
            if (!pr.select(br)) break;
            direct(P, pr); const bk = broken(P, pr);
            if (!bk) break;
            pr.contradiction(bk); dead++;
          }
          if (dead === item.branches.length) {
            const f = pr.facts();
            check('all cases failing closes the enclosing assumption', sup.closed && sup.closed.byCases && pr.path().length === 1 && f.get(c).val === sol.get(c).val);
            allDie = true; pr.undo();
          }
          while (pr.path().length > 2) pr.discard();
          if (pr.path().length === 2 && pr.path()[1].items.length && pr.path()[1].items[pr.path()[1].items.length - 1].type === 'cases') pr.path()[1].items.pop();
          if (allDie) break;
        }
        while (pr.path().length > 1) pr.discard();
      }
      out.push((allDie ? 'INFO ' : 'INFO (none found) ') + 'all-cases-fail inside an assumption exercised');
    }
  }

  out.unshift(failures ? 'FAILURES: ' + failures : 'ALL PASSED');
  window.TEST_RESULTS = out;
  document.getElementById('out').textContent = out.join('\n');
})();
