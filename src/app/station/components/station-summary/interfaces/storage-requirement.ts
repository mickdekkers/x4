import { Ware } from '../../../../shared/services/model/model';

export interface StorageNeeds {
  wareType: 'input' | 'output';
  cargoType: string;
  totalVolume: number;
  wares: StorageWareDetail[];
}

export interface StorageWareDetail {
  ware: Ware;
  volume: number;
  hourlyAmount: number;
}

export interface StorageModuleRecommendation {
  cargoType: string;
  neededVolume: number;
  availableVolume: number;
  shortfall: number;
  recommendedModules: RecommendedModule[];
}

export interface RecommendedModule {
  moduleId: string;
  moduleName: string;
  capacity: number;
  count: number;
  totalCapacity: number;
}

export interface StorageWareRow {
  ware: Ware;
  wareType: 'input' | 'output';
  hourlyAmount: number;
  volumePerHour: number;
  totalVolume: number;
  cargoType: string;
}

export interface StorageCargoGroup {
  cargoType: string;
  wareRows: StorageWareRow[];
  totalVolume: number;
  recommendedModules: RecommendedModule[];
  shortfall: number;
  availableVolume: number;
}