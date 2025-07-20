import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { WareGroups } from '../../../shared/services/data/ware-groups-data';
import { WareService } from '../../../shared/services/ware.service';
import { ResourceCalculator, StationModuleModel } from '../station-calculator.model';
import { ResourcePriceType } from './enums/resource-price-type.enum';
import { ResourceAmount } from './interfaces/resource-amount';
import { ModuleCost } from './models/module-cost';
import { ModuleCostItem } from './models/module-cost-item';
import { ResourceSummary } from './models/resource-summary';
import { StationSummaryService } from './services/station-summary.service';
import { StorageCalculationService } from './services/storage-calculation.service';
import { StorageConfiguration } from './models/storage-configuration';
import { StorageNeeds, StorageModuleRecommendation, StorageCargoGroup } from './interfaces/storage-requirement';
import { ModuleService } from '../../../shared/services/module.service';

/**
 * The Station Summary component
 */
@Component({
   selector: 'app-station-summary',
   templateUrl: './station-summary.component.html',
})
export class StationSummaryComponent implements OnChanges {
   static basicResources = [ WareGroups.gases, WareGroups.minerals, WareGroups.ice ];

   expandState: { [key: string]: boolean } = {};

   provideBasicResources = false;
   provideAllResources = false;
   isHq = false;
   resourcesPrice = 50;
   productsPrice = 50;
   modulesResourcesPrice = 50;

   private _totalWorkforce = 0;
   totalWorkforceCapacity = 0;
   partialWorkforce = 0;
   autoWorkforce = true;

   workforceNeeded: { amount: number; name: string; count: number }[] = [];
   workforceCapacity: { amount: number; name: string; count: number }[] = [];

   resourcesNeeded: ResourceSummary[] = [];
   resourcesProduced: ResourceSummary[] = [];
   moduleCosts: ModuleCost[];

   totalModuleResourceCosts: ResourceAmount[] = [];

   // Storage-related properties
   storageConfig = new StorageConfiguration();
   storageNeeds: StorageNeeds[] = [];
   storageRecommendations: StorageModuleRecommendation[] = [];
   storageCargoGroups: StorageCargoGroup[] = [];
   selectedStorageFaction: string = 'argon';
   includeSmallStorage: boolean = false;
   includeMediumStorage: boolean = false;
   includeLargeStorage: boolean = true;

   @Output()
   change = new EventEmitter();

   @Output()
   storageModulesUpdate = new EventEmitter<StorageModuleRecommendation[]>();

    @Input()
    modules: StationModuleModel[];

    @Input()
    sunlight = 100;

   constructor(
      private wareService: WareService,
      private stationSummaryService: StationSummaryService,
      private storageCalculationService: StorageCalculationService,
      private moduleService: ModuleService
   ) {
   }

   ngOnChanges() {
       this.update();
   }

    get totalWorkforce() {
      return this._totalWorkforce + (this.isHq ? 200 : 0);
   }

   onChange() {
      this.update();
      this.change.emit();
   }

   update() {
      this._totalWorkforce = 0;

      this.workforceNeeded = [];
      this.workforceCapacity = [];

      this.resourcesNeeded = [];
      this.resourcesProduced = [];
      this.moduleCosts = [];

      if (this.modules == null) {
         return;
      }

      this.modules.forEach((item) => {
         if (item.module != null && item.module.workForce != null) {
            if (item.module.workForce.max != null) {
               this._totalWorkforce += item.count * item.module.workForce.max;
               this.workforceNeeded.push({
                  amount: item.module.workForce.max,
                  name: item.module.name,
                  count: item.count,
               });
            }
            if (item.module.workForce.capacity != null) {
               this.workforceCapacity.push({
                  amount: item.module.workForce.capacity,
                  name: item.module.name,
                  count: item.count,
               });
            }
         }
         if (item.module != null) {
            const cost = this.getModuleCost(item);
            if (cost != null) {
               this.moduleCosts.push(cost);
            }
         }
      });

      const workforceCapacity = this.modules.reduce((acc, item) => {
         if (item.module && item.module.workForce && item.module.workForce.capacity) {
            return acc + item.count * item.module.workForce.capacity;
         }
         return acc;
      }, 0);

      const workforceNeeded = this.modules.reduce((acc, item) => {
           if (item.module && item.module.workForce && item.module.workForce.max) {
               return acc + item.count * item.module.workForce.max;
           }
           return acc;
       }, 0);

      this.totalWorkforceCapacity = workforceCapacity;
      if (this.autoWorkforce) {
          this.partialWorkforce = workforceNeeded > workforceCapacity ? workforceCapacity : workforceNeeded;
      } else if (this.partialWorkforce > workforceCapacity) {
         this.partialWorkforce = workforceCapacity;
      }

      this.stationSummaryService.setPartialWorkforce(this.partialWorkforce);

      const resources = ResourceCalculator.calculate(this.modules, this.sunlight, this.partialWorkforce);
      resources.sort((a, b) => this.wareService.compareWares(a.ware, b.ware));

      resources.forEach((x) => {
         if (x.amount < 0) {
            let warePrice: number = null;
            if (this.provideAllResources) {
               warePrice = 0;
            } else if (
               this.provideBasicResources &&
               StationSummaryComponent.basicResources.indexOf(x.ware.group) >= 0
            ) {
               warePrice = 0;
            }
            const model = new ResourceSummary(x, this, ResourcePriceType.expense, warePrice);
            this.resourcesNeeded.push(model);
         } else if (x.amount > 0) {
            const model = new ResourceSummary(x, this, ResourcePriceType.product);
            this.resourcesProduced.push(model);
         }
      });

      this.totalModuleResourceCosts = [];

      this.moduleCosts.forEach((cost) => {
         cost.items.forEach((item) => {
            let resourceCost = this.totalModuleResourceCosts.find((x) => x.ware.id == item.ware.id);
            if (resourceCost == null) {
               resourceCost = {
                  ware: item.ware,
                  value: cost.count * item.amount,
               };
               this.totalModuleResourceCosts.push(resourceCost);
            } else {
               resourceCost.value += cost.count * item.amount;
            }
         });
      });

      // Calculate storage needs
      this.updateStorageNeeds();
   }

