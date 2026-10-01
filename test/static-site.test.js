const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const root = path.join(__dirname, "..")
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")

test("a página carrega como site estático sem servidor npm", () => {
    const html = read("index.html")
    assert.match(html, /@supabase\/supabase-js@2/)
    assert.match(html, /supabase-config\.js/)
    assert.match(html, /script\.js/)
    assert.doesNotMatch(html, /src=["']\/api\//)
})

test("cadastro e login usam email e senha remotos", () => {
    const html = read("index.html")
    const client = read("script.js")
    assert.match(html, /id="register-email"[^>]*type="email"/)
    assert.match(html, /id="login-email"[^>]*type="email"/)
    assert.match(client, /supabaseClient\.auth\.signUp/)
    assert.match(client, /supabaseClient\.auth\.signInWithPassword/)
    assert.match(client, /postgres_changes/)
})

test("o esquema remoto aplica segurança e preserva os recursos sociais", () => {
    const schema = read("supabase-schema.sql")
    for (const table of ["profiles", "friendships", "resenhas", "attendance", "notifications"]) {
        assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`))
    }
    assert.match(schema, /on_auth_user_created/)
    assert.match(schema, /notify_friends_new_event/)
    assert.match(schema, /notify_friendship_change/)
    assert.match(schema, /prevent_early_attendance/)
    assert.match(schema, /supabase_realtime/)
})

test("a configuração publicada não contém segredos nem credenciais fictícias", () => {
    const config = read("supabase-config.js")
    assert.match(config, /url:\s*["']https:\/\/[^"']+\.supabase\.co["']/);
    assert.doesNotMatch(config, /\/rest\/v1\/["']/);
    
    assert.doesNotMatch(config, /service_role/i)
})
