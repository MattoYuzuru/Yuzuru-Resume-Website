#import "template.typ": keykomi-cv
#let source = sys.inputs.at("source", default: "../content/resume/resume.yaml")
#let cv = if source.ends-with(".json") { json(source) } else { yaml(source) }
#keykomi-cv(cv, lang: sys.inputs.at("lang", default: "en"), theme: sys.inputs.at("theme", default: "white"))
