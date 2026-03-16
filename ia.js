function analisarResenha(texto, pessoas, horario){

let score = 0

let palavras = [
"resenha",
"churrasco",
"churras",
"open bar",
"paredão",
"cerveja",
"festa",
"role"
]

texto = texto.toLowerCase()

palavras.forEach(p => {
if(texto.includes(p)){
score += 20
}
})

if(pessoas > 10){
score += 20
}

let hora = parseInt(horario.split(":")[0])

if(hora >= 20){
score += 20
}

if(score > 100){
score = 100
}

return score
}