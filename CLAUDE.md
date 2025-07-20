# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Angular 15 application for X4: Foundations game utilities and database, specifically a station calculator. It's a fork of stummi/x4 with personal adjustments. The app helps players calculate station production, resource requirements, and profitability.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm start
# or
ng serve

# Build for production
npm run build
# or
ng build

# Build in watch mode (development)
npm run watch
# or
ng build --watch --configuration development

# Run tests
npm test
# or
ng test
```

## Architecture Overview

### Module Structure
- **Lazy-loaded feature modules**: Ships, Equipment, Factions, Races, Modules, Wares, and Station Calculator
- **Core module**: Contains shared services like storage
- **Shared module**: Common components, services, and models
- **Google Analytics module**: Analytics tracking

### Key Services
- **Entity services**: `ware.service.ts`, `module.service.ts`, `faction.service.ts`, `ship.service.ts`, `race.service.ts`, `equipment.service.ts`
- **Layout services**: Handle station layout persistence (`layout-service.ts`, versioned layout services v0-v2)
- **Storage service**: Local storage management
- **Station summary service**: Calculates costs, resources, and profitability
- **Storage calculation service**: Calculates storage requirements and module recommendations

### Data Management
- Game data stored as TypeScript constants in `src/app/shared/services/data/`
- Data includes: wares, modules, factions, races, ships, equipment, production methods
- Models defined in `src/app/shared/services/model/model.ts`
- Storage interfaces: `StorageNeeds`, `StorageCargoGroup`, `StorageModuleRecommendation`

### Core Components
- **Station Calculator**: Main feature at `/station-calculator` - allows users to build station layouts, calculate resources/costs
- **Station Summary**: Displays production costs, resource requirements, profit calculations, and storage needs analysis
- **Station Modules**: Component for adding/configuring station modules
- **Layout management**: Save/load/share station configurations with URL sharing support

### Key Features
- Station layout creation and management
- Resource and production calculations
- Cost analysis and profitability calculations
- Storage requirements analysis by cargo type (container, liquid, solid)
- Module recommendations with faction and size filtering
- Automatic module addition to station design
- Import/export functionality for station plans
- URL-based layout sharing using urlon library
- Local storage for saved layouts with versioning

### Styling
- Uses SCSS with DevExtreme UI components
- Bootstrap 5 integration via ng-bootstrap
- DevExtreme themes located in `src/assets/styles/`
- Dark theme configured as default (`dx.dark.css`)

### Build Configuration
- Angular CLI project with custom build configurations
- Production builds use file replacement for environment files
- Bundle size limits: 1MB warning, 2MB error for initial bundle
- Component style limit: 2KB warning, 4KB error
- Tests are disabled by default in schematics (skipTests: true)

## Important Implementation Notes

- The app uses hash-based routing (`useHash: true`)
- Station calculator uses URL parameters with urlon encoding for layout sharing
- Layout persistence uses versioned services for backwards compatibility
- All major entities (wares, modules, ships, etc.) follow similar service patterns
- Components extend `ComponentBase` which provides common functionality like `takeUntil(this.onDestroy)`
- Heavy use of DevExtreme components for data grids and UI elements
