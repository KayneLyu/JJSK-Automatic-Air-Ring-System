import { defineStore } from 'pinia'
type IConfig = {
  language: ILanguageType
  isDark: boolean,
  showPercent: boolean,
  queryHours: number
  beforeAutoID: number | null
}

export const useConfigStore = defineStore('config', {
  state: (): IConfig => {
    return {
      language: 'zhCn',
      isDark: false,
      showPercent: false,
      queryHours: 2,
      beforeAutoID: null
    }
  },
  actions: {
    changeLang(data: ILanguageType) {
      this.language = data
    },
  },
  persist: true,
})
