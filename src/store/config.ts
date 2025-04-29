import { defineStore } from 'pinia'
type IConfig = {
  language: ILanguageType
  isDark: boolean,
  showPercent: boolean,
  markOverValue: boolean
}

export const useConfigStore = defineStore('config', {
  state: (): IConfig => {
    return {
      language: 'zhCn',
      isDark: false,
      showPercent: false,
      markOverValue: true
    }
  },
  actions: {
    changeLang(data: ILanguageType) {
      this.language = data
    },
  },
  persist: true,
})
