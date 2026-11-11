# Ateliê TeX

Editor LaTeX em português, inspirado no Prism, com arquivos do projeto, código e prévia lado a lado.

## Executar

Com Node.js 20 ou superior e npm instalados, execute na raiz do repositório:

```sh
npm install
npm run build
npm start
```

Abra [http://127.0.0.1:4179/](http://127.0.0.1:4179/). Use **Compilar PDF** ou **Ctrl + Enter**. O menu de compilação oferece pdfLaTeX, XeLaTeX e LuaLaTeX. Se houver erros, abra **Log**. O botão **↓** ao lado do log baixa o último PDF gerado.

## Compilação

O build baixa o [TeXlyre BusyTeX 1.4.1](https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.4.1) e inclui o TeX Live em `public/`, a pasta de saída reconhecida pela Vercel. O download inicial dos binários é grande. Ao compilar, o navegador carrega o motor e a coleção recomendada sob demanda, executa o TeX em um Web Worker e gera o PDF localmente. Os arquivos do projeto permanecem no navegador. A prévia de rascunho e o salvamento automático funcionam enquanto o compilador carrega.

O motor usa os pacotes incluídos na coleção recomendada. Projetos que exigem pacotes fora dessa coleção ou programas nativos externos podem apresentar erros. O arquivo principal é `main.tex`.

Para hospedar o site, sirva a pasta `public/` inteira por HTTP ou HTTPS. A pasta inclui os arquivos do compilador. Para verificar a sintaxe do JavaScript, use `npm run check`.

## Assistente multimodelo de IA

O editor inclui um painel de IA com conexões configuráveis para:

- OpenAI, Google Gemini, DeepSeek, OpenRouter, Groq e Mistral por API compatível com OpenAI.
- Anthropic Claude pela API Messages.
- Amazon Bedrock pela API Converse com uma Bedrock API key (Bearer token).
- Outros endpoints públicos compatíveis com a API Chat Completions.

Abra **Assistente IA → ⚙ → Nova conexão**, selecione o provedor, informe o ID exato do modelo e a chave emitida pelo serviço. Para Bedrock, informe também a região AWS e o ID do modelo. Use **Testar conexão** antes de salvar. Os nomes e IDs de modelos podem mudar; confira o catálogo atual do seu provedor.

As conexões e chaves ficam no armazenamento local do navegador. A chave é enviada por HTTPS ao endpoint do próprio projeto somente durante a solicitação e não é persistida no servidor. Use apenas em dispositivos confiáveis e não compartilhe o perfil do navegador. Para Amazon Bedrock, esta versão usa Bedrock API keys; credenciais IAM tradicionais com assinatura SigV4 ainda não estão implementadas. Endpoints personalizados precisam estar acessíveis pelo servidor e usar HTTPS em produção.

O assistente recebe o conteúdo dos arquivos do projeto para responder com contexto, pode analisar o último log de compilação e oferece a opção de inserir blocos LaTeX no ponto atual do cursor. A inserção é sempre iniciada pelo usuário.

### Desenvolvimento e implantação

A API local fica disponível em `/api/chat` quando o projeto é iniciado com `npm start`. Na Vercel, o endpoint é publicado como uma Function a partir de `api/chat.js`; a configuração de build está em `vercel.json`. Execute `npm run check` para verificar a sintaxe dos arquivos JavaScript.
