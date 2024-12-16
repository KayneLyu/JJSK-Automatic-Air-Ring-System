import { defineStore } from 'pinia'
type ILanguage = {
  language: ILanguageType
}

export const useLangStore = defineStore('lang', {
  state: (): ILanguage => {
    return {
      language: sessionStorage.getItem('localeLang') as ILanguageType || 'zhCn',
    }
  },
  actions: {
    changeLang(data: ILanguageType) {
      this.language = data
    },
  },
})
