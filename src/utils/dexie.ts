import Dexie, { Table } from "dexie";

class MySubClassDexie extends Dexie {
  public product!: Table<IProductData>;
  public Frame!: Table<IFrameThickData>;
  constructor() {
    super('JJSKDatabase');
    this.version(1).stores({
      product: "productName",
      Frame:"frameId, endTime"
    });
  }
}

export const db = new MySubClassDexie();