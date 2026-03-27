import { Subfloor, FloorType } from '../../domain/entities';

export interface ISubfloorRepository {
  save(subfloor: Omit<Subfloor, 'id'>): Promise<Subfloor>;
  delete(id: string): Promise<boolean>;
  findByFloorId(floorId: string): Promise<Subfloor[]>;
}

export class CreateSubfloorUseCase {
  constructor(private subfloorRepository: ISubfloorRepository) {}

  async execute(params: {
    floorId: string;
    name: string;
    width: number;
    depth: number;
    x: number;
    y: number;
    z?: number;
    floorType?: FloorType;
    color?: string;
    opacity?: number;
  }): Promise<Subfloor> {
    
    // Validación de Dominio Básica (Ejemplo, no permitir dimensiones negativas)
    if (params.width <= 0 || params.depth <= 0) {
      throw new Error("Las dimensiones del subpiso deben ser positivas.");
    }

    const subfloorToCreate: Omit<Subfloor, 'id'> = {
      floorId: params.floorId,
      name: params.name,
      dimensions: { width: params.width, depth: params.depth },
      position: { x: params.x, y: params.y, z: params.z || 0 },
      floorType: params.floorType,
      appearance: { 
        color: params.color,
        opacity: params.opacity 
      }
    };

    // Llamado a puerto de salida (Infrastructure)
    return await this.subfloorRepository.save(subfloorToCreate);
  }
}
