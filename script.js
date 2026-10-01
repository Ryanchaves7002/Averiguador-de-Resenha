const pessoasNaoPodem = []
const pessoasPodem = []
let usuarioAtual = null
let perfilAtual = null
let canalNotificacoes = null
let escopoRanking = "all"
const configSupabase = window.SUPABASE_CONFIG || {}
const clientReady = Boolean(configSupabase.url && configSupabase.anonKey && window.supabase)
const supabaseClient = clientReady
    ? window.supabase.createClient(configSupabase.url, configSupabase.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    : null

function atualizarContagemRegressiva() {
    const dataAlvo = new Date(2027, 8, 29)
    const restante = Math.max(0, dataAlvo.getTime() - Date.now())
    const unidades = {
        days: Math.floor(restante / 86400000),
        hours: Math.floor((restante % 86400000) / 3600000),
        minutes: Math.floor((restante % 3600000) / 60000),
        seconds: Math.floor((restante % 60000) / 1000)
    }
    Object.entries(unidades).forEach(([unidade, valor]) => {
        const display = document.getElementById(`countdown-${unidade}`)
        if (display) display.textContent = String(valor).padStart(unidade === "days" ? 3 : 2, "0")
    })
}

function criarElemento(tag, className, texto) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (texto !== undefined) node.textContent = texto
    return node
}

function mostrarMensagem(id, message, isError = false) {
    const target = document.getElementById(id)
    if (!target) return
    target.textContent = message
    target.classList.toggle("is-error", isError)
}

function mensagemErro(error) {
    const message = String(error?.message || "")
    if (/nickname|profiles_nickname_lower_unique|duplicate key/i.test(message)) return "Esse apelido já está em uso. Escolha outro."
    if (/Invalid login credentials/i.test(message)) return "Email ou senha incorretos."
    if (/Email not confirmed/i.test(message)) return "Confirme seu email pelo link enviado antes de entrar."
    if (/rate limit|too many requests/i.test(message)) return "Muitas tentativas. Aguarde um pouco e tente novamente."
    if (/Failed to fetch|NetworkError|fetch/i.test(message)) return "Sem conexão com o serviço de contas. Verifique a internet e a configuração do Supabase."
    return message || "Não foi possível concluir. Confira os dados e tente novamente."
}

function exigirSupabase() {
    if (supabaseClient) return true
    mostrarMensagem("auth-message", "Falta conectar o Supabase. Preencha a URL e a chave pública em supabase-config.js e execute supabase-schema.sql no painel do Supabase.", true)
    return false
}

function mostrarLogin() {
    usuarioAtual = null
    perfilAtual = null
    if (canalNotificacoes && supabaseClient) supabaseClient.removeChannel(canalNotificacoes)
    canalNotificacoes = null
    document.getElementById("auth-view").hidden = false
    document.getElementById("app-view").hidden = true
    document.getElementById("header-account").hidden = true
}

