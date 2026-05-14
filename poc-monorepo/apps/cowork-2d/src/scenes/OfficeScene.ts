/**
 * @file OfficeScene.ts
 *
 * Escena demo del POC. Genera procedural:
 *   - Suelo principal con un tipo "concrete" + parches decorativos
 *   - Algunos "desks" (rectángulos) y un "monitor"
 *   - Player circle controlable con WASD/flechas
 *   - Cámara top-down que sigue al player con smoothing
 *   - Físicas Arcade: player vs desks (collision rectangles)
 *
 * No usa assets externos — todo `Graphics` primitives. Demuestra arquitectura.
 *
 * Docs:
 *  - Scene lifecycle:        https://docs.phaser.io/api-documentation/class/scene
 *  - Arcade Physics:         https://docs.phaser.io/api-documentation/namespace/physics-arcade
 *  - Cameras follow:         https://docs.phaser.io/api-documentation/class/cameras-scene2d-camera
 *  - Input.Keyboard:         https://docs.phaser.io/api-documentation/class/input-keyboard-keyboardplugin
 */
import Phaser from 'phaser';
import { EventBus } from '../EventBus';
import { FloorType, FLOOR_TYPE_COLORS, type Rect } from '@cowork/core-shared';

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const PLAYER_SPEED = 220; // px/s
const TILE_SIZE = 64;

interface DeskRect extends Rect {
  /** Color del desk para distinguirlos visualmente. */
  tint: number;
}

export class OfficeScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

  constructor() {
    super({ key: 'OfficeScene' });
  }

  preload() {
    // Sin assets externos en POC.
  }

  create() {
    this.physics.world.setBounds(-WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(-WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setZoom(1);

    this.drawFloor();
    this.drawDecorativeFloors();
    const desks = this.drawDesks();

    // ── Player ────────────────────────────────────────────────────────────
    this.player = this.add.circle(0, 0, 14, 0xfacc15);
    this.player.setStrokeStyle(2, 0xb45309);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCircle(14);
    this.playerBody.setCollideWorldBounds(true);
    this.playerBody.setDamping(true);
    this.playerBody.setDrag(0.0001);

    // ── Colliders con desks ──────────────────────────────────────────────
    desks.forEach((rect) => {
      const deskBody = this.add.rectangle(rect.centroX, rect.centroY, rect.ancho, rect.alto, rect.tint);
      this.physics.add.existing(deskBody, true); // true = static body
      this.physics.add.collider(this.player, deskBody);
    });

    // ── Inputs ───────────────────────────────────────────────────────────
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard plugin not available');
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as typeof this.wasd;

    // ── Cámara sigue al player con lerp suave ───────────────────────────
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    EventBus.emit('scene-ready', { sceneKey: this.scene.key });
  }

  update() {
    if (!this.playerBody) return;

    const left  = this.cursors.left.isDown  || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up    = this.cursors.up.isDown    || this.wasd.W.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.S.isDown;

    let vx = 0, vy = 0;
    if (left) vx -= 1;
    if (right) vx += 1;
    if (up) vy -= 1;
    if (down) vy += 1;

    // Normalizar diagonal (evita bonus de velocidad en 45°)
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      vx *= inv; vy *= inv;
    }

    this.playerBody.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);

    EventBus.emit('player-position', { x: this.player.x, y: this.player.y });
  }

  // ─── Helpers de dibujo procedural ────────────────────────────────────────

  private drawFloor() {
    const baseColor = parseInt(FLOOR_TYPE_COLORS[FloorType.CONCRETE_SMOOTH].slice(1), 16);
    const g = this.add.graphics();
    g.fillStyle(baseColor, 1);
    g.fillRect(-WORLD_WIDTH / 2, -WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT);

    // Grilla tenue para dar sensación de tiles
    g.lineStyle(1, 0x000000, 0.08);
    for (let x = -WORLD_WIDTH / 2; x <= WORLD_WIDTH / 2; x += TILE_SIZE) {
      g.lineBetween(x, -WORLD_HEIGHT / 2, x, WORLD_HEIGHT / 2);
    }
    for (let y = -WORLD_HEIGHT / 2; y <= WORLD_HEIGHT / 2; y += TILE_SIZE) {
      g.lineBetween(-WORLD_WIDTH / 2, y, WORLD_WIDTH / 2, y);
    }
    g.setDepth(-100);
  }

  private drawDecorativeFloors() {
    // Demo: pisos decorativos como en la feature recién pusheada en v3.7.
    const overlays: Array<{ rect: Rect; color: number }> = [
      { rect: { centroX: -200, centroY: -200, ancho: 320, alto: 240 }, color: parseInt(FLOOR_TYPE_COLORS[FloorType.WOOD_OAK].slice(1), 16) },
      { rect: { centroX: 250,  centroY: -150, ancho: 280, alto: 280 }, color: parseInt(FLOOR_TYPE_COLORS[FloorType.CARPET_OFFICE].slice(1), 16) },
      { rect: { centroX: -100, centroY: 250,  ancho: 480, alto: 200 }, color: parseInt(FLOOR_TYPE_COLORS[FloorType.STONE_PATH_GARDEN].slice(1), 16) },
    ];
    const g = this.add.graphics();
    for (const o of overlays) {
      g.fillStyle(o.color, 0.85);
      g.fillRect(
        o.rect.centroX - o.rect.ancho / 2,
        o.rect.centroY - o.rect.alto / 2,
        o.rect.ancho,
        o.rect.alto,
      );
    }
    g.setDepth(-50);
  }

  private drawDesks(): DeskRect[] {
    // 4 desks "Gather-style" como obstáculos sólidos.
    const desks: DeskRect[] = [
      { centroX: -150, centroY: -180, ancho: 100, alto: 60, tint: 0x8b5e3c },
      { centroX:  150, centroY: -180, ancho: 100, alto: 60, tint: 0x8b5e3c },
      { centroX: -150, centroY:   60, ancho: 100, alto: 60, tint: 0x8b5e3c },
      { centroX:  150, centroY:   60, ancho: 100, alto: 60, tint: 0x8b5e3c },
    ];
    // El render real lo hace el caller (que también crea el body físico).
    return desks;
  }
}
