import { createI18n } from 'vue-i18n'
// 语言包
import zhCn from './lang/zh-cn'
import en from './lang/en'

const getLang = (): ILanguageType => {
  const getLang = localStorage.getItem('language')
  if (getLang) {
    const { language } = JSON.parse(getLang)
    return language
  } else {
    return "en"
  }
}
const i18n = createI18n({
  legacy: false, // 设置为 false，启用 composition API 模式
  locale: getLang(),
  messages: {
    zhCn,
    en,
  },
})

export default i18n