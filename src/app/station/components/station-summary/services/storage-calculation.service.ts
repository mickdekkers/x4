import { Injectable } from '@angular/core';
import { StationModule } from '../../../../shared/services/model/model';
import { StationModuleModel, StationResourceModel } from '../../station-calculator.model';
import { StorageNeeds, StorageWareDetail, StorageModuleRecommendation, RecommendedModule, StorageCargoGroup, StorageWareRow } from '../interfaces/storage-requirement';
import { StorageConfiguration } from '../models/storage-configuration';
import { ModuleService } from '../../../../shared/services/module.service';
import { WareService } from '../../../../shared/services/ware.service';
import { ModuleTypes } from '../../../../shared/services/data/module-types-data';
import { CargoTypes } from '../../../../shared/services/data/cargo-types-data';
import { TransportType } from '../../../../shared/services/data/transport-data';
import { Races } from '../../../../shared/services/data/race-data';

@Injectable()
export class StorageCalculationService {

  constructor(private moduleService: ModuleService) {}

  calculateStorageNeeds(
    resources: StationResourceModel[],
    config: StorageConfiguration
  ): StorageNeeds[] {
    const needs: StorageNeeds[] = [];

    // Group by cargo type and ware flow type
    const storageByType = new Map<string, Map<string, StorageWareDetail[]>>();

    resources.forEach(resource => {
      const wareType = this.determineWareType(resource);
      const cargoType = this.mapTransportToCargoType(resource.ware.transport);
      const hours = this.getHoursForWareType(wareType, config);

      if (!storageByType.has(cargoType)) {
        storageByType.set(cargoType, new Map());
      }

      if (!storageByType.get(cargoType).has(wareType)) {
        storageByType.get(cargoType).set(wareType, []);
      }

      const hourlyAmount = Math.abs(resource.amount);
      const volume = resource.ware.volume * hourlyAmount * hours;

      storageByType.get(cargoType).get(wareType).push({
        ware: resource.ware,
        volume: volume,
        hourlyAmount: hourlyAmount
      });
    });

    // Convert to StorageNeeds objects
    storageByType.forEach((wareTypes, cargoType) => {
      wareTypes.forEach((wares, wareType) => {
        if (wares.length > 0) {
          const totalVolume = wares.reduce((sum, ware) => sum + ware.volume, 0);

          needs.push({
            wareType: wareType as 'input' | 'output',
            cargoType: cargoType,
            totalVolume: totalVolume,
            wares: wares
          });
        }
      });
    });

    return needs;
  }

  calculateStorageRecommendations(
    needs: StorageNeeds[],
    existingModules: StationModuleModel[],
    factionId?: string,
    sizeFilter?: {small: boolean, medium: boolean, large: boolean}
  ): StorageModuleRecommendation[] {
    const recommendations: StorageModuleRecommendation[] = [];

    // Group needs by cargo type
    const needsByCargoType = new Map<string, number>();
    needs.forEach(need => {
      const current = needsByCargoType.get(need.cargoType) || 0;
      needsByCargoType.set(need.cargoType, current + need.totalVolume);
    });

    // Calculate existing storage capacity
    const existingCapacity = this.calculateExistingStorageCapacity(existingModules);

    needsByCargoType.forEach((neededVolume, cargoType) => {
      const availableVolume = existingCapacity.get(cargoType) || 0;
      const shortfall = Math.max(0, neededVolume - availableVolume);

      if (shortfall > 0) {
        const recommendedModules = this.getRecommendedStorageModules(cargoType, shortfall, factionId, sizeFilter);

        recommendations.push({
          cargoType: cargoType,
          neededVolume: neededVolume,
          availableVolume: availableVolume,
          shortfall: shortfall,
          recommendedModules: recommendedModules
        });
      }
    });

    return recommendations;
  }


  calculateStorageCargoGroups(
    resources: StationResourceModel[],
    config: StorageConfiguration,
    existingModules: StationModuleModel[],
    factionId?: string,
    sizeFilter?: {small: boolean, medium: boolean, large: boolean}
  ): StorageCargoGroup[] {
    const cargoGroups = new Map<string, StorageWareRow[]>();

    // Create individual ware rows
    resources.forEach(resource => {
      const wareType = this.determineWareType(resource);
      const cargoType = this.mapTransportToCargoType(resource.ware.transport);
      const hours = this.getHoursForWareType(wareType, config);

      const hourlyAmount = Math.abs(resource.amount);
      const volumePerHour = resource.ware.volume * hourlyAmount;
      const totalVolume = volumePerHour * hours;

      if (!cargoGroups.has(cargoType)) {
        cargoGroups.set(cargoType, []);
      }

      cargoGroups.get(cargoType).push({
        ware: resource.ware,
        wareType: wareType as 'input' | 'output',
        hourlyAmount: hourlyAmount,
        volumePerHour: volumePerHour,
        totalVolume: totalVolume,
        cargoType: cargoType
      });
    });

    // Calculate existing capacity
    const existingCapacity = this.calculateExistingStorageCapacity(existingModules);

    // Create cargo group objects with recommendations
    const groups: StorageCargoGroup[] = [];
    cargoGroups.forEach((wareRows, cargoType) => {
      const totalVolume = wareRows.reduce((sum, row) => sum + row.totalVolume, 0);
      const availableVolume = existingCapacity.get(cargoType) || 0;
      const shortfall = Math.max(0, totalVolume - availableVolume);

      const recommendedModules = shortfall > 0
        ? this.getRecommendedStorageModules(cargoType, shortfall, factionId, sizeFilter)
        : [];

      groups.push({
        cargoType: cargoType,
        wareRows: wareRows,
        totalVolume: totalVolume,
        recommendedModules: recommendedModules,
        shortfall: shortfall,
        availableVolume: availableVolume
      });
    });

    return groups;
  }

