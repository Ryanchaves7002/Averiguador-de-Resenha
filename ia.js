const palavrasDeResenha = [
	"resenha", "festa", "churrasco", "churras", "open bar", "cerveja",
	"paredao", "role", "balada", "jogar", "jogando", "jogo", "jogos",
	"bebida", "bebidas", "amigos", "amigo", "amizade", "diversao",
	"divertido", "divertida"
]

const motivosBloqueantes = [
	"trabalho", "prova", "doente", "viagem", "familia", "estudo",
	"compromisso", "outro compromisso", "outros compromissos"
]

function normalizarTexto(texto) {
	return String(texto || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLowerCase()
}

function limitarPontuacao(pontuacao) {
	return Math.max(0, Math.min(100, pontuacao))
}

function analisarResenha(texto, pessoasPodem = [], pessoasNaoPodem = []) {
	const mensagem = normalizarTexto(texto)
	const palavrasEncontradas = palavrasDeResenha.filter((palavra) =>
		mensagem.includes(palavra)
	)
	const impedimentosEncontrados = pessoasNaoPodem.filter((pessoa) => {
		const motivo = normalizarTexto(pessoa && pessoa.motivo)
		return motivosBloqueantes.some((bloqueio) => motivo.includes(bloqueio))
	})

	const pontosDaMensagem = palavrasEncontradas.length * 15
	const pontosDaLista = Math.min(pessoasPodem.length * 10, 30)
	const descontoDosImpedimentos = impedimentosEncontrados.length * 10
	const probabilidade = limitarPontuacao(
		pontosDaMensagem + pontosDaLista - descontoDosImpedimentos
	)

	return {
		probabilidade,
		palavrasEncontradas,
		impedimentosEncontrados,
		temSinaisDeResenha: palavrasEncontradas.length > 0
	}
}