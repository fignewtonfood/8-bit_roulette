import Phaser from 'phaser';
import { content } from '../data/index.js';
import { getSave, setSave } from '../engine/profile.js';
import { buy, levelOf, nextCost } from '../engine/run.js';
import { C, hex, label, onPress } from '../ui/machine.js';

// The shop: Up/Down to choose, Z or Space to buy, X to leave.
// What's for sale (and the prices) comes from src/data/shop.json.

const ROW_Y = 50;
const ROW_H = 22;

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create() {
    const W = this.scale.width;
    this.cameras.main.setBackgroundColor(C.bg);
    this.upgrades = Object.values(content.shop.upgrades);
    this.index = 0;

    label(this, W / 2, 14, 'THE SHOP', 16, C.gold);
    this.tokens = label(this, W - 8, 34, '', 8, C.gold, 1);

    const g = this.add.graphics();
    g.fillStyle(hex(C.cabinetDark)).fillRect(8, ROW_Y - 8, W - 16, this.upgrades.length * ROW_H + 6);

    this.cursor = this.add.rectangle(W / 2, 0, W - 20, ROW_H - 4, hex(C.cabinet)).setStrokeStyle(1, hex(C.gold));
    this.rows = this.upgrades.map((u, i) => {
      const y = ROW_Y + i * ROW_H;
      return {
        name: label(this, 16, y, u.short, 8, C.text, 0),
        pips: label(this, 132, y, '', 8, C.gold, 0),
        cost: label(this, W - 16, y, '', 8, C.text, 1),
      };
    });

    const infoY = ROW_Y + this.upgrades.length * ROW_H + 18;
    this.info = label(this, W / 2, infoY, '', 8, C.text);
    this.message = label(this, W / 2, 190, '', 8, C.gold);
    label(this, W / 2, 210, 'UP/DOWN CHOOSE   Z BUY   X LEAVE', 8, C.faint);

    onPress(this, ['UP'], () => this.move(-1), 0);
    onPress(this, ['DOWN'], () => this.move(1), 0);
    onPress(this, ['Z', 'SPACE', 'ENTER'], () => this.purchase());
    onPress(this, ['X', 'ESC'], () => this.scene.start('Hub'));

    this.refresh();
  }

  move(step) {
    this.index = (this.index + step + this.upgrades.length) % this.upgrades.length;
    this.message.setText('');
    this.refresh();
  }

  purchase() {
    const u = this.upgrades[this.index];
    const result = buy(content, getSave(), u.id);
    if (!result.ok) {
      this.message.setColor(C.warn).setText(result.reason);
      this.cameras.main.shake(80, 0.003);
      return;
    }
    setSave(result.save);
    const lv = levelOf(result.save, u.id);
    this.message.setColor(C.gold).setText(`${u.short}${u.costs.length > 1 ? ` ${'I'.repeat(lv)}` : ''} BOUGHT!`);
    this.cameras.main.flash(120, 242, 193, 78);
    this.refresh();
  }

  refresh() {
    const save = getSave();
    this.tokens.setText(`TOKENS ${save.tokens}`);
    this.upgrades.forEach((u, i) => {
      const lv = levelOf(save, u.id);
      const cost = nextCost(content, save, u.id);
      const row = this.rows[i];
      row.pips.setText('■'.repeat(lv) + '□'.repeat(Math.max(0, u.costs.length - lv)));
      row.cost.setText(cost === null ? 'MAXED' : `${cost}`);
      row.cost.setColor(cost === null ? C.faint : save.tokens >= cost ? C.gold : C.warn);
    });
    this.cursor.setY(ROW_Y + this.index * ROW_H);

    const u = this.upgrades[this.index];
    const lv = levelOf(save, u.id);
    // Show the line for the next level (or the last one once maxed).
    const desc = u.description.length > 1 && u.costs.length > 1
      ? u.description[Math.min(lv, u.description.length - 1)]
      : u.description.join('\n');
    this.info.setText(desc);
  }
}
