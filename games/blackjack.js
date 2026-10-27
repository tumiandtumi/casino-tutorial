/*
 * games/blackjack.js — ブラックジャックの盤面
 *
 * ゲームモジュールの共通ルール(ルーレット・ポーカーも同じ形で追加する):
 *   id / name             … ゲームの識別子と表示名
 *   targets               … 強調(スポットライト)できる場所の一覧
 *   actions               … 盤面でできる動きの一覧(demo: 見本で使える / input: 来場者に操作させられる)
 *   setupFields           … 作成ツールの「盤面の初期設定」に出す項目
 *   create(el, setup, ctx)… 盤面を作り、次のメソッドを持つオブジェクトを返す
 *       perform(actionId, params, { animate, speed }) … 動きを実行(Promise)
 *       target(id)        … 強調する要素を返す
 *       setInput(handler) … 来場者の操作待ち。handler(actionId) を呼ぶ。null で解除
 *       destroy()
 */
(function () {
  'use strict';

  const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function parseCard(code) {
    const c = String(code).trim().toUpperCase();
    const suit = c.slice(-1);
    const rank = c.slice(0, -1);
    if (!SUITS[suit] || RANKS.indexOf(rank) < 0) return null;
    return { code: rank + suit, rank, suit };
  }

  function cardValue(rank) {
    if (rank === 'A') return 11;
    if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
    return Number(rank);
  }

  /** 合計を計算。Aは11で数えて21を超えるなら1にする */
  function handTotal(cards) {
    let total = 0;
    let aces = 0;
    cards.forEach((c) => {
      total += cardValue(c.rank);
      if (c.rank === 'A') aces++;
    });
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 && total <= 21 };
  }

  /** 山札の文字列("10H 6S ...")を配列にする。読めないカードは errors に入れる */
  function parseDeck(text) {
    const parts = String(text || '').split(/[\s,、]+/).filter(Boolean);
    const cards = [];
    const errors = [];
    parts.forEach((p) => {
      const c = parseCard(p);
      if (c) cards.push(c); else errors.push(p);
    });
    return { cards, errors };
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const BlackjackGame = {
    id: 'blackjack',
    name: 'ブラックジャック',

    targets: [
      { id: 'table', label: 'テーブル全体' },
      { id: 'dealer-hand', label: 'ディーラーの手札' },
      { id: 'dealer-total', label: 'ディーラーの合計' },
      { id: 'player-hand', label: '自分の手札(操作中の手)' },
      { id: 'player-total', label: '自分の合計(操作中の手)' },
      { id: 'all-hands', label: '自分の手札(全部)' },
      { id: 'bet-spot', label: 'ベットした場所' },
      { id: 'chip-count', label: '持ちチップ' },
      { id: 'deck', label: '山札' },
      { id: 'btn-bet', label: 'ベットボタン' },
      { id: 'btn-hit', label: 'ヒットボタン' },
      { id: 'btn-stand', label: 'スタンドボタン' },
      { id: 'btn-split', label: 'スプリットボタン' }
    ],

    actions: [
      { id: 'bet', label: 'ベットする', demo: true, input: true, target: 'btn-bet', sound: 'chip',
        params: [{ key: 'amount', label: '1回で置くチップ', type: 'number', default: 10, min: 1 }] },
      { id: 'deal', label: 'カードを配る(自分2枚・ディーラー2枚)', demo: true, input: false, target: 'table', sound: 'card', params: [] },
      { id: 'hit', label: 'ヒット(1枚引く)', demo: true, input: true, target: 'btn-hit', sound: 'card', params: [] },
      { id: 'stand', label: 'スタンド(引くのをやめる)', demo: true, input: true, target: 'btn-stand', sound: 'tap', params: [] },
      { id: 'split', label: 'スプリット(ペアを2つの手に分ける)', demo: true, input: true, target: 'btn-split', sound: 'card', params: [] },
      { id: 'reveal', label: 'ディーラーの伏せ札をめくる', demo: true, input: false, target: 'dealer-hand', sound: 'flip', params: [] },
      { id: 'dealer_play', label: 'ディーラーが引く(17以上で止まる)', demo: true, input: false, target: 'dealer-hand', sound: 'card', params: [] },
      { id: 'settle', label: '勝敗を判定してチップを払う', demo: true, input: false, target: 'all-hands', sound: 'auto', params: [] },
      { id: 'clear', label: '場を片付けて次のゲームへ', demo: true, input: false, target: 'table', sound: 'card', params: [] }
    ],

    setupFields: [
      { key: 'deck', label: '山札の順番', type: 'deck',
        help: '上から配られる順に、空白区切りで書きます。例:10H 7C 6S 10D(S=♠ H=♥ D=♦ C=♣、A 2〜10 J Q K)',
        default: '10H 7C 6S 10D 4H' },
      { key: 'chips', label: '最初の持ちチップ', type: 'number', default: 100, min: 0 }
    ],

    parseDeck,
    handTotal,

    /** 作成ツールの入力チェック用:山札の文字列を確認する */
    validateSetup(setup) {
      const msgs = [];
      const d = parseDeck(setup && setup.deck);
      if (d.errors.length) msgs.push('山札に読めないカードがあります:' + d.errors.join(' '));
      if (!d.cards.length) msgs.push('山札が空です');
      return msgs;
    },

    create(root, setup, ctx) {
      const opts = setup || {};
      const deckInfo = parseDeck(opts.deck);
      const deck = deckInfo.cards;
      const startChips = Number.isFinite(Number(opts.chips)) ? Number(opts.chips) : 100;

      const S = {
        drawIndex: 0,
        chips: startChips,
        pendingBet: 0,
        dealer: [],          // { card, hidden }
        hands: [],           // { cards: [], bet, done, result }
        active: 0,
        phase: 'betting',    // betting → player → dealer → settled
        inputHandler: null
      };

      // ---------- DOM ----------
      root.innerHTML = '';
      const table = el('div', 'bj-table');
      table.dataset.target = 'table';

      const dealerArea = el('div', 'bj-area bj-dealer');
      const dealerLabel = el('div', 'bj-label', 'ディーラー');
      const dealerHand = el('div', 'bj-hand');
      dealerHand.dataset.target = 'dealer-hand';
      const dealerTotal = el('div', 'bj-total');
      dealerTotal.dataset.target = 'dealer-total';
      dealerArea.append(dealerLabel, dealerHand, dealerTotal);

      const middle = el('div', 'bj-middle');
      const shoe = el('div', 'bj-shoe');
      shoe.dataset.target = 'deck';
      shoe.append(el('div', 'bj-card bj-back'), el('div', 'bj-card bj-back'));
      const banner = el('div', 'bj-banner');
      middle.append(shoe, banner);

      const playerArea = el('div', 'bj-area bj-player');
      const handsWrap = el('div', 'bj-hands');
      handsWrap.dataset.target = 'all-hands';
      const betSpot = el('div', 'bj-betspot');
      betSpot.dataset.target = 'bet-spot';
      playerArea.append(handsWrap, betSpot, el('div', 'bj-label', 'あなた'));

      const info = el('div', 'bj-info');
      const chipCount = el('div', 'bj-chipcount');
      chipCount.dataset.target = 'chip-count';
      info.append(chipCount);

      const controls = el('div', 'bj-controls');
      const buttons = {};
      [['bet', 'ベット'], ['hit', 'ヒット'], ['stand', 'スタンド'], ['split', 'スプリット']].forEach(([id, label]) => {
        const b = el('button', 'bj-btn bj-btn-' + id, label);
        b.type = 'button';
        b.dataset.target = 'btn-' + id;
        b.addEventListener('click', () => {
          if (S.inputHandler) S.inputHandler(id);
        });
        buttons[id] = b;
        controls.append(b);
      });

      table.append(dealerArea, middle, playerArea, info);
      root.append(table, controls);

      // ---------- 描画 ----------
      function cardEl(card, hidden, enter) {
        const c = el('div', 'bj-card' + (hidden ? ' bj-back' : '') + (enter ? ' bj-enter' : ''));
        if (!hidden) {
          const red = card.suit === 'H' || card.suit === 'D';
          if (red) c.classList.add('bj-red');
          c.append(el('span', 'bj-rank', card.rank), el('span', 'bj-suit', SUITS[card.suit]));
          c.append(el('span', 'bj-pip', SUITS[card.suit]));
        }
        return c;
      }

      function totalText(cards) {
        if (!cards.length) return '';
        const t = handTotal(cards);
        if (t.total > 21) return t.total + ' バースト';
        if (t.soft && t.total !== 21) return (t.total - 10) + ' / ' + t.total;
        return String(t.total);
      }

      let lastCounts = { dealer: 0, hands: [] };

      function render(animate) {
        // ディーラー
        dealerHand.innerHTML = '';
        S.dealer.forEach((d, i) => dealerHand.append(cardEl(d.card, d.hidden, animate && i >= lastCounts.dealer)));
        const visible = S.dealer.filter((d) => !d.hidden).map((d) => d.card);
        if (!S.dealer.length) dealerTotal.textContent = '';
        else if (S.dealer.some((d) => d.hidden)) dealerTotal.textContent = totalText(visible) + ' + ?';
        else dealerTotal.textContent = totalText(visible);

        // プレイヤー
        handsWrap.innerHTML = '';
        handsWrap.classList.toggle('bj-split', S.hands.length > 1);
        S.hands.forEach((h, hi) => {
          const box = el('div', 'bj-handbox');
          if (S.hands.length > 1 && hi === S.active && S.phase === 'player') box.classList.add('bj-active');
          const hand = el('div', 'bj-hand');
          const prev = lastCounts.hands[hi] || 0;
          h.cards.forEach((c, ci) => hand.append(cardEl(c, false, animate && ci >= prev)));
          const tot = el('div', 'bj-total', totalText(h.cards));
          if (hi === S.active) { hand.dataset.target = 'player-hand'; tot.dataset.target = 'player-total'; }
          box.append(hand, tot);
          if (h.result) {
            const labels = { win: '勝ち', lose: '負け', push: '引き分け', blackjack: 'ブラックジャック!', bust: 'バースト' };
            box.append(el('div', 'bj-result bj-result-' + h.result, labels[h.result] || ''));
          }
          handsWrap.append(box);
        });
        if (!S.hands.length) {
          const empty = el('div', 'bj-handbox bj-empty');
          const hand = el('div', 'bj-hand');
          hand.dataset.target = 'player-hand';
          const tot = el('div', 'bj-total');
          tot.dataset.target = 'player-total';
          empty.append(hand, tot);
          handsWrap.append(empty);
        }
        lastCounts = { dealer: S.dealer.length, hands: S.hands.map((h) => h.cards.length) };

        // ベットとチップ
        const betTotal = S.hands.length ? S.hands.reduce((a, h) => a + h.bet, 0) : S.pendingBet;
        betSpot.innerHTML = '';
        if (betTotal > 0) {
          const stack = el('div', 'bj-chipstack');
          const n = Math.min(6, Math.max(1, Math.ceil(betTotal / 10)));
          for (let i = 0; i < n; i++) stack.append(el('div', 'bj-chip'));
          betSpot.append(stack, el('div', 'bj-betamount', 'ベット ' + betTotal));
        } else {
          betSpot.append(el('div', 'bj-betamount bj-muted', 'ベット 0'));
        }
        chipCount.textContent = '持ちチップ ' + S.chips;
        buttons.split.disabled = false;
      }

      // ---------- ルール処理 ----------
      function draw() {
        if (S.drawIndex >= deck.length) {
          throw new Error('山札のカードが足りません(' + (S.drawIndex + 1) + '枚目)。「山札の順番」にカードを足してください');
        }
        return deck[S.drawIndex++];
      }

      function wait(ms, o) {
        if (!o.animate) return Promise.resolve();
        return new Promise((r) => setTimeout(r, ms / (o.speed || 1)));
      }

      function showBanner(text, kind) {
        banner.textContent = text || '';
        banner.className = 'bj-banner' + (text ? ' bj-show' : '') + (kind ? ' bj-banner-' + kind : '');
      }

      function nextHand() {
        while (S.active < S.hands.length && S.hands[S.active].done) S.active++;
        if (S.active >= S.hands.length) {
          S.phase = 'dealer';
          S.active = Math.max(0, S.hands.length - 1);
        }
      }

      function requirePhase(phase, msg) {
        if (S.phase !== phase) throw new Error(msg);
      }

      const performers = {
        async bet(p, o) {
          requirePhase('betting', 'ベットはカードを配る前にしかできません(「場を片付けて次のゲームへ」を先に入れてください)');
          const amount = Math.max(1, Number(p.amount) || 10);
          if (S.chips < amount) throw new Error('持ちチップが足りません');
          S.chips -= amount;
          S.pendingBet += amount;
          ctx.sfx('chip');
          render(o.animate);
          await wait(350, o);
        },
        async deal(p, o) {
          requirePhase('betting', 'カードを配れるのはベットの段階だけです(前のゲームを「場を片付けて次のゲームへ」で終わらせてください)');
          showBanner('');
          S.hands = [{ cards: [], bet: S.pendingBet, done: false, result: null }];
          S.pendingBet = 0;
          S.active = 0;
          S.dealer = [];
          const order = ['p', 'd', 'p', 'dh'];
          for (const who of order) {
            const card = draw();
            if (who === 'p') S.hands[0].cards.push(card);
            else S.dealer.push({ card, hidden: who === 'dh' });
            ctx.sfx('card');
            render(o.animate);
            await wait(380, o);
          }
          S.phase = 'player';
          render(false);
        },
        async hit(p, o) {
          requirePhase('player', 'ヒットできるのは自分の番(カードが配られた後、スタンド前)だけです');
          const h = S.hands[S.active];
          h.cards.push(draw());
          ctx.sfx('card');
          const t = handTotal(h.cards).total;
          if (t > 21) {
            h.done = true;
            h.result = 'bust';
            render(o.animate);
            await wait(450, o);
            ctx.sfx('lose');
            nextHand();
          } else if (t === 21) {
            h.done = true;
            render(o.animate);
            nextHand();
          }
          render(o.animate);
          await wait(450, o);
        },
        async stand(p, o) {
          requirePhase('player', 'スタンドできるのは自分の番だけです');
          S.hands[S.active].done = true;
          nextHand();
          ctx.sfx('tap');
          render(false);
          await wait(250, o);
        },
        async split(p, o) {
          requirePhase('player', 'スプリットできるのは自分の番だけです');
          const h = S.hands[S.active];
          if (h.cards.length !== 2 || cardValue(h.cards[0].rank) !== cardValue(h.cards[1].rank)) {
            throw new Error('スプリットできるのは、最初の2枚が同じ数字のときだけです(山札の順番を確認してください)');
          }
          if (S.chips < h.bet) throw new Error('スプリットに必要なチップが足りません');
          S.chips -= h.bet;
          const second = { cards: [h.cards.pop()], bet: h.bet, done: false, result: null };
          S.hands.splice(S.active + 1, 0, second);
          ctx.sfx('chip');
          render(o.animate);
          await wait(450, o);
          for (const hand of [h, second]) {
            hand.cards.push(draw());
            ctx.sfx('card');
            render(o.animate);
            await wait(400, o);
          }
          // 21になった手は自動でスタンド
          [h, second].forEach((hand) => { if (handTotal(hand.cards).total === 21) hand.done = true; });
          nextHand();
          render(false);
        },
        async reveal(p, o) {
          if (!S.dealer.length) throw new Error('ディーラーにカードが配られていません');
          if (S.phase === 'player') throw new Error('まだ自分の番が終わっていません(スタンドかバーストの後にめくります)');
          S.dealer.forEach((d) => { d.hidden = false; });
          S.phase = 'dealer';
          ctx.sfx('flip');
          render(o.animate);
          await wait(500, o);
        },
        async dealer_play(p, o) {
          if (!S.dealer.length) throw new Error('ディーラーにカードが配られていません');
          if (S.phase === 'player') throw new Error('まだ自分の番が終わっていません');
          if (S.dealer.some((d) => d.hidden)) await performers.reveal(p, o);
          const allBust = S.hands.every((h) => handTotal(h.cards).total > 21);
          if (allBust) return;
          while (handTotal(S.dealer.map((d) => d.card)).total < 17) {
            S.dealer.push({ card: draw(), hidden: false });
            ctx.sfx('card');
            render(o.animate);
            await wait(550, o);
          }
          const dt = handTotal(S.dealer.map((d) => d.card)).total;
          if (dt > 21) { showBanner('ディーラー バースト', 'win'); await wait(500, o); }
        },
        async settle(p, o) {
          if (!S.hands.length) throw new Error('勝敗を決める手札がありません');
          if (S.phase === 'player') throw new Error('まだ自分の番が終わっていません');
          S.dealer.forEach((d) => { d.hidden = false; });
          const dt = handTotal(S.dealer.map((d) => d.card)).total;
          const dealerBJ = S.dealer.length === 2 && dt === 21;
          let won = 0;
          let lost = 0;
          S.hands.forEach((h) => {
            const t = handTotal(h.cards).total;
            const playerBJ = S.hands.length === 1 && h.cards.length === 2 && t === 21;
            if (t > 21) { h.result = 'bust'; lost++; }
            else if (playerBJ && !dealerBJ) { h.result = 'blackjack'; S.chips += Math.floor(h.bet * 2.5); won++; }
            else if (dt > 21 || t > dt) { h.result = 'win'; S.chips += h.bet * 2; won++; }
            else if (t === dt) { h.result = 'push'; S.chips += h.bet; }
            else { h.result = 'lose'; lost++; }
          });
          S.phase = 'settled';
          if (won && !lost) showBanner('あなたの勝ち!', 'win');
          else if (lost && !won) showBanner('ディーラーの勝ち', 'lose');
          else if (won && lost) showBanner('1勝1敗', '');
          else showBanner('引き分け', '');
          ctx.sfx(won > lost ? 'win' : (lost > won ? 'lose' : 'tap'));
          render(o.animate);
          await wait(700, o);
        },
        async clear(p, o) {
          S.dealer = [];
          S.hands = [];
          S.pendingBet = 0;
          S.active = 0;
          S.phase = 'betting';
          showBanner('');
          ctx.sfx('card');
          render(false);
          await wait(300, o);
        }
      };

      render(false);

      return {
        async perform(actionId, params, o) {
          const fn = performers[actionId];
          if (!fn) throw new Error('この盤面にない動きです:' + actionId);
          await fn(params || {}, o || { animate: true, speed: 1 });
        },
        target(id) {
          return root.querySelector('[data-target="' + id + '"]');
        },
        setInput(handler) {
          S.inputHandler = handler;
          root.classList.toggle('bj-input', !!handler);
        },
        state() { return JSON.parse(JSON.stringify({ chips: S.chips, phase: S.phase, drawIndex: S.drawIndex })); },
        destroy() { root.innerHTML = ''; }
      };
    }
  };

  window.CasinoGames = window.CasinoGames || {};
  window.CasinoGames.blackjack = BlackjackGame;
})();
