export const DEFAULT_THEME = 'paper';
const supportedSections = new Set(['profile', 'experience', 'projects', 'education', 'technical_radar', 'skills', 'assisted_skills', 'languages']);

export function validateResume(data, locales = ['ru', 'en']) {
  const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
  const object = (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  };
  const text = (value, path) => {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'expected non-empty text');
    if (/\b(?:TODO|TBD|FIXME)\b|\{\{[^}]+\}\}/u.test(value)) fail(path, 'unfilled placeholder');
  };
  const local = (value, path) => {
    if (typeof value === 'string') return text(value, path);
    object(value, path);
    for (const locale of locales) text(value[locale], `${path}.${locale}`);
  };
  const list = (value, path) => { if (!Array.isArray(value)) fail(path, 'expected an array'); return value; };
  const url = (value, path) => {
    text(value, path);
    let parsed;
    try { parsed = new URL(value); } catch { fail(path, 'invalid URL'); }
    if (!['https:', 'http:'].includes(parsed.protocol)) fail(path, 'use an http(s) URL');
  };
  object(data, 'resume'); object(data.basics, 'basics');
  for (const key of ['name', 'headline', 'location']) local(data.basics[key], `basics.${key}`);
  if (data.basics.profile != null) local(data.basics.profile, 'basics.profile');
  if (data.basics.email != null) {
    text(data.basics.email, 'basics.email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(data.basics.email)) fail('basics.email', 'invalid email');
  }
  if (data.basics.phone != null) text(data.basics.phone, 'basics.phone');
  list(data.basics.links ?? [], 'basics.links').forEach((link, i) => {
    object(link, `basics.links[${i}]`); text(link.label, `basics.links[${i}].label`); url(link.url, `basics.links[${i}].url`);
  });
  for (const section of ['education', 'experience', 'projects', 'skills', 'assisted_skills', 'languages']) {
    list(data[section] ?? [], section).forEach((entry, i) => {
      const path = `${section}[${i}]`; object(entry, path);
      if (section === 'education') {
        local(entry.school, `${path}.school`); local(entry.degree, `${path}.degree`);
        for (const key of ['start', 'end']) if (entry[key] != null) text(entry[key], `${path}.${key}`);
        list(entry.details ?? [], `${path}.details`).forEach((item, n) => local(item, `${path}.details[${n}]`));
      } else if (section === 'experience') {
        local(entry.company, `${path}.company`); local(entry.role, `${path}.role`);
      } else if (section === 'projects') {
        text(entry.name, `${path}.name`);
        if (entry.subtitle != null) local(entry.subtitle, `${path}.subtitle`);
        if (entry.links != null) {
          object(entry.links, `${path}.links`);
          for (const key of ['repo', 'demo']) if (entry.links[key] != null) url(entry.links[key], `${path}.links.${key}`);
        }
        list(entry.stack ?? [], `${path}.stack`).forEach((item, n) => text(item, `${path}.stack[${n}]`));
      } else if (section === 'skills' || section === 'assisted_skills') {
        local(entry.category, `${path}.category`);
        list(entry.items, `${path}.items`).forEach((item, n) => local(item, `${path}.items[${n}]`));
      } else {
        local(entry.name, `${path}.name`); local(entry.level, `${path}.level`);
      }
      for (const key of ['dates', 'location']) if (entry[key] != null) local(entry[key], `${path}.${key}`);
      if (section === 'experience' || section === 'projects') list(entry.bullets ?? [], `${path}.bullets`).forEach((item, n) => local(item, `${path}.bullets[${n}]`));
    });
  }
  if (data.pdf != null) {
    object(data.pdf, 'pdf');
    if (!Number.isInteger(data.pdf.max_pages ?? 1) || (data.pdf.max_pages ?? 1) < 1 || (data.pdf.max_pages ?? 1) > 10) fail('pdf.max_pages', 'use an integer between 1 and 10');
    if (data.pdf.filename != null && !/^[a-z0-9][a-z0-9-]*$/u.test(data.pdf.filename)) fail('pdf.filename', 'use a filename slug');
    for (const key of ['highlights', 'content_highlights']) if (data.pdf[key] != null) {
      const terms = list(data.pdf[key], `pdf.${key}`);
      if (terms.length > 20) fail(`pdf.${key}`, 'use at most 20 literal highlights');
      terms.forEach((term, i) => text(term, `pdf.${key}[${i}]`));
      if (new Set(terms).size !== terms.length) fail(`pdf.${key}`, 'duplicate highlight');
    }
    if (data.pdf.labels != null) {
      object(data.pdf.labels, "pdf.labels");
      for (const [key, value] of Object.entries(data.pdf.labels)) {
        if (!supportedSections.has(key)) fail("pdf.labels", `unknown section: ${key}`);
        local(value, `pdf.labels.${key}`);
      }
    }
    if (data.pdf.project_order != null) {
      const names = list(data.pdf.project_order, "pdf.project_order");
      const known = new Set((data.projects ?? []).map(project => project.name));
      if (new Set(names).size !== names.length) fail("pdf.project_order", "duplicate project");
      for (const name of names) if (!known.has(name)) fail("pdf.project_order", `unknown project: ${name}`);
    }
    if (data.pdf.sections != null) {
      const sections = list(data.pdf.sections, 'pdf.sections');
      if (!sections.length || new Set(sections).size !== sections.length) fail('pdf.sections', 'use a non-empty list without duplicates');
      for (const section of sections) if (!supportedSections.has(section)) fail('pdf.sections', `unknown section: ${section}`);
      if (sections.includes('technical_radar') && sections.some(section => ['skills', 'assisted_skills'].includes(section))) fail('pdf.sections', 'technical_radar already includes both skill groups');
    }
  }
  return data;
}

export function assertPublishTarget({ source, canonical, theme, locales }) {
  if (source !== canonical || theme !== DEFAULT_THEME || locales.join(',') !== 'ru,en') {
    throw new Error('Publishing requires the canonical resume.yaml, the paper theme and both languages. Build other variants without --publish.');
  }
}
