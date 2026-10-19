// Keykomi CV: a reusable single-column layout. All personal content comes from data.
#let keykomi-cv(cv, lang: "en", theme: "white") = {
  assert(lang in ("ru", "en"), message: "lang must be ru or en")
  assert(theme in ("white", "paper"), message: "theme must be white or paper")
  let ru = lang == "ru"
  let tr(value) = if type(value) == dictionary { value.at(lang) } else { value }
  let ink = rgb("272d28")
  let muted = rgb("61695e")
  let accent = rgb("7d8e73")
  let rule = rgb("a2ae99")
  let paper = if theme == "paper" { rgb("f8f8f2") } else { white }
  let labels = if ru {
    (profile: "Профиль", experience: "Опыт", projects: "Личные проекты", education: "Образование", skills: "Технические навыки", assisted_skills: "Практический опыт с AI", languages: "Языки")
  } else {
    (profile: "Profile", experience: "Experience", projects: "Selected projects", education: "Education", skills: "Technical skills", assisted_skills: "AI-assisted project experience", languages: "Languages")
  }
  for (key, value) in cv.at("pdf", default: (:)).at("labels", default: (:)) {
    assert(key in labels, message: "Unknown section label: " + key)
    labels.insert(key, tr(value))
  }
  let sections = cv.at("pdf", default: (:)).at("sections", default: ("profile", "experience", "projects", "education", "skills", "assisted_skills", "languages"))
  let name = tr(cv.basics.name)
  set document(title: name + if ru { " - Резюме" } else { " - CV" }, author: name)
  set page(paper: "a4", margin: (x: 15mm, top: 13mm, bottom: 16mm), fill: paper,
    background: {
      place(top + left, dx: 9mm, dy: 9mm, line(length: 11pt, stroke: .65pt + rule))
      place(top + left, dx: 9mm, dy: 9mm, line(end: (0pt, 11pt), stroke: .65pt + rule))
      place(top + right, dx: -9mm, dy: 9mm, line(start: (-11pt, 0pt), length: 11pt, stroke: .65pt + rule))
      place(top + right, dx: -9mm, dy: 9mm, line(end: (0pt, 11pt), stroke: .65pt + rule))
    },
    footer: context {
      set text(font: "Libertinus Serif", size: 8pt, fill: muted)
      line(length: 100%, stroke: .4pt + rule)
      v(3pt)
      grid(columns: (1fr, auto), gutter: 10pt,
        [#name #h(5pt) #text(fill: accent)[·] #h(5pt) #tr(cv.basics.headline)],
        text(fill: accent, counter(page).display("1 / 1", both: true)))
    }, footer-descent: 8mm)
  set text(font: "Libertinus Serif", size: 10.2pt, lang: lang, fill: ink)
  set par(justify: false, leading: .4em, spacing: .4em)
  set list(indent: 9pt, body-indent: 4pt, spacing: 3.3pt, marker: text(fill: accent, size: 8.5pt)[•])
  show link: it => underline(offset: 2pt, stroke: .35pt + rule, it)
  let section(title) = block(above: 8pt, below: 4pt, sticky: true, width: 100%)[
    #text(font: "Geologica", size: 8.6pt, weight: "bold", tracking: .075em, upper(title))
    #v(4pt)
    #line(length: 100%, stroke: .55pt + rule)
  ]
  let row(left, right: none, secondary: false) = grid(
    columns: (1fr, auto), gutter: 12pt,
    left,
    if right != none { text(size: 9pt, fill: muted, right) } else { [] })
  let bullets(values) = if values.len() > 0 { list(..values.map(tr)) }
  let group(entry) = block(above: 0pt, below: 4pt, breakable: true, entry)
  let skill-rows(values) = for skill in values [
    #text(weight: "bold", tr(skill.category) + ": ")#skill.items.map(tr).join(", ")
    #v(2pt)
  ]
  // Plain strings are never evaluated as Typst markup.
  align(center)[
    #text(size: 24pt, weight: "bold", name)
    #v(3pt)
    #text(size: 10pt)[#tr(cv.basics.headline) #h(5pt) #text(fill: accent)[/]
      #h(5pt) #tr(cv.basics.location)]
    #v(4pt)
    #text(size: 9pt)[
      #let contacts = ()
      #if cv.basics.at("email", default: none) != none {
        contacts.push(link("mailto:" + cv.basics.email, cv.basics.email))
      }
      #for item in cv.basics.at("links", default: ()) { contacts.push(link(item.url, item.label)) }
      #if cv.basics.at("phone", default: none) != none { contacts.push(cv.basics.phone) }
      #contacts.join([ #h(4pt) #text(fill: accent)[·] #h(4pt) ])
    ]
  ]
  for key in sections {
    assert(key in labels, message: "Unknown CV section: " + key)
    let values = if key == "profile" { cv.basics.at("profile", default: none) } else { cv.at(key, default: ()) }
    if values == none or values == () { continue }
    if key == "projects" and "project_order" in cv.at("pdf", default: (:)) {
      values = cv.pdf.project_order.map(name => values.find(project => project.name == name))
    }
    if key != "languages" { section(labels.at(key)) }
    if key == "profile" { tr(values) }
    else if key == "experience" {
      for exp in values { group([
        #row(text(weight: "bold", tr(exp.company)), right: if "dates" in exp { tr(exp.dates) } else { none })
        #v(1pt)
        #row(text(style: "italic", size: 9.6pt, tr(exp.role)), right: if "location" in exp { tr(exp.location) } else { none })
        #v(3pt)
        #bullets(exp.at("bullets", default: ()))
      ]) }
    } else if key == "projects" {
      for project in values { group([
        #let links = project.at("links", default: (:))
        #let destination = links.at("demo", default: none)
        #if destination == none { destination = links.at("repo", default: none) }
        #text(weight: "bold", if destination != none { link(destination, project.name) } else { project.name })
        #if "subtitle" in project [ #h(4pt) #text(fill: accent)[/]
          #h(4pt) #text(size: 9.5pt, style: "italic", tr(project.subtitle))]
        #if project.at("stack", default: ()).len() > 0 [
          #v(1pt) #text(size: 8.8pt, fill: muted, project.stack.join(" · "))
        ]
        #v(2pt)
        #bullets(project.at("bullets", default: ()))
      ]) }
    } else if key == "education" {
      for edu in values { group([
        #row(text(weight: "bold", tr(edu.school)), right: if "dates" in edu { tr(edu.dates) } else if "start" in edu and "end" in edu { edu.start + " - " + edu.end } else { none })
        #v(1pt)
        #text(size: 9.6pt, tr(edu.degree))
        #for detail in edu.at("details", default: ()) [#v(1pt)#text(size: 9.3pt, fill: muted, tr(detail))]
      ]) }
    } else if key in ("skills", "assisted_skills") { skill-rows(values) }
    else if key == "languages" { block(above: 4pt)[#text(weight: "bold", labels.at(key) + ": ")#values.map(item => tr(item.name) + " " + tr(item.level)).join("; ")] }
  }
}
