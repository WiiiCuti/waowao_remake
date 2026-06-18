import { defineRouting } from 'next-intl/routing';

export const locales = ['en'] as const;
export type Locale = 'en' | 'zh';

export const defaultLocale: 'en' = 'en';

export const routing = defineRouting({
    // 支持的所有语言
    locales,

    // 默认语言
    defaultLocale,

    // URL 路径策略: 始终显示语言前缀
    localePrefix: 'always'
});
