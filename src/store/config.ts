import { defineStore } from 'pinia'
type IConfig = {
  language: ILanguageType
  isDark: boolean,
  showPercent: boolean,
  markOverValue: boolean,
  queryHours: number
}

export const useConfigStore = defineStore('config', {
  state: (): IConfig => {
    return {
      language: 'zhCn',
      isDark: false,
      showPercent: false,
      markOverValue: true,
      queryHours: 2
    }
  },
  actions: {
    changeLang(data: ILanguageType) {
      this.language = data
    },
  },
  persist: true,
})
