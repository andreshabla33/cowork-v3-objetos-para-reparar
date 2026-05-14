/**
 * @file EventBus.ts
 *
 * Bridge React ↔ Phaser via Phaser.Events.EventEmitter. Patrón canónico
 * recomendado por el template oficial phaserjs/template-react-ts.
 *
 * Doc: https://docs.phaser.io/api-documentation/class/eventsetemitter
 */
import Phaser from 'phaser';

export const EventBus = new Phaser.Events.EventEmitter();

export type EventBusEvents = {
  'player-position': { x: number; y: number };
  'scene-ready': { sceneKey: string };
};
