// Original layout inspired by Jake's Resume (MIT); no template code copied.
#let lang = sys.inputs.at("lang", default: "ru")
#let cv = json("data/resume.json")
#let tr(value) = value.at(lang)
#let is-ru = lang == "ru"
#set document(title: tr(cv.basics.name) + if is-ru { " — Резюме" } else { " — CV" }, author: tr(cv.basics.name))
#set page(paper: "a4", margin: (x: 15mm, y: 13mm), numbering: none)
#set text(font: "New Computer Modern", size: 10.3pt, lang: lang, fill: rgb("1b1b1b"))
#set par(justify: false, leading: .55em, spacing: .5em)
#set list(indent: 10pt, body-indent: 4pt, spacing: 4.2pt)
#show link: underline
#let section(title) = {
  v(9pt)
  text(size: 11pt, weight: "bold", upper(title))
  v(-5pt)
  line(length: 100%, stroke: .5pt)
  v(3pt)
}
#align(center)[
  #text(size: 24pt, weight: "bold", tr(cv.basics.name))
  #v(3pt)
  #text(size: 10pt, if is-ru { "Software Development Engineer · Kotlin / Java · Москва" } else { "Software Development Engineer · Kotlin / Java · Moscow" })
  #v(4pt)
  #text(size: 9.2pt)[
    #link("mailto:" + cv.basics.email, cv.basics.email) #h(6pt) | #h(6pt)
    #link(cv.basics.links.at(0).url, "GitHub") #h(6pt) | #h(6pt)
    #link(cv.basics.links.at(1).url, "@Keyko_Mi") #h(6pt) | #h(6pt)
    #cv.basics.phone
  ]
]
#section(if is-ru { "Образование" } else { "Education" })
#for edu in cv.education [
  #grid(columns: (1fr, auto), gutter: 10pt, text(weight: "bold", tr(edu.school)), [#edu.start - #edu.end])
  #v(2pt)
  #grid(columns: (1fr, auto), tr(edu.degree), tr(edu.location))
  #v(1pt)
  #text(size: 9.5pt, tr(edu.details.at(0)))
]
#section(if is-ru { "Профиль" } else { "Profile" })
#tr(cv.basics.profile)
#section(if is-ru { "Опыт" } else { "Experience" })
#for exp in cv.experience [
  #grid(columns: (1fr, auto), gutter: 12pt, text(weight: "bold", tr(exp.company)), tr(exp.dates))
  #v(2pt)
  #grid(columns: (1fr, auto), text(style: "italic", tr(exp.role)), tr(exp.location))
  #v(4pt)
  #list(..exp.bullets.map(bullet => tr(bullet)))
]
#section(if is-ru { "Личные проекты" } else { "Projects" })
#for project in cv.projects [
  #grid(columns: (auto, 1fr), gutter: 7pt,
    text(weight: "bold", link(if project.links.demo != none { project.links.demo } else { project.links.repo }, project.name)),
    text(style: "italic", tr(project.subtitle)))
  #v(2pt)
  #tr(project.bullets.at(0))
  #v(5pt)
]
#section(if is-ru { "Технические навыки" } else { "Technical Skills" })
#for skill in cv.skills [
  #text(weight: "bold", tr(skill.category) + ": ")#skill.items.join(", ")
  #v(2pt)
]
