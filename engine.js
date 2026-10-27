/*
 * engine.js — チュートリアル再生エンジン
 * スマホ用ページと作成ツールのプレビューの両方でこのファイルを使う。
 *
 * ステップの種類
 *   text  … 説明テキストを出す(タップで次へ / 自動で次へ)
 *   demo  … 見本の動きを盤面で自動実行する(指マークで操作を示せる)
 *   input … 来場者に操作させる。正しい操作をするまで先へ進まない
 */
(function () {
  'use strict';

  const SPEEDS = { slow: 0.6, normal: 1, fast: 1.6 };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  class TutorialRunner {
    /**
     * @param {HTMLElement} root
     * @param {object} tutorial  チュートリアルのデータ
     * @param {object} options   { startAt, preview, skipIntro }
     */
    constructor(root, tutorial, options) {
      this.root = root;
      this.t = tutorial;
      this.opt = options || {};
      this.stopped = false;
      this.sound = window.CasinoSound;
      const def = (window.CasinoGames || {})[tutorial.game];
      if (!def) throw new Error('このページは「' + tutorial.game + '」にまだ対応していません');
      this.def = def;
      this.build();
    }

    build() {
      const r = this.root;
      r.innerHTML = '';
      r.classList.add('tp-root');

      this.header = el('div', 'tp-header');
      this.titleEl = el('div', 'tp-title', this.t.title || '');
      this.progress = el('div', 'tp-progress');
      this.progressBar = el('div', 'tp-progress-bar');
      this.progress.append(this.progressBar);
      this.muteBtn = el('button', 'tp-mute');
      this.muteBtn.type = 'button';
      this.muteBtn.setAttribute('aria-label', '音のオン/オフ');
      this.updateMute();
      this.muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sound.unlock();
        this.sound.setMuted(!this.sound.isMuted());
        this.updateMute();
      });
      this.header.append(this.titleEl, this.muteBtn, this.progress);

      this.stage = el('div', 'tp-stage');
      this.board = el('div', 'tp-board');
      this.stage.append(this.board);

      // スポットライト・指マーク・タップ受け・テキスト
      this.spot = el('div', 'tp-spot');
      this.finger = el('div', 'tp-finger');
      this.finger.innerHTML = '<span class="tp-finger-ring"></span><span class="tp-finger-hand">👆</span>';
      this.catcher = el('div', 'tp-catcher');
      this.textbox = el('div', 'tp-textbox');
      this.textEl = el('div', 'tp-text');
      this.nextMark = el('div', 'tp-next', '▼');
      this.textbox.append(this.textEl, this.nextMark);
      this.stage.append(this.spot, this.finger, this.catcher, this.textbox);

      r.append(this.header, this.stage);

      this.game = this.def.create(this.board, this.t.setup || {}, {
        sfx: (name) => this.sound.sfx(name)
      });

      this.onResize = () => this.placeSpot();
      window.addEventListener('resize', this.onResize);
      this.tapResolver = null;
      this.onRootClick = (e) => this.handleRootClick(e);
      r.addEventListener('click', this.onRootClick, true);
    }

    updateMute() {
      this.muteBtn.textContent = this.sound.isMuted() ? '🔇' : '🔊';
    }

    // ---------- 画面の開始と終了 ----------
    showIntro() {
      return new Promise((resolve) => {
        const ov = el('div', 'tp-cover');
        const box = el('div', 'tp-cover-box');
        box.append(el('div', 'tp-cover-game', this.def.name));
        box.append(el('h1', 'tp-cover-title', this.t.title || ''));
        if (this.t.description) box.append(el('p', 'tp-cover-desc', this.t.description));
        const steps = (this.t.steps || []).length;
        const minutes = Math.max(1, Math.round(steps * 8 / 60));
        box.append(el('p', 'tp-cover-meta', '目安 約' + minutes + '分 ・ 音が出ます(右上で消せます)'));
        const btn = el('button', 'tp-cover-btn', 'はじめる');
        btn.type = 'button';
        btn.addEventListener('click', () => {
          this.sound.unlock();
          this.sound.sfx('tap');
          ov.remove();
          resolve();
        });
        box.append(btn);
        ov.append(box);
        this.root.append(ov);
      });
    }

    showOutro() {
      const ov = el('div', 'tp-cover tp-cover-end');
      const box = el('div', 'tp-cover-box');
      box.append(el('div', 'tp-cover-game', this.def.name));
      box.append(el('h1', 'tp-cover-title', 'おつかれさまでした!'));
      box.append(el('p', 'tp-cover-desc', this.t.endMessage || 'ルールがわかったら、実際のテーブルで遊んでみてください。'));
      const again = el('button', 'tp-cover-btn', 'もう一度見る');
      again.type = 'button';
      again.addEventListener('click', () => { ov.remove(); this.restart(); });
      box.append(again);
      ov.append(box);
      this.root.append(ov);
      this.sound.sfx('win');
    }

    restart() {
      this.stop();
      const fresh = new TutorialRunner(this.root, this.t, Object.assign({}, this.opt, { startAt: 0, skipIntro: true }));
      if (this.opt.onRestart) this.opt.onRestart(fresh);
      fresh.start();
    }

    stop() {
      this.stopped = true;
      this.sound.stopBgm();
      window.removeEventListener('resize', this.onResize);
      this.root.removeEventListener('click', this.onRootClick, true);
      this.tapResolver = null;
      if (this.typeTimer) clearInterval(this.typeTimer);
      if (this.spotTimer) clearInterval(this.spotTimer);
      if (this.game) this.game.setInput(null);
    }

    // ---------- 実行 ----------
    async start() {
      const steps = this.t.steps || [];
      const startAt = Math.max(0, Math.min(this.opt.startAt || 0, steps.length));
      if (!this.opt.skipIntro && startAt === 0) await this.showIntro();
      if (this.stopped) return;
      this.sound.bgm(this.t.bgm || 'none');

      // 途中から再生するときは、それまでの盤面の動きを一瞬で済ませる
      for (let i = 0; i < startAt; i++) {
        const s = steps[i];
        if ((s.type === 'demo' || s.type === 'input') && s.action) {
          try { await this.game.perform(s.action, s.params, { animate: false }); } catch (e) { /* 途中の失敗は無視 */ }
        }
      }

      for (let i = startAt; i < steps.length; i++) {
        if (this.stopped) return;
        this.setProgress(i, steps.length);
        if (this.opt.onStep) this.opt.onStep(i);
        try {
          await this.runStep(steps[i]);
        } catch (e) {
          if (this.stopped) return;
          await this.showError(e, i);
        }
      }
      if (this.stopped) return;
      this.setProgress(steps.length, steps.length);
      this.clearSpot();
      this.hideText();
      this.showOutro();
      if (this.opt.onEnd) this.opt.onEnd();
    }

    setProgress(i, n) {
      this.progressBar.style.width = (n ? (i / n) * 100 : 0) + '%';
    }

    async runStep(s) {
      if (s.type === 'text') return this.runText(s);
      if (s.type === 'demo') return this.runDemo(s);
      if (s.type === 'input') return this.runInput(s);
    }

    /** 強調する場所:ステップで選んだ場所 → ゲームが決める場所(賭け先のマスなど)→ 動きの標準 */
    targetOf(s, a) {
      if (s.highlight) return s.highlight;
      const t = this.def.targetFor ? this.def.targetFor(s.action, s.params || {}) : null;
      return t || a.target;
    }

    actionDef(id) {
      return (this.def.actions || []).find((a) => a.id === id) || null;
    }

    playStepSound(s, fallback) {
      const name = s.sound && s.sound !== 'auto' ? s.sound : fallback;
      if (name && name !== 'none' && name !== 'auto') this.sound.sfx(name);
    }

    async runText(s) {
      this.setSpot(s.highlight);
      this.playStepSound(s, 'page');
      const typing = this.typeText(s.text || '', s.position, s.highlight);
      if (s.advance === 'auto') {
        const secs = Math.max(0.5, Number(s.seconds) || 3);
        await Promise.race([Promise.all([typing.done, sleep(secs * 1000)]), this.waitTap(false)]);
        typing.finish();
      } else {
        this.nextMark.classList.add('tp-show');
        // 1回目のタップは文字送りを終わらせるだけ
        while (!typing.isDone()) {
          await Promise.race([typing.done, this.waitTap(true)]);
          typing.finish();
        }
        await this.waitTap(true);
        this.nextMark.classList.remove('tp-show');
        this.sound.sfx('tap');
      }
      this.clearSpot();
    }

    async runDemo(s) {
      const a = this.actionDef(s.action);
      if (!a) throw new Error('見本の動きが選ばれていません');
      const speed = SPEEDS[s.speed] || 1;
      const targetId = this.targetOf(s, a);
      if (s.text) this.typeText(s.text, s.position, targetId).finish();
      else this.hideText();
      this.catcher.classList.add('tp-block');
      if (s.finger) {
        this.setSpot(targetId);
        await this.moveFinger(targetId, speed);
        if (this.stopped) return;
      }
      await this.game.perform(s.action, s.params, { animate: true, speed });
      this.hideFinger();
      await sleep(250 / speed);
      this.clearSpot();
      this.catcher.classList.remove('tp-block');
    }

    runInput(s) {
      const a = this.actionDef(s.action);
      if (!a) return Promise.reject(new Error('操作させる動きが選ばれていません'));
      const targetId = this.targetOf(s, a);
      this.setSpot(targetId, true);
      const say = this.def.inputLabel ? this.def.inputLabel(s.action, s.params || {}) : null;
      const prompt = s.text || (say ? say + 'をしてみましょう' : a.label + 'をしてみましょう');
      this.typeText(prompt, s.position, targetId).finish();
      this.textbox.classList.add('tp-prompt');
      this.catcher.classList.remove('tp-block');
      return new Promise((resolve, reject) => {
        let busy = false;
        this.game.setInput(async (pressed, detail) => {
          if (busy || this.stopped) return;
          const ok = pressed === s.action &&
            (!this.def.matchInput || this.def.matchInput(s.action, s.params || {}, detail || {}));
          if (!ok) {
            this.sound.sfx('wrong');
            const hint = s.hint || ('ここでは「' + (say || a.label) + '」を選びましょう');
            this.typeText(hint, s.position, targetId).finish();
            this.textbox.classList.remove('tp-shake');
            void this.textbox.offsetWidth;
            this.textbox.classList.add('tp-shake');
            return;
          }
          busy = true;
          this.game.setInput(null);
          this.sound.sfx('correct');
          this.clearSpot();
          this.textbox.classList.remove('tp-prompt');
          this.hideText();
          try {
            await this.game.perform(s.action, s.params, { animate: true, speed: 1 });
            await sleep(200);
            resolve();
          } catch (e) { reject(e); }
        });
      });
    }

    async showError(e, i) {
      this.clearSpot();
      this.textbox.classList.add('tp-error');
      this.typeText('ステップ' + (i + 1) + 'を実行できませんでした:' + (e && e.message ? e.message : e), 'auto').finish();
      this.nextMark.classList.add('tp-show');
      await this.waitTap(true);
      this.nextMark.classList.remove('tp-show');
      this.textbox.classList.remove('tp-error');
    }

    // ---------- テキスト ----------
    typeText(text, position, targetId) {
      this.textbox.classList.add('tp-visible');
      this.textbox.classList.remove('tp-pos-top', 'tp-pos-bottom');
      this.textbox.classList.add('tp-pos-' + this.resolvePosition(position, targetId));
      const chars = Array.from(String(text));
      let i = 0;
      let finished = false;
      let resolveDone;
      const done = new Promise((r) => { resolveDone = r; });
      this.textEl.textContent = '';
      if (this.typeTimer) clearInterval(this.typeTimer);
      const finish = () => {
        if (finished) return;
        finished = true;
        clearInterval(this.typeTimer);
        this.textEl.textContent = chars.join('');
        resolveDone();
      };
      this.typeTimer = setInterval(() => {
        if (this.stopped) { finish(); return; }
        i += 2;
        this.textEl.textContent = chars.slice(0, i).join('');
        if (i >= chars.length) finish();
      }, 28);
      return { done, finish, isDone: () => finished };
    }

    hideText() {
      if (this.typeTimer) clearInterval(this.typeTimer);
      this.textbox.classList.remove('tp-visible', 'tp-prompt');
      this.nextMark.classList.remove('tp-show');
    }

    /** 強調する場所と重ならない位置(上 / 下)を選ぶ */
    resolvePosition(position, targetId) {
      if (position === 'top' || position === 'bottom') return position;
      const t = targetId && this.game.target(targetId);
      if (!t) return 'bottom';
      const sr = this.stage.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const center = tr.top + tr.height / 2 - sr.top;
      return center > sr.height * 0.5 ? 'top' : 'bottom';
    }

    /** 画面のどこかがタップされるまで待つ(同時に待てるのは1つだけ) */
    waitTap(block) {
      return new Promise((resolve) => {
        if (block) this.catcher.classList.add('tp-block');
        // 直前のタップを拾わないよう少し待ってから受け付ける
        setTimeout(() => {
          this.tapResolver = () => {
            if (block) this.catcher.classList.remove('tp-block');
            resolve();
          };
        }, 60);
      });
    }

    handleRootClick(e) {
      if (e.target.closest && e.target.closest('.tp-mute, .tp-cover')) return;
      const r = this.tapResolver;
      this.tapResolver = null;
      if (r) r();
    }

    // ---------- スポットライトと指マーク ----------
    setSpot(targetId, pulse) {
      this.spotTarget = targetId || null;
      this.spot.classList.toggle('tp-pulse', !!pulse);
      this.placeSpot();
      if (this.spotTimer) clearInterval(this.spotTimer);
      if (this.spotTarget) this.spotTimer = setInterval(() => this.placeSpot(), 200);
    }

    clearSpot() {
      this.spotTarget = null;
      if (this.spotTimer) clearInterval(this.spotTimer);
      this.spot.classList.remove('tp-show', 'tp-pulse');
    }

    placeSpot() {
      const t = this.spotTarget && this.game.target(this.spotTarget);
      if (!t) { this.spot.classList.remove('tp-show'); return; }
      const sr = this.stage.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const pad = 6;
      Object.assign(this.spot.style, {
        left: (tr.left - sr.left - pad) + 'px',
        top: (tr.top - sr.top - pad) + 'px',
        width: (tr.width + pad * 2) + 'px',
        height: (Math.max(tr.height, 24) + pad * 2) + 'px'
      });
      this.spot.classList.add('tp-show');
    }

    async moveFinger(targetId, speed) {
      const t = this.game.target(targetId);
      if (!t) return;
      const sr = this.stage.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const x = tr.left - sr.left + tr.width / 2;
      const y = tr.top - sr.top + tr.height / 2;
      const f = this.finger;
      f.style.transition = 'none';
      f.style.transform = 'translate(' + (sr.width * 0.7) + 'px,' + (sr.height * 0.95) + 'px)';
      f.classList.add('tp-show');
      void f.offsetWidth;
      const ms = 700 / speed;
      f.style.transition = 'transform ' + ms + 'ms cubic-bezier(.3,.7,.3,1)';
      f.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      await sleep(ms + 80);
      f.classList.remove('tp-tap');
      void f.offsetWidth;
      f.classList.add('tp-tap');
      this.sound.sfx('tap');
      await sleep(380 / speed);
    }

    hideFinger() {
      this.finger.classList.remove('tp-show', 'tp-tap');
    }
  }

  /**
   * 作成ツール用:ステップを画面に出さずに最後まで実行し、問題のあるステップを探す
   * 戻り値: [{ index, message }]
   */
  async function dryRun(tutorial) {
    const problems = [];
    const def = (window.CasinoGames || {})[tutorial.game];
    if (!def) return [{ index: -1, message: 'ゲームが選ばれていません' }];
    (def.validateSetup ? def.validateSetup(tutorial.setup || {}) : []).forEach((m) => problems.push({ index: -1, message: m }));
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-9999px;top:0;width:360px;height:640px;visibility:hidden;';
    document.body.append(box);
    const game = def.create(box, tutorial.setup || {}, { sfx() {} });
    const steps = tutorial.steps || [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.type === 'text') {
        if (!String(s.text || '').trim()) problems.push({ index: i, message: '本文が空です' });
        continue;
      }
      const a = (def.actions || []).find((x) => x.id === s.action);
      if (!a) { problems.push({ index: i, message: '動きが選ばれていません' }); continue; }
      if (s.type === 'input' && !a.input) { problems.push({ index: i, message: '「' + a.label + '」は来場者に操作させられません。見本にしてください' }); continue; }
      try {
        await game.perform(s.action, s.params, { animate: false });
      } catch (e) {
        problems.push({ index: i, message: e.message || String(e) });
      }
    }
    game.destroy();
    box.remove();
    return problems;
  }

  window.TutorialRunner = TutorialRunner;
  window.TutorialDryRun = dryRun;
})();
