import Dexie, { Table } from "dexie";

class MySubClassDexie extends Dexie {
  public product!: Table<IProductData>;
  constructor() {
    super('JJSKDatabase');
    this.version(1).stores({
      product:"name"
    });
  }
}

export const db = new MySubClassDexie();