  private determineWareType(resource: StationResourceModel): string {
    const isProduced = resource.amount > 0;

    if (isProduced) {
      return 'output';
    } else {
      return 'input';
    }
  }

  private mapTransportToCargoType(transport: string): string {
    switch (transport) {
      case TransportType.container:
        return CargoTypes.container.id;
      case TransportType.liquid:
        return CargoTypes.liquid.id;
      case TransportType.solid:
        return CargoTypes.solid.id;
      default:
        return CargoTypes.container.id;
    }
  }

  private getHoursForWareType(wareType: string, config: StorageConfiguration): number {
    switch (wareType) {
      case 'input':
        return config.inputHours;
      case 'output':
        return config.outputHours;
      default:
        return 24;
    }
  }

  private calculateExistingStorageCapacity(modules: StationModuleModel[]): Map<string, number> {
    const capacity = new Map<string, number>();

    modules.forEach(module => {
      if (module.module && module.module.type === ModuleTypes.storage && module.module.cargo) {
        const cargoType = module.module.cargo.type.id;
        const moduleCapacity = module.module.cargo.max * module.count;
        const current = capacity.get(cargoType) || 0;
        capacity.set(cargoType, current + moduleCapacity);
      }
    });

    return capacity;
  }

  private getRecommendedStorageModules(cargoType: string, neededVolume: number, factionId?: string, sizeFilter?: {small: boolean, medium: boolean, large: boolean}): RecommendedModule[] {
    let storageModules = this.getFilteredStorageModules(cargoType, factionId, sizeFilter);

    const recommendations: RecommendedModule[] = [];

    if (storageModules.length === 0) {
      return recommendations;
    }

    // Sort by capacity (smallest first) for smart selection
    storageModules.sort((a, b) => a.cargo.max - b.cargo.max);

    // Try to find the smallest single module that can satisfy the entire requirement
    const singleModuleSolution = storageModules.find(module => module.cargo.max >= neededVolume);

    if (singleModuleSolution) {
      // Use the smallest module that can handle the entire requirement
      recommendations.push({
        moduleId: singleModuleSolution.id,
        moduleName: singleModuleSolution.name,
        capacity: singleModuleSolution.cargo.max,
        count: 1,
        totalCapacity: singleModuleSolution.cargo.max
      });
    } else {
      // No single module can handle it, use the largest available modules for efficiency
      // Sort by capacity (largest first) for multi-module scenarios
      storageModules.sort((a, b) => b.cargo.max - a.cargo.max);

      let remainingVolume = neededVolume;

      for (const module of storageModules) {
        if (remainingVolume <= 0) break;

        const moduleCount = Math.ceil(remainingVolume / module.cargo.max);
        const totalCapacity = moduleCount * module.cargo.max;

        recommendations.push({
          moduleId: module.id,
          moduleName: module.name,
          capacity: module.cargo.max,
          count: moduleCount,
          totalCapacity: totalCapacity
        });

        remainingVolume -= totalCapacity;
      }
    }

    return recommendations;
  }

  private getStorageModulesForCargoType(cargoType: string): StationModule[] {
    const allModules = this.moduleService.getEntities();
    return allModules.filter(module =>
      module.type === ModuleTypes.storage &&
      module.cargo &&
      module.cargo.type.id === cargoType
    );
  }

  public getFilteredStorageModules(cargoType: string, factionId?: string, sizeFilter?: {small: boolean, medium: boolean, large: boolean}): StationModule[] {
    let storageModules = this.getStorageModulesForCargoType(cargoType);

    // Apply faction filter if specified
    if (factionId) {
      storageModules = storageModules.filter(module => module.makerRace?.id === factionId);
    }

    // Apply size filter if specified
    if (sizeFilter) {
      storageModules = storageModules.filter(module => {
        if (sizeFilter.small && module.id.includes('_s_')) return true;
        if (sizeFilter.medium && module.id.includes('_m_')) return true;
        if (sizeFilter.large && module.id.includes('_l_')) return true;
        return false;
      });
    }

    return storageModules;
  }

  public getAvailableStorageFactions(): {id: string, name: string}[] {
    const allModules = this.moduleService?.getEntities();
    const storageModules = allModules.filter(module => module.type === ModuleTypes.storage);

    // Extract unique faction IDs from storage modules with null checks
    const factionIds = [...new Set(storageModules
    .filter(module => module.makerRace && module.makerRace.id)
    .map(module => module.makerRace.id))];

    // Map to faction objects and sort alphabetically
    const factions = factionIds
    .map(id => ({
        id: id,
        name: Races[id]?.name || id
    }))
    .filter(faction => faction.name) // Remove any that couldn't be mapped
    .sort((a, b) => a.name.localeCompare(b.name));

    return factions;
  }

  public addRecommendedModulesToStation(
    storageCargoGroups: StorageCargoGroup[],
    modules: StationModuleModel[],
    wareService: WareService,
    moduleService: ModuleService
  ): void {
    storageCargoGroups
      .filter(group => group.shortfall > 0)
      .forEach(group => {
        // Use the pre-calculated recommended modules from the display
        group.recommendedModules.forEach(recommendation => {
          // Check if this module type already exists in the station
          const existingModule = modules.find(m => m.moduleId === recommendation.moduleId);

          if (existingModule) {
            // Add to existing module count
            existingModule.count += recommendation.count;
          } else {
            // Create new module entry
            const newModule = new StationModuleModel(wareService, moduleService, recommendation.moduleId, recommendation.count);
            modules.push(newModule);
          }
        });
      });
  }
}
