import { defineStore } from 'pinia'
type ILanguage = {
  language: ILanguageType
  isDark: boolean
}

export const useConfigStore = defineStore('config', {
  state: (): ILanguage => {
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
