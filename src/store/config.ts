import { defineStore } from 'pinia'
type IConfig = {
  language: ILanguageType
  isDark: boolean,
}

export const useConfigStore = defineStore('config', {
  state: (): IConfig => {
    return {
      language: 'zhCn',
      isDark: false,
    }
  },
  actions: {
    changeLang(data: ILanguageType) {
      this.language = data
    },
  },
  persist: true,
})