   updateStorageNeeds() {
      if (this.modules == null) {
         this.storageNeeds = [];
         this.storageRecommendations = [];
         this.storageCargoGroups = [];
         return;
      }

      const resources = ResourceCalculator.calculate(this.modules, this.sunlight, this.partialWorkforce);
      this.storageNeeds = this.storageCalculationService.calculateStorageNeeds(resources, this.storageConfig);

      const sizeFilter = {
         small: this.includeSmallStorage,
         medium: this.includeMediumStorage,
         large: this.includeLargeStorage
      };

      this.storageRecommendations = this.storageCalculationService.calculateStorageRecommendations(
         this.storageNeeds,
         this.modules,
         this.selectedStorageFaction,
         sizeFilter
      );
      this.storageCargoGroups = this.storageCalculationService.calculateStorageCargoGroups(
         resources,
         this.storageConfig,
         this.modules,
         this.selectedStorageFaction,
         sizeFilter
      );
   }

   get workforceStep() {
      if (this.totalWorkforceCapacity === 0) {
         return 1;
      }

      return this.totalWorkforceCapacity / 20;
   }

   get workforcePercent() {
      if (this.totalWorkforceCapacity === 0) {
         return '0%';
      }

      return Math.round(100 * this.partialWorkforce / this.totalWorkforceCapacity) + '%';
   }

   get totalExpenses() {
      let totalExpenses = 0;

      this.resourcesNeeded.forEach((x) => {
         totalExpenses += x.amount * x.price;
      });

      return totalExpenses;
   }

   get totalProfits() {
      let totalProfits = 0;

      this.resourcesProduced.forEach((x) => {
         totalProfits += x.amount * x.price;
      });

      return totalProfits;
   }

   get totalModuleCost() {
      let total = 0;

      this.moduleCosts.forEach((x) => {
         total += x.price;
      });

      return total;
   }

   private getModuleCost(item: StationModuleModel) {
      const production = item.module.production[0];
      if (!production) {
         return null;
      }

      let totalMin = 0;
      let totalMax = 0;

      const items: ModuleCostItem[] = [];
      production.wares.forEach((x) => {
         const ware = this.wareService.getEntity(x.ware);
         totalMin += ware.price.min * x.amount;
         totalMax += ware.price.max * x.amount;

         items.push(new ModuleCostItem(ware, x.amount, this));
      });

      return new ModuleCost(item, this, totalMin, totalMax, items);
   }

   toggleExpanded(key: string) {
      this.expandState[key] = !this.expandState[key];
   }

   // Storage configuration methods
   onStorageInputHoursChange() {
      this.storageConfig.inputHours = Math.max(0, this.storageConfig.inputHours || 0);
      this.storageConfig.updateInputHours(this.storageConfig.inputHours);
      this.updateStorageNeeds();
   }

   onStorageOutputHoursChange() {
      this.storageConfig.outputHours = Math.max(0, this.storageConfig.outputHours || 0);
      this.storageConfig.updateOutputHours(this.storageConfig.outputHours);
      this.updateStorageNeeds();
   }

   updateStationWithStorageModules() {
      this.storageCalculationService.addRecommendedModulesToStation(
         this.storageCargoGroups,
         this.modules,
         this.wareService,
         this.moduleService
      );

      // Trigger update of all components and refresh storage calculations
      this.change.emit();
      this.updateStorageNeeds();
   }

   getCargoGroupStatusClass(cargoGroup: StorageCargoGroup): string {
      if (cargoGroup.shortfall > cargoGroup.totalVolume * 0.8) {
         return 'text-danger';
      } else if (cargoGroup.shortfall) {
         return 'text-warning';
      } else {
         return 'text-success';
      }
   }

   hasStorageRecommendations(): boolean {
      return this.storageCargoGroups.some(group => group.shortfall > 0);
   }

   getAvailableStorageFactions(): {id: string, name: string}[] {
      return this.storageCalculationService.getAvailableStorageFactions();
   }

   onStorageFactionChange() {
      // Recalculate storage recommendations to show faction-specific modules
      this.updateStorageNeeds();
   }

   onStorageSizeChange() {
      // Recalculate storage recommendations to show size-filtered modules
      this.updateStorageNeeds();
   }
}
