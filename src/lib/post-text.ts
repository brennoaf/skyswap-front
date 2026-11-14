type Rule = [RegExp, string]

const TITLES: Rule[] = [
  [/^Six infrared bands$/, 'Seis bandas do infravermelho'],
  [/^False-colour infrared$/, 'Infravermelho em cores falsas'],
  [/^Motion in one difference$/, 'Movimento em uma diferença'],
  [/^What changed between passes \((.+)\)$/, 'O que mudou entre passagens ($1)'],
  [/^Light curve \(colour corrected\)$/, 'Curva de luz (cor corrigida)'],
  [/^(\S+) years of motion$/, '$1 anos de movimento'],
  [/^Ephemeris vs SPHEREx$/, 'Efeméride e SPHEREx'],
  [/^Predicted vs measured motion$/, 'Movimento previsto e medido'],
  [/^Pass blink in (.+)$/, 'Passagens alternadas em $1'],
  [/^Infrared spectrum$/, 'Espectro infravermelho'],
  [/^(\S+) exposures in one pass$/, '$1 exposições em uma passagem'],
]

const CAPTIONS: Rule[] = [
  [/^The same field in (\S+) SPHEREx bands from (\S+) to (\S+) micrometres; signal-to-noise per pass: (.*)\.$/, 'O mesmo campo em $1 bandas do SPHEREx, de $2 a $3 micrômetros; sinal-ruído por passagem: $4.'],
  [/^Blue is (\S+), green is (\S+) and red is (\S+) from the pass of (\S+)\.$/, 'Azul é $1, verde é $2 e vermelho é $3, da passagem de $4.'],
  [/^Exposure of (\S+ \S+) minus one (\S+) hours earlier: the object moved (\S+) from the black spot to the white one\.$/, 'Exposição de $1 menos outra $2 horas antes: o objeto andou $3 da mancha preta até a branca.'],
  [/^Pass of (\S+) minus pass of (\S+) in (\S+): white is brighter now, black was brighter before\.$/, 'Passagem de $1 menos passagem de $2 em $3: branco está mais brilhante agora, preto estava mais brilhante antes.'],
  [/^In (\S+) the brightness appears to change by (\S+) magnitudes, indicative only because the core is saturated, across (\S+) passes after correcting for wavelength\.$/, 'Em $1 o brilho parece mudar $2 magnitudes, só como indicação porque o centro está saturado, em $3 passagens, depois de corrigir o comprimento de onda.'],
  [/^In (\S+) the brightness changed by (\S+) ± (\S+) magnitudes across (\S+) passes after correcting for wavelength\.$/, 'Em $1 o brilho mudou $2 ± $3 magnitudes em $4 passagens, depois de corrigir o comprimento de onda.'],
  [/^In (\S+) the brightness stayed constant within the errors \((\S+) ± (\S+) magnitudes\) across (\S+) passes after correcting for wavelength\.$/, 'Em $1 o brilho ficou constante dentro dos erros ($2 ± $3 magnitudes) em $4 passagens, depois de corrigir o comprimento de onda.'],
  [/^(\S+) WISE\/NEOWISE visits from (\S+) to (\S+) and (\S+) SPHEREx passes on the same sky grid; over (\S+) years the catalogue motion of (\S+) per year adds up to (\S+) \((\S+) WISE pixels\); WISE saturates on a star this bright, so its centre looks flat\.$/, '$1 visitas do WISE/NEOWISE de $2 a $3 e $4 passagens do SPHEREx na mesma grade do céu; em $5 anos, o movimento de catálogo de $6 por ano soma $7 ($8 pixels do WISE); o WISE satura em uma estrela tão brilhante, então o centro parece achatado.'],
  [/^(\S+) WISE\/NEOWISE visits from (\S+) to (\S+) and (\S+) SPHEREx passes on the same sky grid; over (\S+) years the catalogue motion of (\S+) per year adds up to (\S+) \((\S+) WISE pixels\)\.$/, '$1 visitas do WISE/NEOWISE de $2 a $3 e $4 passagens do SPHEREx na mesma grade do céu; em $5 anos, o movimento de catálogo de $6 por ano soma $7 ($8 pixels do WISE).'],
  [/^Between (\S+) and (\S+) the catalogue predicts a shift of (\S+) and SPHEREx measured (\S+) ± (\S+)\.$/, 'Entre $1 e $2 o catálogo prevê um deslocamento de $3 e o SPHEREx mediu $4 ± $5.'],
  [/^In (\S+) exposures the measured position was a median (\S+) from the JPL Horizons prediction\.$/, 'Em $1 exposições, a posição medida ficou a uma mediana de $2 da previsão do JPL Horizons.'],
  [/^Each frame stacks one SPHEREx pass in band (\S+); (\S+) passes from (\S+) to (\S+)\.$/, 'Cada quadro empilha uma passagem do SPHEREx na banda $1; $2 passagens de $3 a $4.'],
  [/^Stacked passes in band (\S+) from (\S+) to (\S+); the catalogue motion of (\S+) per year predicts a shift of (\S+) \((\S+) pixels\)\.$/, 'Passagens empilhadas na banda $1 de $2 a $3; o movimento de catálogo de $4 por ano prevê um deslocamento de $5 ($6 pixels).'],
  [/^(\S+) SPHEREx measurements from (\S+) to (\S+) micrometres in (\S+) passes\.$/, '$1 medidas do SPHEREx de $2 a $3 micrômetros em $4 passagens.'],
  [/^(\S+) SPHEREx exposures taken between (\S+) and (\S+) in bands (.+)\.$/, '$1 exposições do SPHEREx feitas entre $2 e $3 nas bandas $4.'],
  [/^(\S+) SPHEREx exposures taken on (\S+) over (\S+) hours in bands (.+)\.$/, '$1 exposições do SPHEREx feitas em $2, ao longo de $3 horas, nas bandas $4.'],
]

function brazilian(text: string): string {
  return text.replace(/(\d{4})-(\d\d)-(\d\d)/g, '$3/$2/$1').replace(/(\d)\.(\d)/g, '$1,$2')
}

function apply(rules: Rule[], text: string, locale: string): string {
  if (!locale.startsWith('pt')) return text
  for (const [re, to] of rules) if (re.test(text)) return brazilian(text.replace(re, to))
  return text
}

export const postTitle = (title: string, locale: string) => apply(TITLES, title, locale)
export const postCaption = (caption: string, locale: string) => apply(CAPTIONS, caption, locale)
