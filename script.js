const pessoasNaoPodem = []
const pessoasPodem = []

function falar(texto) {
    const mensagem = String(texto || "").trim()

    if (!mensagem || !("speechSynthesis" in window)) return

    const msg = new SpeechSynthesisUtterance(mensagem)
    msg.lang = "pt-BR"
    msg.rate = 1
    msg.pitch = 1
    speechSynthesis.cancel()
    speechSynthesis.speak(msg)
}

function obterValorCampo(id) {
    const elemento = document.getElementById(id)
    return elemento ? elemento.value.trim() : ""
}

function limparCampo(id) {
    const elemento = document.getElementById(id)
    if (elemento) elemento.value = ""
}

function adicionarNaoPode() {
    const nome = obterValorCampo("nomeNaoPode")
    const motivo = obterValorCampo("motivoNaoPode")

    if (!nome || !motivo) return

    pessoasNaoPodem.push({ nome, motivo })
    atualizarListaNaoPode()
    limparCampo("nomeNaoPode")
    limparCampo("motivoNaoPode")
}

function adicionarPode() {
    const nome = obterValorCampo("nomePode")

    if (!nome) return

    pessoasPodem.push(nome)
    atualizarListaPode()
    limparCampo("nomePode")
}

function atualizarListaNaoPode() {
    const lista = document.getElementById("listaNaoPode")
    if (!lista) return

    lista.innerHTML = ""

    pessoasNaoPodem.forEach((pessoa) => {
        const item = document.createElement("li")
        item.textContent = `${pessoa.nome} - ${pessoa.motivo}`
        lista.appendChild(item)
    })
}

function atualizarListaPode() {
    const lista = document.getElementById("listaPode")
    if (!lista) return

    lista.innerHTML = ""

    pessoasPodem.forEach((pessoa) => {
        const item = document.createElement("li")
        item.textContent = pessoa
        lista.appendChild(item)
    })
}

function analisar() {
    const campoTexto = document.getElementById("texto")
    const loading = document.getElementById("loading")
    const resultado = document.getElementById("resultado")

    if (!campoTexto || !loading || !resultado) return

    const texto = campoTexto.value

    if (!texto.trim()) {
        resultado.textContent = "Digite uma resenha para analisar."
        return
    }

    loading.style.display = "flex"
    falar("Averiguando resenhas, aguarde")

    setTimeout(() => {
        const analise = analisarResenha(texto, pessoasPodem, pessoasNaoPodem)
        const probabilidade = analise.probabilidade

        loading.style.display = "none"
        resultado.textContent = `Probabilidade de resenha detectada: ${probabilidade}%`

        falar(`Análise concluída. Probabilidade de resenha detectada de ${probabilidade} por cento`)
    }, 3000)
}

window.adicionarNaoPode = adicionarNaoPode
window.adicionarPode = adicionarPode
window.analisar = analisar
