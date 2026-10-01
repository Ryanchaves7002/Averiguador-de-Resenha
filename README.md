# Averiguador de Resenha

Site estático com login, amizades, agenda de resenhas, notificações em tempo real e ranking. A interface pode ser publicada no GitHub Pages ou em outro host de arquivos estáticos. Contas e dados ficam no Supabase, não no navegador.

## Conectar o Supabase

1. Crie um projeto em <https://supabase.com/>.
2. No painel do projeto, abra **SQL Editor**, cole todo o conteúdo de `supabase-schema.sql` e execute. Isso cria as tabelas, gatilhos, permissões por usuário (RLS) e o feed em tempo real.
3. Em **Project Settings → API**, copie a **Project URL** e a chave pública **anon/publishable** para `url` e `anonKey` em `supabase-config.js`.
4. Nunca coloque a chave `service_role` nesse site. O arquivo de configuração é público; a chave anon/publishable foi projetada para o navegador e está protegida pelas políticas RLS do esquema.
5. Em **Authentication → URL Configuration**, defina a URL do site publicado e inclua também a URL de redirecionamento de email, por exemplo `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`. Para teste local, adicione `http://localhost:8000/`.
6. Publique os arquivos estáticos do repositório. No GitHub, habilite Pages para a branch/pasta que contém `index.html`.

O cadastro usa email e senha; nome, apelido e idade ficam no perfil. Se a confirmação de email estiver habilitada, a pessoa precisa abrir o link enviado antes de entrar. Use um SMTP configurado no Supabase para entrega de email de produção.

## Testar sem npm

Os testes do esquema e da interface usam somente o Node.js embutido:

```sh
node --test
```

Para visualizar o site localmente sem backend local nem npm:

```sh
python3 -m http.server 8000
```

Abra <http://localhost:8000>. O cadastro real exige ter configurado URL, chave pública e esquema do seu projeto Supabase. A mesma página pode então ser servida em qualquer hospedagem estática com HTTPS e acesso à internet.

## Recursos

- Cadastro e login remotos com sessão persistente gerenciada pelo Supabase Auth.
- Busca de usuários, pedidos de amizade, aceite, recusa e remoção.
- Agenda de eventos, participação e confirmação de presença após o evento.
- Notificações persistentes e atualização em tempo real para amigos aceitos.
- Ranking geral ou entre amigos; níveis: Resenhador Iniciante (0 a 2), Resenhador de Primeira (3 a 5), Resenhador Frequente (6 a 10), Lenda da Resenha (11 a 20) e Resenhador Supremo (21 ou mais).
