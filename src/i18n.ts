// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    lng: 'en',
    
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}'
    },
    backend: {
      loadPath: '/locales/{{lng}}.json', 
    },
  });

export default i18n;