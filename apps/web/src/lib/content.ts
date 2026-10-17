import { parse } from 'yaml';
import resumeSource from '../../../../content/resume/resume.yaml?raw';
import ru from '../i18n/ru.json';
import en from '../i18n/en.json';

export type Locale = 'ru' | 'en';
interface ResumeBasics {
  name: Record<Locale, string>;
  headline: Record<Locale, string>;
  location: Record<Locale, string>;
  links: { label: string; url: string | null }[];
}
const resume = parse(resumeSource) as { basics: ResumeBasics };
export function getHome(locale: Locale) {
  return {
    locale,
    ui: locale === 'ru' ? ru : en,
    person: {
      name: resume.basics.name[locale],
      headline: resume.basics.headline[locale],
      location: resume.basics.location[locale],
      github: resume.basics.links.find(link => link.label === 'GitHub')!.url!,
      telegram: resume.basics.links.find(link => link.label === 'Telegram')!.url!,
    },
  };
}
export type HomeData = ReturnType<typeof getHome>;
