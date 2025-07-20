export class StorageConfiguration {
  inputHours: number = 12;
  outputHours: number = 24;

  constructor() {}

  updateOutputHours(hours: number) {
    this.outputHours = hours;
  }

  updateInputHours(hours: number) {
    this.inputHours = hours;
  }
}