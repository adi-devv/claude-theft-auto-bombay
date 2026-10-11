// Player money. Always a non-negative integer. Pure logic (bus = {emit}).
export class Economy {
  constructor(bus, money = 500) {
    this.bus = bus || null;
    this._money = Economy._int(money);
  }

  static _int(n) {
    const x = Math.round(Number(n));
    return Number.isFinite(x) ? Math.max(0, x) : 0;
  }

  get money() { return this._money; }

  _set(next, reason) {
    const delta = next - this._money;
    this._money = next;
    if (delta !== 0 && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('money:change', { money: next, delta, reason });
    }
    return delta;
  }

  /** Add (or, if negative, subtract) money; result never drops below 0. */
  add(n, reason = '') {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x) || x === 0) return this._money;
    this._set(Math.max(0, this._money + x), reason);
    return this._money;
  }

  /** Spend n; returns false (and changes nothing) when funds are insufficient. */
  spend(n, reason = 'spend') {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x) || x < 0 || x > this._money) return false;
    this._set(this._money - x, reason);
    return true;
  }

  /** Lose a fraction of current money (busted / wasted). Returns the amount lost. */
  penalty(fraction = 0.1, reason = 'penalty') {
    const f = Math.min(1, Math.max(0, Number(fraction) || 0));
    const loss = Math.floor(this._money * f);
    this._set(this._money - loss, reason);
    return loss;
  }

  /** Overwrite the balance (loading a save). */
  setMoney(n, reason = 'load') {
    this._set(Economy._int(n), reason);
    return this._money;
  }
}
