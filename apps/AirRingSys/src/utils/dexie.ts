import Dexie, { Table } from 'dexie'

class MySubClassDexie extends Dexie {
  public product!: Table<IProductData>
  public Frame!: Table<IFrameThickData>
  public Alarm!: Table<IAlarmsData>
  public Heats!: Table<IHeats>
  public Channel!: Table<ISaveHeats>

  constructor() {
    super('JJSKDatabase')
    this.version(1).stores({
      product: 'productName',
      Frame: 'frameId, endTime',
      Alarm: 'id++, date',
      Heats: 'frameId',
      Channel: 'name',
    })
    this.version(2)
      .stores({
        product: 'productName',
        Frame: 'frameId, endTime, source, startTimestamp',
        Alarm: 'id++, date',
        Heats: 'frameId',
        Channel: 'name',
      })
      .upgrade((tx) => {
        return tx
          .table('Frame')
          .toCollection()
          .modify((frame) => {
            if (!frame.startTimestamp) frame.startTimestamp = 0
            if (!frame.endTimestamp) frame.endTimestamp = 0
            if (!frame.rawDatalist) frame.rawDatalist = []
            if (!frame.source) frame.source = 'adbox'
            if (!frame.airAD) frame.airAD = 0
            if (!frame.gain) frame.gain = 1
          })
      })
  }
}

export const db = new MySubClassDexie()
