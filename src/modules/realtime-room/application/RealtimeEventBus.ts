import type { DataPacketByType, DataPacketContract, DataPacketType } from '../domain/types';

export interface RealtimeEventEnvelope<TPacket extends DataPacketContract = DataPacketContract> {
  packet: TPacket;
  participantIdentity?: string;
}

export type RealtimeEventListener<TType extends DataPacketType> = (
  event: RealtimeEventEnvelope<DataPacketByType<TType>>
) => void;

export class RealtimeEventBus {
  private listeners: Map<DataPacketType, Set<RealtimeEventListener<any>>> = new Map();
  private anyListeners: Set<(event: RealtimeEventEnvelope) => void> = new Set();

  on<TType extends DataPacketType>(type: TType, listener: RealtimeEventListener<TType>): () => void {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener as RealtimeEventListener<any>);
    this.listeners.set(type, current);
    return () => {
      current.delete(listener as RealtimeEventListener<any>);
      if (current.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  onAny(listener: (event: RealtimeEventEnvelope) => void): () => void {
    this.anyListeners.add(listener);
    return () => {
      this.anyListeners.delete(listener);
    };
  }

  emit<TPacket extends DataPacketContract>(packet: TPacket, participantIdentity?: string): void {
    const envelope: RealtimeEventEnvelope<TPacket> = {
      packet,
      participantIdentity,
    };

    const typedListeners = this.listeners.get(packet.type);
    typedListeners?.forEach((listener) => {
      listener(envelope);
    });

    this.anyListeners.forEach((listener) => {
      listener(envelope);
    });
  }

  clear(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
