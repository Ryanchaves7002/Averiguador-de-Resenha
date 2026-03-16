let pessoasNaoPodem = []
let pessoasPodem = []


function falar(texto) {

    let msg = new SpeechSynthesisUtterance(texto)

    msg.lang = "pt-BR"
    msg.rate = 1

    speechSynthesis.speak(msg)

}


// ADICIONAR PESSOAS QUE NÃO PODEM IR

function adicionarNaoPode() {

    let nome = document.getElementById("nomeNaoPode").value
    let motivo = document.getElementById("motivoNaoPode").value

    if (nome === "" || motivo === "") return

    pessoasNaoPodem.push({ nome, motivo })

    atualizarListaNaoPode()

    document.getElementById("nomeNaoPode").value = ""
    document.getElementById("motivoNaoPode").value = ""

}


// ADICIONAR PESSOAS QUE PODEM IR

function adicionarPode() {

    let nome = document.getElementById("nomePode").value

    if (nome === "") return

    pessoasPodem.push(nome)

    atualizarListaPode()

    document.getElementById("nomePode").value = ""

}


// ATUALIZAR LISTA NÃO PODE

function atualizarListaNaoPode() {

    let lista = document.getElementById("listaNaoPode")

    lista.innerHTML = ""

    pessoasNaoPodem.forEach(p => {

        let li = document.createElement("li")

        li.textContent = p.nome + " - " + p.motivo

        lista.appendChild(li)

    })

}


// ATUALIZAR LISTA PODE

function atualizarListaPode() {

    let lista = document.getElementById("listaPode")

    lista.innerHTML = ""

    pessoasPodem.forEach(p => {

        let li = document.createElement("li")

        li.textContent = p

        lista.appendChild(li)

    })

}


// CALCULAR PROBABILIDADE

function calcularProbabilidade(texto) {

    texto = texto.toLowerCase()

    let score = 0

    let palavras = [
        "resenha",
        "festa",
        "churrasco",
        "churras",
        "open bar",
        "cerveja",
        "paredao",
        "role",
        "balada"
    ]

    palavras.forEach(p => {

        if (texto.includes(p)) {
            score += 15
        }

    })


    // PESSOAS QUE PODEM IR (AUMENTA)

    pessoasPodem.forEach(() => {
        score += 10
    })


    // PESSOAS QUE NÃO PODEM IR (DIMINUI)

    pessoasNaoPodem.forEach(p => {

        let motivo = p.motivo.toLowerCase()

        if (
            motivo.includes("trabalho") ||
            motivo.includes("prova") ||
            motivo.includes("doente") ||
            motivo.includes("viagem") ||
            motivo.includes("familia")
        ) {
            score -= 10
        }

    })


    if (score < 0) score = 0
    if (score > 100) score = 100

    return score

}


// ANALISAR RESENHA

function analisar() {

    let texto = document.getElementById("texto").value

    document.getElementById("loading").style.display = "flex"

    falar("Averiguando resenhas, aguarde")

    setTimeout(() => {

        let probabilidade = calcularProbabilidade(texto)

        document.getElementById("loading").style.display = "none"

        document.getElementById("resultado").innerHTML =
            "Probabilidade de resenha detectada: " + probabilidade + "%"

        falar("Análise concluída. Probabilidade de resenha detectada de " + probabilidade + " por cento")

    }, 3000)

}