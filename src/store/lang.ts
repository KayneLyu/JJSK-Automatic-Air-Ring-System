import { defineStore } from 'pinia'
type ILanguage = {
  language: ILanguageType
  theme: 'light' | 'dark'
}

export const useLangStore = defineStore('lang', {
  state: (): ILanguage => {
    return {
      language: sessionStorage.getItem('localeLang') as ILanguageType || 'zhCn',
      theme: 'light',
    }
  },
  actions: {
    changeLang(data: ILanguageType) {
      this.language = data
    },
  },
})
