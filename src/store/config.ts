import { defineStore } from 'pinia'
type ILanguage = {
  language: ILanguageType
  isDark: boolean,
  product: string,
  order: string,
  roll: number
}

export const useConfigStore = defineStore('config', {
  state: (): ILanguage => {
    return {
      language: 'en',
      isDark: false,
      product: 'ABCD',
      order: '00000001',
      roll: 1
    }
  },
  actions: {
    changeLang(data: ILanguageType) {
      this.language = data
    },
  },
  persist: true,
})