async function carregarUsuario(user) {
    if (!user || !supabaseClient) return mostrarLogin()
    const { data, error } = await supabaseClient.from("profiles").select("id,name,nickname,age").eq("id", user.id).single()
    if (error) {
        mostrarLogin()
        mostrarMensagem("auth-message", mensagemErro(error), true)
        return
    }
    usuarioAtual = user
    perfilAtual = data
    document.getElementById("auth-view").hidden = true
    document.getElementById("app-view").hidden = false
    document.getElementById("header-account").hidden = false
    document.getElementById("header-nickname").textContent = `@${data.nickname}`
    document.getElementById("profile-name").textContent = data.name
    document.getElementById("profile-avatar").textContent = data.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR")
    ativarPainel("resenhas-panel")
    await carregarPainel()
    if (canalNotificacoes) await supabaseClient.removeChannel(canalNotificacoes)
    canalNotificacoes = supabaseClient.channel(`notificacoes-${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, async () => {
            await Promise.allSettled([carregarNotificacoes(), carregarAmigos(), carregarEventos()])
        })
        .subscribe()
}

async function carregarPainel() {
    try {
        await Promise.all([carregarEventos(), carregarAmigos(), carregarNotificacoes(), carregarRanking()])
        await atualizarProgresso()
    } catch (error) {
        mostrarMensagem("event-feedback", mensagemErro(error), true)
    }
}

function ativarPainel(panelId) {
    document.querySelectorAll(".app-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.panel === panelId))
    document.querySelectorAll(".app-panel").forEach((panel) => { panel.hidden = panel.id !== panelId })
    if (panelId === "notifications-panel") marcarNotificacoesLidas()
}

function formatarData(timestamp) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(timestamp))
}

async function carregarEventos() {
    const { data: events, error } = await supabaseClient.from("resenhas").select("*").order("starts_at", { ascending: true }).limit(100)
    if (error) throw error
    const eventIds = events.map((event) => event.id)
    const profileIds = [...new Set(events.map((event) => event.owner_id))]
    const [attendancesResult, profilesResult] = await Promise.all([
        eventIds.length ? supabaseClient.from("attendance").select("resenha_id,user_id,going,attended").in("resenha_id", eventIds) : Promise.resolve({ data: [], error: null }),
        profileIds.length ? supabaseClient.from("profiles").select("id,name,nickname").in("id", profileIds) : Promise.resolve({ data: [], error: null })
    ])
    if (attendancesResult.error) throw attendancesResult.error
    if (profilesResult.error) throw profilesResult.error
    const profiles = new Map(profilesResult.data.map((profile) => [profile.id, profile]))
    const attendanceByEvent = new Map()
    for (const attendance of attendancesResult.data) {
        if (!attendanceByEvent.has(attendance.resenha_id)) attendanceByEvent.set(attendance.resenha_id, [])
        attendanceByEvent.get(attendance.resenha_id).push(attendance)
    }
    desenharEventos(events.map((event) => ({
        ...event,
        owner_name: profiles.get(event.owner_id)?.name || "Membro da turma",
        owner_nickname: profiles.get(event.owner_id)?.nickname || "membro",
        attendance: attendanceByEvent.get(event.id) || []
    })))
}

function desenharEventos(events) {
    const list = document.getElementById("event-list")
    list.replaceChildren()
    if (!events.length) {
        list.append(criarElemento("p", "empty-state", "Nenhuma resenha marcada. A primeira é sua."))
        return
    }
    for (const event of events) {
        const eventAttendance = event.attendance
        const mine = eventAttendance.find((attendance) => attendance.user_id === usuarioAtual.id)
        const count = eventAttendance.filter((attendance) => attendance.going).length
        const card = criarElemento("article", `event-card${Date.parse(event.starts_at) < Date.now() ? " past-event" : ""}`)
        const header = criarElemento("div", "event-card-header")
        const details = criarElemento("div", "event-card-details")
        details.append(criarElemento("p", "event-date", formatarData(event.starts_at)))
        details.append(criarElemento("h3", "", event.title))
        details.append(criarElemento("p", "event-place", `${event.place} · ${count} ${count === 1 ? "pessoa confirmada" : "pessoas confirmadas"}`))
        header.append(details)
        header.append(criarElemento("span", "event-host", event.owner_id === usuarioAtual.id ? "Organizada por você" : `@${event.owner_nickname}`))
        card.append(header)
        if (event.description) card.append(criarElemento("p", "event-description", event.description))
        const actions = criarElemento("div", "event-actions")
        if (Date.parse(event.starts_at) >= Date.now() && !mine?.going) {
            const join = criarElemento("button", "small-action", "Vou participar")
            join.type = "button"
            join.addEventListener("click", () => participarResenha(event.id))
            actions.append(join)
        } else if (Date.parse(event.starts_at) >= Date.now()) {
            actions.append(criarElemento("span", "event-confirmation", "Você vai"))
        } else if (mine?.attended) {
            actions.append(criarElemento("span", "event-confirmation", "Presença confirmada"))
        } else {
            const attended = criarElemento("button", "small-action", "Confirmar presença")
            attended.type = "button"
            attended.addEventListener("click", () => confirmarPresenca(event.id))
            actions.append(attended)
        }
        if (actions.childNodes.length) card.append(actions)
        list.append(card)
    }
}

async function participarResenha(id) {
    const { error } = await supabaseClient.from("attendance").upsert({ resenha_id: id, user_id: usuarioAtual.id, going: true }, { onConflict: "resenha_id,user_id" })
    if (error) return mostrarMensagem("event-feedback", mensagemErro(error), true)
    mostrarMensagem("event-feedback", "Você entrou na lista. Seus amigos foram avisados.")
    await carregarEventos()
}

async function confirmarPresenca(id) {
    const { error } = await supabaseClient.from("attendance").upsert({ resenha_id: id, user_id: usuarioAtual.id, going: true, attended: true }, { onConflict: "resenha_id,user_id" })
    if (error) return mostrarMensagem("event-feedback", mensagemErro(error), true)
    mostrarMensagem("event-feedback", "Presença registrada. Seu ranking foi atualizado.")
    await Promise.all([carregarEventos(), carregarRanking(), atualizarProgresso()])
}

function desenharPessoa(person, actions = []) {
    const row = criarElemento("div", "person-row")
    const identity = criarElemento("div", "person-identity")
    identity.append(criarElemento("strong", "", person.name))
    identity.append(criarElemento("span", "", `@${person.nickname}`))
    row.append(identity)
    const buttons = criarElemento("div", "person-actions")
    for (const action of actions) {
        const button = criarElemento("button", action.className || "small-action", action.label)
        button.type = "button"
        button.addEventListener("click", action.onClick)
        buttons.append(button)
    }
    if (buttons.childNodes.length) row.append(buttons)
    return row
}

function desenharListaPessoas(id, people, emptyMessage, actionFactory) {
    const list = document.getElementById(id)
    list.replaceChildren()
    if (!people.length) {
        list.append(criarElemento("p", "empty-state", emptyMessage))
        return
    }
    for (const person of people) list.append(desenharPessoa(person, actionFactory ? actionFactory(person) : []))
}

async function carregarAmigos() {
    const { data: rows, error } = await supabaseClient.from("friendships").select("id,requester_id,addressee_id,status,created_at").or(`requester_id.eq.${usuarioAtual.id},addressee_id.eq.${usuarioAtual.id}`).order("created_at", { ascending: false })
    if (error) throw error
    const friends = rows.filter((row) => row.status === "accepted")
    const incoming = rows.filter((row) => row.status === "pending" && row.addressee_id === usuarioAtual.id)
    const outgoing = rows.filter((row) => row.status === "pending" && row.requester_id === usuarioAtual.id)
    const otherIds = [...new Set(rows.map((row) => row.requester_id === usuarioAtual.id ? row.addressee_id : row.requester_id))]
    const { data: profiles, error: profilesError } = otherIds.length
        ? await supabaseClient.from("profiles").select("id,name,nickname,age").in("id", otherIds)
        : { data: [], error: null }
    if (profilesError) throw profilesError
    const byId = new Map(profiles.map((profile) => [profile.id, profile]))
    const details = (row, otherId) => ({ ...byId.get(otherId), request_id: row.id })
    desenharListaPessoas("incoming-requests", incoming.map((row) => details(row, row.requester_id)), "Nenhum pedido por enquanto.", (person) => [
        { label: "Aceitar", onClick: () => responderPedido(person.request_id, "accepted") },
        { label: "Recusar", className: "small-action secondary-action", onClick: () => responderPedido(person.request_id, "declined") }
    ])
    desenharListaPessoas("outgoing-requests", outgoing.map((row) => details(row, row.addressee_id)), "Nenhum pedido enviado.")
    desenharListaPessoas("friend-list", friends.map((row) => details(row, row.requester_id === usuarioAtual.id ? row.addressee_id : row.requester_id)), "Sua turma aparece aqui quando aceitar os convites.", (person) => [
        { label: "Remover", className: "small-action secondary-action", onClick: () => removerAmigo(person.id) }
    ])
    const badge = document.getElementById("friend-request-count")
    badge.textContent = incoming.length
    badge.hidden = incoming.length === 0
}

async function responderPedido(id, status) {
    const { error } = await supabaseClient.from("friendships").update({ status }).eq("id", id)
    if (error) return mostrarMensagem("auth-message", mensagemErro(error), true)
    await Promise.all([carregarAmigos(), carregarRanking()])
}

async function removerAmigo(id) {
    const { error } = await supabaseClient.from("friendships").delete().eq("status", "accepted").or(`and(requester_id.eq.${usuarioAtual.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${usuarioAtual.id})`)
    if (error) return mostrarMensagem("auth-message", mensagemErro(error), true)
    await Promise.all([carregarAmigos(), carregarRanking()])
}

async function buscarPessoas(query) {
    const safeQuery = query.replace(/[%,()_]/g, " ").trim()
    if (safeQuery.length < 2) return desenharListaPessoas("search-results", [], "Digite ao menos 2 letras ou números.")
    const { data: profiles, error } = await supabaseClient.from("profiles").select("id,name,nickname,age").neq("id", usuarioAtual.id).or(`name.ilike.%${safeQuery}%,nickname.ilike.%${safeQuery}%`).order("name").limit(20)
    if (error) throw error
    const ids = profiles.map((profile) => profile.id)
    const { data: relations, error: relationsError } = ids.length
        ? await supabaseClient.from("friendships").select("requester_id,addressee_id,status").or(`requester_id.eq.${usuarioAtual.id},addressee_id.eq.${usuarioAtual.id}`)
        : { data: [], error: null }
    if (relationsError) throw relationsError
    const byId = new Map(relations.map((row) => [row.requester_id === usuarioAtual.id ? row.addressee_id : row.requester_id, row]))
    desenharListaPessoas("search-results", profiles, "Nenhuma pessoa encontrada.", (person) => {
        const relation = byId.get(person.id)
        if (relation?.status === "accepted") return [{ label: "Já são amigos", className: "small-action secondary-action", onClick: () => {} }]
        if (relation?.status === "pending") return [{ label: relation.requester_id === usuarioAtual.id ? "Pedido enviado" : "Pedido recebido", className: "small-action secondary-action", onClick: () => {} }]
        return [{ label: "Adicionar amigo", onClick: () => enviarPedido(person.id) }]
    })
}

async function enviarPedido(userId) {
    const { data: existing, error: lookupError } = await supabaseClient.from("friendships").select("id,requester_id,addressee_id,status").or(`and(requester_id.eq.${usuarioAtual.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${usuarioAtual.id})`)
    if (lookupError) return mostrarMensagem("auth-message", mensagemErro(lookupError), true)
    const relation = existing.find((row) => row.status === "accepted" || row.status === "pending")
    if (relation) {
        if (relation.status === "pending" && relation.addressee_id === usuarioAtual.id) {
            return mostrarMensagem("auth-message", "Essa pessoa já enviou um pedido. Aceite em Pedidos recebidos.")
        }
        return mostrarMensagem("auth-message", "Já existe uma amizade ou solicitação entre vocês.")
    }
    const declinedByMe = existing.find((row) => row.status === "declined" && row.requester_id === usuarioAtual.id)
    const result = declinedByMe
        ? await supabaseClient.from("friendships").update({ status: "pending", created_at: new Date().toISOString() }).eq("id", declinedByMe.id)
        : await supabaseClient.from("friendships").insert({ requester_id: usuarioAtual.id, addressee_id: userId, status: "pending" })
    if (result.error) return mostrarMensagem("auth-message", mensagemErro(result.error), true)
    await Promise.all([carregarAmigos(), buscarPessoas(document.getElementById("user-search").value.trim())])
}

async function carregarNotificacoes() {
    const { data, error } = await supabaseClient.from("notifications").select("id,type,message,resenha_id,is_read,created_at,actor_id").order("created_at", { ascending: false }).limit(50)
    if (error) throw error
    const list = document.getElementById("notification-list")
    list.replaceChildren()
    const unread = data.filter((notification) => !notification.is_read).length
    const badge = document.getElementById("notification-count")
    badge.textContent = unread
    badge.hidden = unread === 0
    if (!data.length) return list.append(criarElemento("p", "empty-state", "As novidades da sua turma aparecem aqui."))
    for (const notification of data) {
        const item = criarElemento("article", `notification-item${notification.is_read ? "" : " unread"}`)
        item.append(criarElemento("p", "", notification.message))
        item.append(criarElemento("time", "", formatarData(notification.created_at)))
        list.append(item)
    }
}

async function marcarNotificacoesLidas() {
    if (!supabaseClient || !usuarioAtual) return
    const { error } = await supabaseClient.from("notifications").update({ is_read: true }).eq("user_id", usuarioAtual.id).eq("is_read", false)
    if (!error) document.getElementById("notification-count").hidden = true
}

function tituloNivel(total) {
    if (total >= 21) return "Resenhador Supremo"
    if (total >= 11) return "Lenda da Resenha"
    if (total >= 6) return "Resenhador Frequente"
    if (total >= 3) return "Resenhador de Primeira"
    return "Resenhador Iniciante"
}

async function carregarRanking() {
    const [{ data: profiles, error: profileError }, { data: attendance, error: attendanceError }] = await Promise.all([
        supabaseClient.from("profiles").select("id,name,nickname").order("name").limit(1000),
        supabaseClient.from("attendance").select("user_id").eq("attended", true).limit(10000)
    ])
    if (profileError) throw profileError
    if (attendanceError) throw attendanceError
    let eligible = profiles
    if (escopoRanking === "friends") {
        const { data: relations, error } = await supabaseClient.from("friendships").select("requester_id,addressee_id").eq("status", "accepted").or(`requester_id.eq.${usuarioAtual.id},addressee_id.eq.${usuarioAtual.id}`)
        if (error) throw error
        const ids = new Set([usuarioAtual.id])
        for (const relation of relations) ids.add(relation.requester_id === usuarioAtual.id ? relation.addressee_id : relation.requester_id)
        eligible = profiles.filter((person) => ids.has(person.id))
    }
    const totals = new Map()
    attendance.forEach(({ user_id }) => totals.set(user_id, (totals.get(user_id) || 0) + 1))
    const rankings = eligible.map((person) => ({ ...person, total: totals.get(person.id) || 0, title: tituloNivel(totals.get(person.id) || 0) }))
        .sort((a, b) => b.total - a.total || a.nickname.localeCompare(b.nickname, "pt-BR"))
    const list = document.getElementById("ranking-list")
    list.replaceChildren()
    if (!rankings.length) return list.append(criarElemento("li", "empty-state", "O ranking aparece quando a turma confirmar presenças."))
    rankings.forEach((person, index) => {
        const row = criarElemento("li", `ranking-row${person.id === usuarioAtual.id ? " current-user" : ""}`)
        row.append(criarElemento("span", "ranking-position", String(index + 1).padStart(2, "0")))
        const identity = criarElemento("div", "ranking-identity")
        identity.append(criarElemento("strong", "", person.name))
        identity.append(criarElemento("span", "", `${person.title} · @${person.nickname}`))
        row.append(identity)
        row.append(criarElemento("strong", "ranking-score", String(person.total)))
        list.append(row)
    })
}

async function atualizarProgresso() {
    const { data, error } = await supabaseClient.from("attendance").select("resenha_id").eq("user_id", usuarioAtual.id).eq("attended", true)
    if (error) throw error
    document.getElementById("profile-total").textContent = data.length
    document.getElementById("profile-level").textContent = tituloNivel(data.length)
}

function configurarAbas() {
    document.getElementById("login-tab").addEventListener("click", () => alternarModoAuth("login"))
    document.getElementById("register-tab").addEventListener("click", () => alternarModoAuth("register"))
    document.getElementById("login-form").addEventListener("submit", (event) => enviarAuth(event, "login"))
    document.getElementById("register-form").addEventListener("submit", (event) => enviarAuth(event, "register"))
    document.getElementById("logout-button").addEventListener("click", async () => { await supabaseClient.auth.signOut() })
    document.querySelectorAll(".app-tab").forEach((tab) => tab.addEventListener("click", () => ativarPainel(tab.dataset.panel)))
    document.getElementById("resenha-form").addEventListener("submit", criarResenha)
    document.getElementById("search-form").addEventListener("submit", async (event) => {
        event.preventDefault()
        const query = document.getElementById("user-search").value.trim()
        if (query.length < 2) return mostrarMensagem("auth-message", "Digite pelo menos 2 caracteres para buscar.", true)
        try { await buscarPessoas(query) } catch (error) { mostrarMensagem("auth-message", mensagemErro(error), true) }
    })
    document.querySelectorAll(".scope-button").forEach((button) => button.addEventListener("click", async () => {
        escopoRanking = button.dataset.scope
        document.querySelectorAll(".scope-button").forEach((item) => item.classList.toggle("active", item === button))
        try { await carregarRanking() } catch (error) { mostrarMensagem("auth-message", mensagemErro(error), true) }
    }))
}

function alternarModoAuth(mode) {
    const loginMode = mode === "login"
    document.getElementById("login-form").hidden = !loginMode
    document.getElementById("register-form").hidden = loginMode
    document.getElementById("login-tab").classList.toggle("active", loginMode)
    document.getElementById("register-tab").classList.toggle("active", !loginMode)
    document.getElementById("login-tab").setAttribute("aria-selected", String(loginMode))
    document.getElementById("register-tab").setAttribute("aria-selected", String(!loginMode))
    mostrarMensagem("auth-message", clientReady ? "" : "Cadastre seu projeto Supabase para habilitar contas em qualquer hospedagem.")
}

async function enviarAuth(event, mode) {
    event.preventDefault()
    if (!exigirSupabase()) return
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    const button = form.querySelector("button[type='submit']")
    button.disabled = true
    mostrarMensagem("auth-message", "")
    try {
        if (mode === "register") {
            values.age = Number(values.age)
            const { data, error } = await supabaseClient.auth.signUp({
                email: values.email,
                password: values.password,
                options: {
                    data: { name: values.name, nickname: values.nickname, age: values.age },
                    emailRedirectTo: window.location.href
                }
            })
            if (error) throw error
            form.reset()
            if (!data.session) {
                alternarModoAuth("login")
                mostrarMensagem("auth-message", "Conta criada. Confirme o email enviado para ativar o acesso.")
            } else mostrarMensagem("auth-message", "Conta criada. Entrando na resenha...")
        } else {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email: values.email, password: values.password })
            if (error) throw error
            form.reset()
            mostrarMensagem("auth-message", "Entrando na resenha...")
        }
    } catch (error) {
        mostrarMensagem("auth-message", mensagemErro(error), true)
    } finally {
        button.disabled = false
    }
}

async function criarResenha(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    const startsAt = new Date(values.startsAt)
    if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return mostrarMensagem("event-feedback", "Escolha uma data e horário futuros.", true)
    const { error } = await supabaseClient.from("resenhas").insert({
        owner_id: usuarioAtual.id,
        title: values.title.trim(),
        starts_at: startsAt.toISOString(),
        place: values.place.trim(),
        description: values.description.trim()
    })
    if (error) return mostrarMensagem("event-feedback", mensagemErro(error), true)
    form.reset()
    mostrarMensagem("event-feedback", "Resenha marcada! Seus amigos foram avisados.")
    await carregarEventos()
}

function falar(texto) {
    const mensagem = String(texto || "").trim()
    if (!mensagem || !("speechSynthesis" in window)) return
    const fala = new SpeechSynthesisUtterance(mensagem)
    fala.lang = "pt-BR"
    fala.rate = 1
    fala.pitch = 1
    speechSynthesis.cancel()
    speechSynthesis.speak(fala)
}

function obterValorCampo(id) {
    const field = document.getElementById(id)
    return field ? field.value.trim() : ""
}

function limparCampo(id) {
    const field = document.getElementById(id)
    if (field) field.value = ""
}

function adicionarNaoPode() {
    const nome = obterValorCampo("nomeNaoPode")
    const motivo = obterValorCampo("motivoNaoPode")
    if (!nome || !motivo) return
    pessoasNaoPodem.push({ nome, motivo })
    atualizarLista("listaNaoPode", pessoasNaoPodem.map((person) => `${person.nome} - ${person.motivo}`))
    limparCampo("nomeNaoPode")
    limparCampo("motivoNaoPode")
}

function adicionarPode() {
    const nome = obterValorCampo("nomePode")
    if (!nome) return
    pessoasPodem.push(nome)
    atualizarLista("listaPode", pessoasPodem)
    limparCampo("nomePode")
}

function atualizarLista(id, values) {
    const list = document.getElementById(id)
    list.replaceChildren(...values.map((value) => criarElemento("li", "", value)))
}

function analisar() {
    const campoTexto = document.getElementById("texto")
    const loading = document.getElementById("loading")
    const resultado = document.getElementById("resultado")
    if (!campoTexto || !loading || !resultado) return
    if (!campoTexto.value.trim()) {
        resultado.textContent = "Digite uma resenha para analisar."
        return
    }
    loading.style.display = "flex"
    falar("Averiguando resenhas, aguarde")
    setTimeout(() => {
        const analise = analisarResenha(campoTexto.value, pessoasPodem, pessoasNaoPodem)
        loading.style.display = "none"
        resultado.textContent = `Probabilidade de resenha detectada: ${analise.probabilidade}%`
        falar(`Análise concluída. Probabilidade de resenha detectada de ${analise.probabilidade} por cento`)
    }, 1200)
}

window.adicionarNaoPode = adicionarNaoPode
window.adicionarPode = adicionarPode
window.analisar = analisar

configurarAbas()
atualizarContagemRegressiva()
setInterval(atualizarContagemRegressiva, 1000)

if (!window.supabase) {
    mostrarLogin()
    mostrarMensagem("auth-message", "Não foi possível carregar o serviço de contas. Confira sua conexão com a internet.", true)
} else if (!clientReady) {
    mostrarLogin()
    mostrarMensagem("auth-message", "Falta conectar o Supabase. Siga as instruções do README para ativar cadastro e login.")
} else {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") mostrarLogin()
        else if (event === "SIGNED_IN" && session) setTimeout(() => carregarUsuario(session.user), 0)
    })
    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) mostrarMensagem("auth-message", mensagemErro(error), true)
        if (data.session) carregarUsuario(data.session.user)
        else mostrarLogin()
    })
}
