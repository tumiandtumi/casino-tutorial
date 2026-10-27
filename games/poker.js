/*
 * games/poker.js — ポーカーの盤面(テキサスホールデム、相手1人)
 * ゲームモジュールの形は blackjack.js と同じ。
 * 相手の動きは「相手の行動」ステップで決める(山札と同じく、毎回同じ展開にするため)。
 */
(function () {
  'use strict';

  const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const HAND_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ'];
  const STAGE_LABEL = { idle: '', preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー', done: '' };
  const MOVE_LABEL = { check: 'チェック', bet: 'ベット', call: 'コール', raise: 'レイズ', fold: 'フォールド' };

  function parseCard(code) {
    const c = String(code).trim().toUpperCase();
    const suit = c.slice(-1);
    const rank = c.slice(0, -1);
    if (!SUITS[suit] || RANKS.indexOf(rank) < 0) return null;
    return { code: rank + suit, rank, suit, v: RANKS.indexOf(rank) + 2 };
  }

  function parseDeck(text) {
    const parts = String(text || '').split(/[\s,、]+/).filter(Boolean);
    const cards = [];
    const errors = [];
    parts.forEach((p) => { const c = parseCard(p); if (c) cards.push(c); else errors.push(p); });
    return { cards, errors };
  }

  // ---------------- 役の判定 ----------------
  function compare(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  /** 枚数ごとにまとめた数字(多い順・強い順) */
  function groups(cards) {
    const m = {};
    cards.forEach((c) => { m[c.v] = (m[c.v] || 0) + 1; });
    return Object.keys(m).map((v) => ({ v: Number(v), n: m[v] })).sort((a, b) => b.n - a.n || b.v - a.v);
  }

  /** 5枚の強さ [役の番号, 強さの比べ方...] */
  function score5(cards) {
    const g = groups(cards);
    const flush = cards.every((c) => c.suit === cards[0].suit);
    const vals = [...new Set(cards.map((c) => c.v))].sort((a, b) => b - a);
    let straightHigh = 0;
    if (vals.length === 5) {
      if (vals[0] - vals[4] === 4) straightHigh = vals[0];
      else if (vals.join() === '14,5,4,3,2') straightHigh = 5;
    }
    const kick = g.map((x) => x.v);
    if (straightHigh && flush) return [8, straightHigh];
    if (g[0].n === 4) return [7].concat(kick);
    if (g[0].n === 3 && g[1].n === 2) return [6].concat(kick);
    if (flush) return [5].concat(cards.map((c) => c.v).sort((a, b) => b - a));
    if (straightHigh) return [4, straightHigh];
    if (g[0].n === 3) return [3].concat(kick);
    if (g[0].n === 2 && g[1].n === 2) return [2].concat(kick);
    if (g[0].n === 2) return [1].concat(kick);
    return [0].concat(kick);
  }

  /** 2〜7枚から一番強い組み合わせを探す */
  function bestHand(cards) {
    if (cards.length < 5) {
      const g = groups(cards);
      let cat = 0;
      if (g[0] && g[0].n === 4) cat = 7;
      else if (g[0] && g[0].n === 3) cat = 3;
      else if (g[0] && g[0].n === 2 && g[1] && g[1].n === 2) cat = 2;
      else if (g[0] && g[0].n === 2) cat = 1;
      return { score: [cat].concat(g.map((x) => x.v)), cards: cards.slice() };
    }
    let best = null;
    const n = cards.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
      const s = score5(five);
      if (!best || compare(s, best.score) > 0) best = { score: s, cards: five };
    }
    return best;
  }

  function handName(score) {
    if (score[0] === 8 && score[1] === 14) return 'ロイヤルストレートフラッシュ';
    return HAND_NAMES[score[0]];
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const PokerGame = {
    id: 'poker',
    name: 'ポーカー(テキサスホールデム)',

    targets: [
      { id: 'table', label: 'テーブル全体' },
      { id: 'opponent-hand', label: '相手の手札' },
      { id: 'opponent-chips', label: '相手のチップ' },
      { id: 'board', label: '場のカード(共通カード)' },
      { id: 'pot', label: 'ポット(賭けられたチップの合計)' },
      { id: 'player-hand', label: '自分の手札' },
      { id: 'player-rank', label: '自分のいまの役' },
      { id: 'chip-count', label: '持ちチップ' },
      { id: 'btn-check', label: 'チェックボタン' },
      { id: 'btn-bet', label: 'ベットボタン' },
      { id: 'btn-call', label: 'コールボタン' },
      { id: 'btn-raise', label: 'レイズボタン' },
      { id: 'btn-fold', label: 'フォールドボタン' }
    ],

    actions: [
      { id: 'blinds', label: 'ブラインド(最初の強制ベット)を出す', demo: true, input: false, target: 'pot', sound: 'chip',
        params: [
          { key: 'small', label: 'スモールブラインド', type: 'number', default: 5, min: 0 },
          { key: 'big', label: 'ビッグブラインド', type: 'number', default: 10, min: 0 },
          { key: 'player', label: '自分が出すのは', type: 'select', options: [['small', 'スモールブラインド'], ['big', 'ビッグブラインド']], default: 'small' }
        ] },
      { id: 'deal', label: '手札を配る(自分2枚・相手2枚)', demo: true, input: false, target: 'player-hand', sound: 'card', params: [] },
      { id: 'flop', label: 'フロップ(場に3枚)', demo: true, input: false, target: 'board', sound: 'card', params: [] },
      { id: 'turn', label: 'ターン(場に4枚目)', demo: true, input: false, target: 'board', sound: 'card', params: [] },
      { id: 'river', label: 'リバー(場に5枚目)', demo: true, input: false, target: 'board', sound: 'card', params: [] },
      { id: 'check', label: 'チェック(賭けずに回す)', demo: true, input: true, target: 'btn-check', sound: 'tap', params: [] },
      { id: 'bet', label: 'ベット(最初に賭ける)', demo: true, input: true, target: 'btn-bet', sound: 'chip',
        params: [{ key: 'amount', label: '賭ける額', type: 'number', default: 10, min: 1 }] },
      { id: 'call', label: 'コール(相手と同じ額を出す)', demo: true, input: true, target: 'btn-call', sound: 'chip', params: [] },
      { id: 'raise', label: 'レイズ(さらに上乗せする)', demo: true, input: true, target: 'btn-raise', sound: 'chip',
        params: [{ key: 'amount', label: '上乗せする額', type: 'number', default: 10, min: 1 }] },
      { id: 'fold', label: 'フォールド(降りる)', demo: true, input: true, target: 'btn-fold', sound: 'tap', params: [] },
      { id: 'opponent', label: '相手の行動', demo: true, input: false, target: 'opponent-hand', sound: 'chip',
        params: [
          { key: 'move', label: '相手がすること', type: 'select', options: [['check', 'チェック'], ['bet', 'ベット'], ['call', 'コール'], ['raise', 'レイズ'], ['fold', 'フォールド']], default: 'check' },
          { key: 'amount', label: '額(ベット・レイズのときだけ使う)', type: 'number', default: 10, min: 1 }
        ] },
      { id: 'showdown', label: 'ショーダウン(手札を見せて勝敗を決める)', demo: true, input: false, target: 'table', sound: 'auto', params: [] },
      { id: 'clear', label: '場を片付けて次のゲームへ', demo: true, input: false, target: 'table', sound: 'card', params: [] }
    ],

    setupFields: [
      { key: 'deck', label: '山札の順番', type: 'deck',
        help: '配る順に空白区切りで書きます。手札は 自分→相手→自分→相手、そのあとフロップ3枚・ターン1枚・リバー1枚。例:AH KD AS 7C QH JD 2S 9H 4C',
        default: 'AH KD AS 7C QH JD 2S 9H 4C' },
      { key: 'chips', label: '自分の最初のチップ', type: 'number', default: 100, min: 0 },
      { key: 'opponentChips', label: '相手の最初のチップ', type: 'number', default: 100, min: 0 }
    ],

    parseDeck,
    bestHand,
    handName,

    validateSetup(setup) {
      const msgs = [];
      const d = parseDeck(setup && setup.deck);
      if (d.errors.length) msgs.push('山札に読めないカードがあります:' + d.errors.join(' '));
      if (!d.cards.length) msgs.push('山札が空です');
      return msgs;
    },

    create(root, setup, ctx) {
      const opts = setup || {};
      const deck = parseDeck(opts.deck).cards;
      const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
      const S = {
        drawIndex: 0,
        stage: 'idle',
        board: [],
        pot: 0,
        currentBet: 0,
        p: { cards: [], chips: num(opts.chips, 100), street: 0, folded: false, said: '' },
        o: { cards: [], chips: num(opts.opponentChips, 100), street: 0, folded: false, said: '', hidden: true },
        best: null,
        inputHandler: null
      };

      root.innerHTML = '';
      const table = el('div', 'pk-table');
      table.dataset.target = 'table';

      // 相手
      const oppArea = el('div', 'pk-seat pk-opp');
      const oppHead = el('div', 'pk-seat-head');
      const oppName = el('span', 'bj-label', '相手');
      const oppChips = el('span', 'pk-chips');
      oppChips.dataset.target = 'opponent-chips';
      oppHead.append(oppName, oppChips);
      const oppHand = el('div', 'bj-hand pk-hand');
      oppHand.dataset.target = 'opponent-hand';
      const oppSaid = el('div', 'pk-said');
      const oppRank = el('div', 'pk-rank');
      oppArea.append(oppHead, oppHand, oppSaid, oppRank);

      // 場
      const center = el('div', 'pk-center');
      const stageLabel = el('div', 'pk-stage');
      const boardEl = el('div', 'pk-board');
      boardEl.dataset.target = 'board';
      const potEl = el('div', 'pk-pot');
      potEl.dataset.target = 'pot';
      const banner = el('div', 'bj-banner');
      center.append(stageLabel, boardEl, potEl, banner);

      // 自分
      const meArea = el('div', 'pk-seat pk-me');
      const meSaid = el('div', 'pk-said');
      const meHand = el('div', 'bj-hand pk-hand');
      meHand.dataset.target = 'player-hand';
      const meRank = el('div', 'pk-rank pk-rank-me');
      meRank.dataset.target = 'player-rank';
      const meChips = el('div', 'bj-chipcount');
      meChips.dataset.target = 'chip-count';
      meArea.append(meSaid, meHand, meRank, meChips);

      table.append(oppArea, center, meArea);

      const controls = el('div', 'bj-controls pk-controls');
      const buttons = {};
      ['check', 'bet', 'call', 'raise', 'fold'].forEach((id) => {
        const b = el('button', 'bj-btn', MOVE_LABEL[id]);
        b.type = 'button';
        b.dataset.target = 'btn-' + id;
        b.addEventListener('click', () => { if (S.inputHandler) S.inputHandler(id, {}); });
        buttons[id] = b;
        controls.append(b);
      });
      root.append(table, controls);

      // ---------- 描画 ----------
      let shown = { p: 0, o: 0, board: 0 };
      function cardEl(card, hidden, enter, best) {
        const c = el('div', 'bj-card' + (hidden ? ' bj-back' : '') + (enter ? ' bj-enter' : '') + (best ? ' pk-best' : ''));
        if (!hidden) {
          if (card.suit === 'H' || card.suit === 'D') c.classList.add('bj-red');
          c.append(el('span', 'bj-rank', card.rank), el('span', 'bj-suit', SUITS[card.suit]), el('span', 'bj-pip', SUITS[card.suit]));
        }
        return c;
      }
      const isBest = (card) => !!(S.best && S.best.indexOf(card) >= 0);

      function render(animate) {
        oppHand.innerHTML = '';
        S.o.cards.forEach((c, i) => oppHand.append(cardEl(c, S.o.hidden, animate && i >= shown.o, isBest(c))));
        meHand.innerHTML = '';
        S.p.cards.forEach((c, i) => meHand.append(cardEl(c, false, animate && i >= shown.p, isBest(c))));
        boardEl.innerHTML = '';
        for (let i = 0; i < 5; i++) {
          const c = S.board[i];
          boardEl.append(c ? cardEl(c, false, animate && i >= shown.board, isBest(c)) : el('div', 'pk-slot'));
        }
        shown = { p: S.p.cards.length, o: S.o.cards.length, board: S.board.length };

        oppChips.textContent = 'チップ ' + S.o.chips;
        meChips.textContent = '持ちチップ ' + S.p.chips;
        potEl.textContent = 'ポット ' + S.pot;
        stageLabel.textContent = STAGE_LABEL[S.stage] || '';
        oppSaid.textContent = S.o.said;
        meSaid.textContent = S.p.said;
        oppSaid.classList.toggle('pk-show', !!S.o.said);
        meSaid.classList.toggle('pk-show', !!S.p.said);

        meRank.textContent = S.p.cards.length ? 'いまの役:' + handName(bestHand(S.p.cards.concat(S.board)).score) : '';
        oppRank.textContent = (!S.o.hidden && S.o.cards.length) ? handName(bestHand(S.o.cards.concat(S.board)).score) : '';
      }

      function showBanner(text, kind) {
        banner.textContent = text || '';
        banner.className = 'bj-banner' + (text ? ' bj-show' : '') + (kind ? ' bj-banner-' + kind : '');
      }

      function wait(ms, o) {
        if (!o.animate) return Promise.resolve();
        return new Promise((r) => setTimeout(r, ms / (o.speed || 1)));
      }

      function draw() {
        if (S.drawIndex >= deck.length) throw new Error('山札のカードが足りません(' + (S.drawIndex + 1) + '枚目)。「山札の順番」にカードを足してください');
        return deck[S.drawIndex++];
      }

      function pay(side, amount) {
        const s = S[side];
        if (s.chips < amount) throw new Error((side === 'p' ? '自分' : '相手') + 'のチップが足りません');
        s.chips -= amount;
        s.street += amount;
        S.pot += amount;
      }

      const BETTING = ['preflop', 'flop', 'turn', 'river'];
      function requireBetting(side) {
        if (BETTING.indexOf(S.stage) < 0) throw new Error('いまは賭けの順番ではありません(手札を配った後に行います)');
        if (S.p.folded || S.o.folded) throw new Error('どちらかがフォールドしています。「ショーダウン」で終わらせてください');
      }

      /** 自分(p)・相手(o)の行動。ルールに合わない並びはエラーにして作成ツールで知らせる */
      function act(side, move, amount) {
        const s = S[side];
        const who = side === 'p' ? '自分' : '相手';
        requireBetting(side);
        const owe = S.currentBet - s.street;
        if (move === 'check') {
          if (owe > 0) throw new Error(who + 'は' + owe + '足りないのでチェックできません(コール・レイズ・フォールドのどれか)');
          s.said = 'チェック';
        } else if (move === 'bet') {
          if (S.currentBet > 0) throw new Error('すでに賭けがあるのでベットはできません。上乗せするなら「レイズ」です');
          const a = Math.max(1, Number(amount) || 10);
          pay(side, a);
          S.currentBet = s.street;
          s.said = 'ベット ' + a;
        } else if (move === 'call') {
          if (owe <= 0) throw new Error(who + 'がそろえる額がないのでコールできません(チェックかベットです)');
          pay(side, owe);
          s.said = 'コール ' + owe;
        } else if (move === 'raise') {
          if (S.currentBet <= 0) throw new Error('まだ誰も賭けていないのでレイズはできません。最初に賭けるなら「ベット」です');
          const a = Math.max(1, Number(amount) || 10);
          pay(side, owe + a);
          S.currentBet = s.street;
          s.said = 'レイズ +' + a;
        } else if (move === 'fold') {
          s.folded = true;
          s.said = 'フォールド';
        } else {
          throw new Error('相手の行動が選ばれていません');
        }
      }

      async function nextStreet(name, count, from, o) {
        if (S.stage !== from) {
          const need = { flop: 'プリフロップ(手札を配った後)', turn: 'フロップの後', river: 'ターンの後' }[name];
          throw new Error(STAGE_LABEL[name] + 'は' + need + 'にしか出せません');
        }
        if (S.p.folded || S.o.folded) throw new Error('どちらかがフォールドしています。「ショーダウン」で終わらせてください');
        if (S.p.street !== S.o.street) throw new Error('まだ賭け額がそろっていません(コールかフォールドが必要です)');
        S.p.street = 0;
        S.o.street = 0;
        S.currentBet = 0;
        S.p.said = '';
        S.o.said = '';
        S.stage = name;
        render(false);
        for (let i = 0; i < count; i++) {
          S.board.push(draw());
          ctx.sfx('card');
          render(o.animate);
          await wait(320, o);
        }
      }

      const performers = {
        async blinds(p, o) {
          if (S.stage !== 'idle' || S.p.cards.length) throw new Error('ブラインドは手札を配る前に出します');
          const small = Math.max(0, Number(p.small) || 0);
          const big = Math.max(0, Number(p.big) || 0);
          const meSmall = p.player !== 'big';
          pay('p', meSmall ? small : big);
          pay('o', meSmall ? big : small);
          S.currentBet = Math.max(S.p.street, S.o.street);
          S.p.said = (meSmall ? 'SB ' + small : 'BB ' + big);
          S.o.said = (meSmall ? 'BB ' + big : 'SB ' + small);
          ctx.sfx('chip');
          render(false);
          await wait(500, o);
        },
        async deal(p, o) {
          if (S.stage !== 'idle' || S.p.cards.length) throw new Error('手札は新しいゲームの最初にだけ配れます(前のゲームを「場を片付けて次のゲームへ」で終わらせてください)');
          showBanner('');
          for (const side of ['p', 'o', 'p', 'o']) {
            S[side].cards.push(draw());
            ctx.sfx('card');
            render(o.animate);
            await wait(300, o);
          }
          S.stage = 'preflop';
          render(false);
        },
        flop: (p, o) => nextStreet('flop', 3, 'preflop', o),
        turn: (p, o) => nextStreet('turn', 1, 'flop', o),
        river: (p, o) => nextStreet('river', 1, 'turn', o),
        async check(p, o) { act('p', 'check'); ctx.sfx('tap'); render(false); await wait(400, o); },
        async bet(p, o) { act('p', 'bet', p.amount); ctx.sfx('chip'); render(false); await wait(400, o); },
        async call(p, o) { act('p', 'call'); ctx.sfx('chip'); render(false); await wait(400, o); },
        async raise(p, o) { act('p', 'raise', p.amount); ctx.sfx('chip'); render(false); await wait(400, o); },
        async fold(p, o) { act('p', 'fold'); ctx.sfx('tap'); render(false); await wait(400, o); },
        async opponent(p, o) {
          await wait(250, o);
          act('o', p.move, p.amount);
          ctx.sfx(p.move === 'check' || p.move === 'fold' ? 'tap' : 'chip');
          render(false);
          await wait(600, o);
        },
        async showdown(p, o) {
          if (!S.p.cards.length) throw new Error('まだ手札が配られていません');
          if (S.stage === 'done') throw new Error('このゲームの勝敗はもう決まっています');
          let text;
          let kind = '';
          if (S.p.folded || S.o.folded) {
            const winner = S.p.folded ? S.o : S.p;
            winner.chips += S.pot;
            text = S.p.folded ? 'フォールドしたので相手の勝ち' : '相手がフォールド!あなたの勝ち';
            kind = S.p.folded ? 'lose' : 'win';
          } else {
            if (S.stage !== 'river') throw new Error('ショーダウンはリバーの後に行います(途中で終わるのはフォールドしたときだけ)');
            if (S.p.street !== S.o.street) throw new Error('まだ賭け額がそろっていません');
            S.o.hidden = false;
            ctx.sfx('flip');
            render(o.animate);
            await wait(600, o);
            const mine = bestHand(S.p.cards.concat(S.board));
            const theirs = bestHand(S.o.cards.concat(S.board));
            const d = compare(mine.score, theirs.score);
            if (d > 0) { S.p.chips += S.pot; S.best = mine.cards; text = handName(mine.score) + 'であなたの勝ち!'; kind = 'win'; }
            else if (d < 0) { S.o.chips += S.pot; S.best = theirs.cards; text = '相手の' + handName(theirs.score) + 'の勝ち'; kind = 'lose'; }
            else { const half = Math.floor(S.pot / 2); S.p.chips += half; S.o.chips += S.pot - half; S.best = mine.cards; text = '同じ強さで引き分け'; }
          }
          S.pot = 0;
          S.stage = 'done';
          showBanner(text, kind);
          ctx.sfx(kind === 'win' ? 'win' : (kind === 'lose' ? 'lose' : 'tap'));
          render(false);
          await wait(900, o);
        },
        async clear(p, o) {
          S.stage = 'idle';
          S.board = [];
          S.pot = 0;
          S.currentBet = 0;
          S.best = null;
          ['p', 'o'].forEach((k) => Object.assign(S[k], { cards: [], street: 0, folded: false, said: '' }));
          S.o.hidden = true;
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
  window.CasinoGames.poker = PokerGame;
})();
