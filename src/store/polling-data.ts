import { defineStore } from 'pinia';

type IVDPPollingData = {
    position: number,
    actualVal: number,
    time: string,
    buttonState: string,
    targetTmdState: string
}

type IPollingData = {
    VDPData: IVDPPollingData,
    KPEData: IAirRingData,
    warning: string[],
    isOverFlow: boolean
}

export const useApiDataStore = defineStore('apiThickData', {
    state: (): IPollingData => {
        return {
            VDPData: {
                position: 0,
                actualVal: 0,
                time: '',
                buttonState: "stopped",
                targetTmdState: "stopped"
            },
            KPEData: {
                actualBias: 0,
                bias: 0,
                data: [],
                mirrored: 0,
                rotation: 0,
                apcState: "apcStateStopped"
            },
            warning: [],
            isOverFlow: false
        }
    },
    
    actions: {
        updateVDPData(newData: IVDPPollingData) {
            Object.assign(this.VDPData, newData);
        },
        updateKPEData(newData: IAirRingData) {
            Object.assign(this.KPEData, newData);
        },
        updateWarning(newData: string[]) {
            Object.assign(this.warning, newData);
        }
    },
});
