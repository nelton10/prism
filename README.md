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

O build baixa o [TeXlyre BusyTeX 1.4.1](https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.4.1) e inclui o TeX Live em `site-build/`. O download inicial dos binários é grande. Ao compilar, o navegador carrega o motor e a coleção recomendada sob demanda, executa o TeX em um Web Worker e gera o PDF localmente. Os arquivos do projeto permanecem no navegador. A prévia de rascunho e o salvamento automático funcionam enquanto o compilador carrega.

O motor usa os pacotes incluídos na coleção recomendada. Projetos que exigem pacotes fora dessa coleção ou programas nativos externos podem apresentar erros. O arquivo principal é `main.tex`.

Para hospedar o site, sirva a pasta `site-build/` inteira por HTTP ou HTTPS. A pasta inclui os arquivos do compilador. Para verificar a sintaxe do JavaScript, use `npm run check`.
