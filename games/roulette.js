/*
 * games/roulette.js — ルーレットの盤面(ヨーロピアン:0が1つ、37マス)
 * ゲームモジュールの形は blackjack.js と同じ。
 * 来場者が押したマスを確かめるため matchInput、強調する場所を賭け先ごとに変えるため targetFor を持つ。
 */
(function () {
  'use strict';

  // ホイール上の数字の並び(ヨーロピアン)
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  const colorOf = (n) => (n === 0 ? 'green' : (RED.indexOf(n) >= 0 ? 'red' : 'black'));
  const colorLabel = { green: '緑', red: '赤', black: '黒' };

  // 賭け方の一覧(配当は「賭けたチップの何倍が増えるか」)
  const KINDS = {
    number: { label: '数字1つ', payout: 35, wins: (n, p) => n === Number(p.number) },
    red: { label: '赤', payout: 1, wins: (n) => colorOf(n) === 'red' },
    black: { label: '黒', payout: 1, wins: (n) => colorOf(n) === 'black' },
    even: { label: '偶数', payout: 1, wins: (n) => n !== 0 && n % 2 === 0 },
    odd: { label: '奇数', payout: 1, wins: (n) => n % 2 === 1 },
    low: { label: '1〜18', payout: 1, wins: (n) => n >= 1 && n <= 18 },
    high: { label: '19〜36', payout: 1, wins: (n) => n >= 19 },
    dozen1: { label: '1〜12', payout: 2, wins: (n) => n >= 1 && n <= 12 },
    dozen2: { label: '13〜24', payout: 2, wins: (n) => n >= 13 && n <= 24 },
    dozen3: { label: '25〜36', payout: 2, wins: (n) => n >= 25 }
  };
  const KIND_OPTIONS = Object.keys(KINDS).map((k) => [k, KINDS[k].label + '(配当' + KINDS[k].payout + '倍)']);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function betKey(kind, number) { return kind === 'number' ? 'number-' + number : kind; }
  function betLabel(kind, number) { return kind === 'number' ? String(number) : KINDS[kind].label; }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  }

  function buildWheel() {
    const s = svg('svg', { viewBox: '0 0 200 200', class: 'rl-wheel-svg' });
    const seg = 360 / WHEEL.length;
    const cx = 100;
    const cy = 100;
    const rOut = 96;
    const rIn = 64;
    const pt = (r, deg) => {
      const a = (deg - 90) * Math.PI / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    s.append(svg('circle', { cx, cy, r: 99, fill: '#b8913a' }));
    WHEEL.forEach((n, i) => {
      const a0 = i * seg;
      const a1 = a0 + seg;
      const [x0, y0] = pt(rOut, a0);
      const [x1, y1] = pt(rOut, a1);
      const [x2, y2] = pt(rIn, a1);
      const [x3, y3] = pt(rIn, a0);
      const fill = n === 0 ? '#1f7a4a' : (colorOf(n) === 'red' ? '#b8282a' : '#1c1c1f');
      s.append(svg('path', {
        d: `M${x0} ${y0} A${rOut} ${rOut} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 0 0 ${x3} ${y3} Z`,
        fill, stroke: '#d9b250', 'stroke-width': '0.6'
      }));
      const t = svg('text', {
        x: cx, y: cy - rOut + 12, 'text-anchor': 'middle', 'font-size': '8.5', 'font-weight': '700', fill: '#fff',
        transform: `rotate(${a0 + seg / 2} ${cx} ${cy})`
      });
      t.textContent = n;
      s.append(t);
    });
    s.append(svg('circle', { cx, cy, r: rIn, fill: '#5a3b1c' }));
    s.append(svg('circle', { cx, cy, r: 40, fill: '#7a5428', stroke: '#d9b250', 'stroke-width': '2' }));
    for (let i = 0; i < 4; i++) {
      s.append(svg('rect', { x: cx - 3, y: cy - 34, width: 6, height: 68, rx: 3, fill: '#d9b250', transform: `rotate(${i * 45} ${cx} ${cy})` }));
    }
    s.append(svg('circle', { cx, cy, r: 9, fill: '#e8c46a' }));
    return s;
  }

  const RouletteGame = {
    id: 'roulette',
    name: 'ルーレット',

    targets: [
      { id: 'table', label: 'テーブル全体' },
      { id: 'wheel', label: 'ホイール' },
      { id: 'result', label: '出た数字' },
      { id: 'number-grid', label: '数字のマス全体' },
      { id: 'num-0', label: '0のマス' },
      { id: 'outside-bets', label: '外側の賭け(赤黒・偶数奇数など)全体' },
      { id: 'bet-red', label: '赤のマス' },
      { id: 'bet-black', label: '黒のマス' },
      { id: 'bet-even', label: '偶数のマス' },
      { id: 'bet-odd', label: '奇数のマス' },
      { id: 'bet-low', label: '1〜18のマス' },
      { id: 'bet-high', label: '19〜36のマス' },
      { id: 'bet-dozen1', label: '1〜12のマス' },
      { id: 'bet-dozen2', label: '13〜24のマス' },
      { id: 'bet-dozen3', label: '25〜36のマス' },
      { id: 'chip-count', label: '持ちチップ' },
      { id: 'btn-spin', label: 'スピンボタン' }
    ],

    actions: [
      { id: 'bet', label: 'チップを置く(ベット)', demo: true, input: true, target: 'number-grid', sound: 'chip',
        params: [
          { key: 'kind', label: '賭ける場所', type: 'select', options: KIND_OPTIONS, default: 'red' },
          { key: 'number', label: '数字(「数字1つ」のときだけ使う)', type: 'number', default: 17, min: 0,
            help: '0〜36。「数字1つ」以外を選んだときは無視されます' },
          { key: 'amount', label: '置くチップ', type: 'number', default: 10, min: 1 }
        ] },
      { id: 'spin', label: 'スピン(ホイールを回す)', demo: true, input: true, target: 'btn-spin', sound: 'spin',
        params: [{ key: 'result', label: '止まる数字', type: 'number', default: 17, min: 0,
          help: '0〜36。毎回この数字に止まるので、説明の展開を決めておけます' }] },
      { id: 'settle', label: '当たりを判定してチップを払う', demo: true, input: false, target: 'result', sound: 'auto', params: [] },
      { id: 'clear', label: 'チップを片付けて次のゲームへ', demo: true, input: false, target: 'table', sound: 'chip', params: [] }
    ],

    setupFields: [
      { key: 'chips', label: '最初の持ちチップ', type: 'number', default: 100, min: 0 }
    ],

    /** 来場者が押したマスが、ステップで決めた賭け先と同じか */
    matchInput(action, params, detail) {
      if (action !== 'bet') return true;
      if (detail.kind !== params.kind) return false;
      return params.kind !== 'number' || Number(detail.number) === Number(params.number);
    },

    /** 強調する場所(おまかせ)を賭け先に合わせる */
    targetFor(action, params) {
      if (action === 'bet') return params.kind === 'number' ? 'num-' + Number(params.number) : 'bet-' + params.kind;
      return null;
    },

    /** 来場者への案内に使う言い方 */
    inputLabel(action, params) {
      if (action === 'bet') return (params.kind === 'number' ? Number(params.number) : (KINDS[params.kind] || KINDS.red).label) + 'にベット';
      if (action === 'spin') return 'スピン';
      return null;
    },

    validateSetup() { return []; },

    create(root, setup, ctx) {
      const S = {
        chips: Number.isFinite(Number((setup || {}).chips)) ? Number(setup.chips) : 100,
        bets: [],            // { kind, number, amount }
        result: null,
        settled: false,
        rotation: 0,
        inputHandler: null
      };

      root.innerHTML = '';
      const table = el('div', 'rl-table');
      table.dataset.target = 'table';

      // ホイール
      const top = el('div', 'rl-top');
      const wheelBox = el('div', 'rl-wheel');
      wheelBox.dataset.target = 'wheel';
      const spinner = el('div', 'rl-spinner');
      spinner.append(buildWheel());
      const orbit = el('div', 'rl-orbit');
      orbit.append(el('div', 'rl-ball'));
      const pointer = el('div', 'rl-pointer');
      wheelBox.append(spinner, orbit, pointer);
      const resultBox = el('div', 'rl-result');
      resultBox.dataset.target = 'result';
      const resultNum = el('div', 'rl-result-num', '-');
      const resultLabel = el('div', 'rl-result-label', '出た数字');
      resultBox.append(resultNum, resultLabel);
      const banner = el('div', 'rl-banner');
      top.append(wheelBox, resultBox);

      // 数字のマス(横向き:左に0、右に向かって 1〜36)
      const board = el('div', 'rl-board');
      const grid = el('div', 'rl-grid');
      grid.dataset.target = 'number-grid';
      const cells = {};

      function cellButton(kind, number, label, cls) {
        const b = el('button', 'rl-cell ' + (cls || ''));
        b.type = 'button';
        b.append(el('span', 'rl-cell-label', label));
        b.dataset.target = kind === 'number' ? 'num-' + number : 'bet-' + kind;
        b.addEventListener('click', () => { if (S.inputHandler) S.inputHandler('bet', { kind, number }); });
        cells[betKey(kind, number)] = b;
        return b;
      }

      const zero = cellButton('number', 0, '0', 'rl-green rl-zero');
      zero.style.gridRow = '1 / span 3';
      zero.style.gridColumn = '1';
      grid.append(zero);
      for (let n = 1; n <= 36; n++) {
        const b = cellButton('number', n, String(n), 'rl-' + colorOf(n));
        b.style.gridColumn = String(Math.ceil(n / 3) + 1);
        b.style.gridRow = String(3 - ((n - 1) % 3));
        grid.append(b);
      }

      const outside = el('div', 'rl-outside');
      outside.dataset.target = 'outside-bets';
      const dozens = el('div', 'rl-row rl-row-3');
      dozens.append(cellButton('dozen1', null, '1〜12'), cellButton('dozen2', null, '13〜24'), cellButton('dozen3', null, '25〜36'));
      const evens = el('div', 'rl-row rl-row-6');
      const redCell = cellButton('red', null, '', 'rl-swatch rl-red');
      const blackCell = cellButton('black', null, '', 'rl-swatch rl-black');
      redCell.querySelector('.rl-cell-label').textContent = '赤';
      blackCell.querySelector('.rl-cell-label').textContent = '黒';
      evens.append(cellButton('low', null, '1〜18'), cellButton('even', null, '偶数'), redCell, blackCell, cellButton('odd', null, '奇数'), cellButton('high', null, '19〜36'));
      outside.append(dozens, evens);
      board.append(grid, outside);

      const info = el('div', 'rl-info');
      const chipCount = el('div', 'bj-chipcount');
      chipCount.dataset.target = 'chip-count';
      const betTotal = el('div', 'rl-bettotal');
      info.append(chipCount, betTotal);

      table.append(board, banner, top, info);

      const controls = el('div', 'rl-controls');
      const spinBtn = el('button', 'bj-btn rl-spin-btn', 'スピン');
      spinBtn.type = 'button';
      spinBtn.dataset.target = 'btn-spin';
      spinBtn.addEventListener('click', () => { if (S.inputHandler) S.inputHandler('spin', {}); });
      controls.append(spinBtn);

      root.append(table, controls);

      // ---------- 描画 ----------
      function render() {
        Object.values(cells).forEach((c) => {
          const old = c.querySelector('.rl-chip');
          if (old) old.remove();
          c.classList.remove('rl-hit');
        });
        S.bets.forEach((b) => {
          const c = cells[betKey(b.kind, b.number)];
          if (!c) return;
          const chip = el('span', 'rl-chip', String(b.amount));
          if (b.state) chip.classList.add('rl-chip-' + b.state);
          c.append(chip);
        });
        if (S.result != null && S.settled) {
          const c = cells[betKey('number', S.result)];
          if (c) c.classList.add('rl-hit');
        }
        chipCount.textContent = '持ちチップ ' + S.chips;
        const total = S.bets.filter((b) => b.state !== 'lose').reduce((a, b) => a + b.amount, 0);
        betTotal.textContent = 'ベット ' + total;
      }

      function showResult(n) {
        resultNum.textContent = n == null ? '-' : String(n);
        resultBox.className = 'rl-result' + (n == null ? '' : ' rl-result-' + colorOf(n));
        resultLabel.textContent = n == null ? '出た数字' : colorLabel[colorOf(n)] + ' ・ ' + (n === 0 ? '0' : (n % 2 === 0 ? '偶数' : '奇数'));
      }

      function showBanner(text, kind) {
        banner.textContent = text || '';
        banner.className = 'rl-banner' + (text ? ' bj-show' : '') + (kind ? ' bj-banner-' + kind : '');
      }

      function wait(ms, o) {
        if (!o.animate) return Promise.resolve();
        return new Promise((r) => setTimeout(r, ms / (o.speed || 1)));
      }

      const performers = {
        async bet(p, o) {
          if (S.settled) throw new Error('当たりの判定が終わっています。先に「チップを片付けて次のゲームへ」を入れてください');
          const kind = KINDS[p.kind] ? p.kind : 'red';
          const number = kind === 'number' ? Number(p.number) : null;
          if (kind === 'number' && !(Number.isInteger(number) && number >= 0 && number <= 36)) throw new Error('数字は0〜36で指定してください');
          const amount = Math.max(1, Number(p.amount) || 10);
          if (S.chips < amount) throw new Error('持ちチップが足りません');
          S.chips -= amount;
          const same = S.bets.find((b) => b.kind === kind && b.number === number);
          if (same) same.amount += amount; else S.bets.push({ kind, number, amount });
          ctx.sfx('chip');
          render();
          await wait(350, o);
        },
        async spin(p, o) {
          if (S.settled) throw new Error('当たりの判定が終わっています。先に「チップを片付けて次のゲームへ」を入れてください');
          const n = Number(p.result);
          if (!(Number.isInteger(n) && n >= 0 && n <= 36)) throw new Error('止まる数字は0〜36で指定してください');
          showBanner('');
          const seg = 360 / WHEEL.length;
          const center = WHEEL.indexOf(n) * seg + seg / 2;
          const base = (360 - center) % 360;
          let next = S.rotation - (S.rotation % 360) + 360 * 5 + base;
          if (next - S.rotation < 360 * 4) next += 360;
          S.rotation = next;
          const ms = 3600 / (o.speed || 1);
          if (o.animate) {
            ctx.sfx('spin');
            spinner.style.transition = 'transform ' + ms + 'ms cubic-bezier(.12,.68,.18,1)';
            orbit.style.transition = 'none';
            orbit.style.transform = 'rotate(0deg)';
            void orbit.offsetWidth;
            orbit.style.transition = 'transform ' + ms + 'ms cubic-bezier(.2,.6,.25,1)';
            orbit.style.transform = 'rotate(-1440deg)';
            orbit.classList.add('rl-show');
          } else {
            spinner.style.transition = 'none';
            orbit.style.transition = 'none';
            orbit.style.transform = 'rotate(0deg)';
            orbit.classList.add('rl-show');
          }
          spinner.style.transform = 'rotate(' + S.rotation + 'deg)';
          if (o.animate) {
            const sp = o.speed || 1;
            setTimeout(() => ctx.sfx('spin'), 1200 / sp);
            await wait(3700, o);
          }
          S.result = n;
          showResult(n);
          ctx.sfx('tap');
          await wait(400, o);
        },
        async settle(p, o) {
          if (S.result == null) throw new Error('まだスピンしていません');
          if (S.settled) throw new Error('このゲームの判定はもう終わっています');
          if (!S.bets.length) throw new Error('チップが置かれていません');
          let gained = 0;
          S.bets.forEach((b) => {
            if (KINDS[b.kind].wins(S.result, b)) {
              b.state = 'win';
              const pay = b.amount * (KINDS[b.kind].payout + 1);
              S.chips += pay;
              gained += pay - b.amount;
            } else {
              b.state = 'lose';
              gained -= b.amount;
            }
          });
          S.settled = true;
          render();
          const head = S.result + '(' + colorLabel[colorOf(S.result)] + ')';
          if (gained > 0) { showBanner(head + ' 当たり! +' + gained, 'win'); ctx.sfx('win'); }
          else { showBanner(head + ' はずれ', 'lose'); ctx.sfx('lose'); }
          await wait(900, o);
        },
        async clear(p, o) {
          S.bets = [];
          S.settled = false;
          S.result = null;
          showResult(null);
          showBanner('');
          render();
          ctx.sfx('chip');
          await wait(300, o);
        }
      };

      showResult(null);
      render();

      return {
        async perform(actionId, params, o) {
          const fn = performers[actionId];
          if (!fn) throw new Error('この盤面にない動きです:' + actionId);
          await fn(params || {}, o || { animate: true, speed: 1 });
        },
        target(id) { return root.querySelector('[data-target="' + id + '"]'); },
        setInput(handler) {
          S.inputHandler = handler;
          root.classList.toggle('bj-input', !!handler);
        },
        destroy() { root.innerHTML = ''; }
      };
    }
  };

  window.CasinoGames = window.CasinoGames || {};
  window.CasinoGames.roulette = RouletteGame;
})();
