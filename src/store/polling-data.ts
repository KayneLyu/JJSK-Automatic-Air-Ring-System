import { defineStore } from 'pinia';

export const useApiDataStore = defineStore('apiData', {
    state: () => ({
        apiData: null
    }),
    actions: {
        updateApiData(newData:any) {
            this.apiData = newData;
        }
    }
});
