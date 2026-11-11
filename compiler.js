const assets = new URL('./vendor/busytex/', import.meta.url).href.replace(/\/$/, '');
let loaded;
let reportProgress;

function loadCompiler() {
  if (!loaded) {
    loaded = (async () => {
      const { BusyTexRunner, PdfLatex, XeLatex, LuaLatex } = await import('./vendor/texlyre/index.js');
      const runner = new BusyTexRunner({
        busytexBasePath: assets,
        preloadDataPackages: [assets + '/texlive-recommended.js'],
        onDownloadProgress: ({ percent }) => {
          reportProgress?.('Carregando TeX Live · ' + Math.min(100, Math.floor(percent)) + '%');
        }
      });
      try {
        await runner.initialize(true);
        return { runner, engines: { pdflatex: PdfLatex, xelatex: XeLatex, lualatex: LuaLatex } };
      } catch (error) {
        runner.terminate();
        throw error;
      }
    })().catch(error => {
      loaded = undefined;
      throw new Error('Não foi possível iniciar o TeX Live local. Confira se a versão gerada por npm run build foi servida por HTTP. ' + error.message);
    });
  }
  return loaded;
}

export async function compileLatex(files, engine, onStatus) {
  reportProgress = onStatus;
  try {
    const { runner, engines } = await loadCompiler();
    onStatus('Compilando no navegador…');
    const Engine = engines[engine];
    const additionalFiles = Object.entries(files)
      .filter(([path]) => path !== 'main.tex')
      .map(([path, content]) => ({ path, content }));
    const texSources = Object.entries(files)
      .filter(([path]) => /\.(tex|cls|sty)$/i.test(path))
      .map(([, content]) => content)
      .join('\n');
    const usesBiber = /\\addbibresource\s*(?:\[[^\]]*\])?\s*\{/.test(texSources);
    try {
      return await new Engine(runner).compile({
        input: files['main.tex'],
        mainTexPath: 'main.tex',
        additionalFiles,
        bibtex: !usesBiber && /\\bibliography\s*\{/.test(texSources),
        biber: usesBiber,
        rerun: true
      });
    } catch (error) {
      runner.terminate();
      loaded = undefined;
      throw error;
    }
  } finally {
    reportProgress = undefined;
  }
}
