import { Component, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { takeUntil } from 'rxjs/operators';
import * as urlon from 'urlon';
import { ComponentBase } from '../../shared/components/component-base';
import { Message, MessageType } from '../../shared/services/message';
import { Layout, ModuleConfig } from '../../shared/services/module-config';
import { ModuleService } from '../../shared/services/module.service';
import { WareService } from '../../shared/services/ware.service';
import { LayoutService } from '../services/layout-service';
import { LoadLayoutComponent, LoadLayoutResult, LoadLayoutType } from './load-layout.component';
import { SaveLayoutComponent } from './save-layout.component';
import { ShareLayoutComponent } from './share-layout.component';
import { StationModuleModel } from './station-calculator.model';
import { StationSummaryComponent } from './station-summary/station-summary.component';
import { StorageModuleRecommendation } from './station-summary/interfaces/storage-requirement';
import { BASE_TITLE } from '../../shared/services/constants';
import { ImportPlansComponent, ImportResult } from './import-plans.component';
import { ExportPlanComponent } from './export-plan.component';

interface Updatable {
    update();
}

@Component({
    selector: 'app-station-calculator',
    templateUrl: './station-calculator.component.html'
})
export class StationCalculatorComponent extends ComponentBase implements OnInit {
    layout: Layout;
    messages: Message[] = [];
    modules: StationModuleModel[] = [];
    importResult: ImportResult;
    sunlight = 100;

    @ViewChildren('stationResources,stationSummary')
    components: QueryList<Updatable>;

    @ViewChild(StationSummaryComponent, { static: true }) summaryComponent: StationSummaryComponent;

    constructor(private modal: NgbModal, private route: ActivatedRoute,
                private layoutService: LayoutService,
                private titleService: Title,
                private wareService: WareService,
                private moduleService: ModuleService) {
        super();
    }

    ngOnInit(): void {
        this.titleService.setTitle(`${BASE_TITLE} - Station Calculator`);

        this.route.queryParams
            .pipe(
                takeUntil(this.onDestroy)
            )
            .subscribe(data => {
                if (data['l']) {
                    try {
                        const layout = data['l'].replace(/-/g, '=').replace(/,/g, '&');
                        const layoutData = urlon.parse(layout);
                        this.modules = layoutData.map(x => {
                            return new StationModuleModel(this.wareService, this.moduleService, x.module, x.count);
                        });
                    } catch (err) {
                        console.log(err);
                    }
                }
            });

        if (this.modules.length === 0) {
            this.modules.push(new StationModuleModel(this.wareService, this.moduleService));
        }
    }

    onChange() {
        this.components.forEach(x => x.update());
    }

    shareLayout() {
        const modalRef = this.modal.open(ShareLayoutComponent);
        const data = this.modules
            .filter(x => x.count > 0 && x.moduleId)
            .map(x => {
                return {
                    module: x.moduleId,
                    count: x.count
                };
            });
        const params = urlon.stringify(data).replace(/=/g, '-').replace(/&/g, ',');
        const url = window.location.href.split('?')[0];
        modalRef.componentInstance.url = `${url}?l=${params}`;
    }

    saveLayoutAs() {
        const modalRef = this.modal.open(SaveLayoutComponent);
        modalRef.result
            .then(res => {
                if (res) {
                    this.layout = {
                        name: res,
                        resourcesPrice: this.summaryComponent.resourcesPrice,
                        productsPrice: this.summaryComponent.productsPrice,
                        modulesResourcesPrice: this.summaryComponent.modulesResourcesPrice,
                        provideBasicResources: this.summaryComponent.provideBasicResources,
                        provideAllResources: this.summaryComponent.provideAllResources,
                        isHeadquarters: this.summaryComponent.isHq,
                        sunlight: this.sunlight,
                        config: this.getModuleConfig()
                    };
                    this.layoutService.saveLayout(this.layout);
                    this.messages.push({
                        type: MessageType.success,
                        content: `<strong>${res}</strong> successfully saved.`
                    });
                }
            });
    }

    saveLayout() {
        if (!this.layout || !this.layout.name) {
            this.saveLayoutAs();
        } else {
            this.layout.config = this.getModuleConfig();
            this.layout.resourcesPrice = this.summaryComponent.resourcesPrice;
            this.layout.productsPrice = this.summaryComponent.productsPrice;
            this.layout.modulesResourcesPrice = this.summaryComponent.modulesResourcesPrice;
            this.layout.provideBasicResources = this.summaryComponent.provideBasicResources;
            this.layout.provideAllResources = this.summaryComponent.provideAllResources;
            this.layout.isHeadquarters = this.summaryComponent.isHq;
            this.layout.sunlight = this.sunlight;
            this.layoutService.saveLayout(this.layout);
            this.messages.push({
                type: MessageType.success,
                content: `<strong>${this.layout.name}</strong> successfully saved.`
            });
        }
    }

    newLayout() {
        this.layout = {
            name: null,
            config: [
                { moduleId: '', count: 1 }
            ]
        };
        this.loadLayoutInternal(this.layout);
    }

    loadLayout() {
        const modalRef = this.modal.open(LoadLayoutComponent, { size: 'lg' });
        modalRef.result
            .then((data: LoadLayoutResult) => {
                if (data) {
                    const layout = this.layoutService.getLayout(data.layoutName);
                    if (layout) {
                        if (data.type == LoadLayoutType.load) {
                            this.layout = layout;
                            this.loadLayoutInternal(layout);
                        } else if (data.type == LoadLayoutType.add) {
                            const existingModules = this.modules.concat([]);

                            const modules = this.getModules(layout.config);
                            modules.forEach(x => {
                                const existing = existingModules.find(m => m.moduleId == x.moduleId);
                                if (existing == null) {
                                    existingModules.push(x);
                                } else {
                                    existing.count += x.count;
                                }
                            });
                            this.modules = existingModules;
                        }
                    }
                }
            });
    }

    importPlans() {
        const modalRef = this.modal.open(ImportPlansComponent);
        void modalRef.result
            .then(data => this.importResult = data);
    }

    exportPlan() {
        const plan = [];
        for (const item of this.modules) {
            const stationModule = {
                macro: item.module.macro,
                count: item.count
            }
            plan.push(stationModule);
        };
        const modalRef = this.modal.open(ExportPlanComponent);
        modalRef.componentInstance.macros = plan;
    }

    private loadLayoutInternal(layout: Layout) {
        this.modules = this.getModules(layout.config);
        this.summaryComponent.productsPrice = layout.productsPrice == null ? 50 : layout.productsPrice;
        this.summaryComponent.modulesResourcesPrice = layout.modulesResourcesPrice == null ? 50 : layout.modulesResourcesPrice;
        this.summaryComponent.resourcesPrice = layout.resourcesPrice == null ? 50 : layout.resourcesPrice;
        this.summaryComponent.provideBasicResources = layout.provideBasicResources;
        this.summaryComponent.provideAllResources = layout.provideAllResources;
        this.summaryComponent.isHq = layout.isHeadquarters;
        this.sunlight = layout.sunlight || 100;
    }

    private getModuleConfig() {
        return this.modules
            .map<ModuleConfig>(x => {
                return {
                    moduleId: x.moduleId,
                    count: x.count
                };
            });
    }

    private getModules(config: ModuleConfig[]) {
        return config.map(x => {
            return new StationModuleModel(this.wareService, this.moduleService, x.moduleId, x.count);
        });
    }

    onSelectPlan(item: string) {
        const layout = this.layoutService.getLayout(item);
        if (layout) {
            this.loadLayoutInternal(layout);
        }
    }

    onStorageModulesUpdate(recommendations: StorageModuleRecommendation[]) {
        // Add recommended storage modules to the station design
        recommendations.forEach(recommendation => {
            recommendation.recommendedModules.forEach(recommendedModule => {
                // Check if this module type already exists in the station
                const existingModule = this.modules.find(m => m.moduleId === recommendedModule.moduleId);
                
                if (existingModule) {
                    // Add to existing module count
                    existingModule.count += recommendedModule.count;
                } else {
                    // Create new module entry
                    const newModule = new StationModuleModel(this.wareService, this.moduleService, recommendedModule.moduleId, recommendedModule.count);
                    this.modules.push(newModule);
                }
            });
        });

        // Trigger update of all components
        this.onChange();
    }
}
