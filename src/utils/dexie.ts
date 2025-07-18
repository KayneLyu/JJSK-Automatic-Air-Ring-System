import Dexie, { Table } from "dexie";

class MySubClassDexie extends Dexie {
  public product!: Table<IProductData>;
  public Frame!: Table<IFrameThickData>;
  public Alarm!: Table<IAlarmsData>;
  public Heats!: Table<IHeats>;
  public Channel!: Table<ISaveHeats>;
  constructor() {
    super('JJSKDatabase');
    this.version(1).stores({
      product: "productName",
      Frame:"id++, date",
      Alarm:"id++, date",
      Heats:"frameId",
      Channel:"name"
    });
  }
}

export const db = new MySubClassDexie();