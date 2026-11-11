import { compileLatex } from './compiler.js';

const $ = id => document.getElementById(id);
const key = 'atelie-tex-v1';
const starter = [
  '\\documentclass[11pt,a4paper]{article}',
  '\\usepackage[T1]{fontenc}',
  '\\usepackage[utf8]{inputenc}',
  '\\usepackage[brazil]{babel}',
  '\\usepackage{amsmath}',
  '',
  '\\title{Meu primeiro documento}',
  '\\author{}',
  '\\date{}',
  '',
  '\\begin{document}',
  '\\maketitle',
  '',
  '\\section{Introdução}',
  'Este é um exemplo de documento em LaTeX. Edite o código ao lado para começar a escrever.',
  '',
  '\\section{Uma equação}',
  'O teorema de Pitágoras relaciona os lados de um triângulo retângulo:',
  '\\[',
  '  a^2 + b^2 = c^2',
  '\\]',
  '',
  '\\end{document}'
].join('\n');
const example = { name: 'Meu primeiro documento', active: 'main.tex', engine: 'pdflatex', files: { 'main.tex': starter } };
const validPath = path => typeof path === 'string' && path.length <= 160 &&
  /^(?:[a-z0-9_-]+\/)*[a-z0-9][a-z0-9_.-]*\.(?:tex|bib|sty|cls|ldf|txt|csv)$/i.test(path);

function validProject(project) {
  return project && typeof project.name === 'string' && project.files &&
    Object.hasOwn(project.files, 'main.tex') &&
    Object.entries(project.files).every(([path, value]) => validPath(path) && typeof value === 'string');
}

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (validProject(stored)) return stored;
  } catch {}
  return structuredClone(example);
}

let project = load();
const source = $('source');
const highlight = $('highlight');
const gutter = $('gutter');
const paper = $('paper');
const pdf = $('pdf');
const status = $('preview-status');
let previewTimer;
let paintFrame;
let saveTimer;
let outlineSource;
let logText = '';
let pdfUrl;
let compiling = false;
let revision = 0;
let compiledRevision = -1;

function save() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    localStorage.setItem(key, JSON.stringify(project));
    $('saved').textContent = 'Salvo neste navegador';
  } catch {
    $('saved').textContent = 'Falha ao salvar · exporte uma cópia';
  }
}

function queueSave() {
  if (!saveTimer) $('saved').textContent = 'Salvando…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function view(panel) {
  document.querySelector('main').dataset.view = panel;
  document.querySelectorAll('[data-panel]').forEach(button =>
    button.setAttribute('aria-pressed', String(button.dataset.panel === panel)));
}

function renderFiles() {
  const buttons = Object.keys(project.files).sort().map(path => {
    const button = node('button', '', 'file');
    button.append(node('span', path.endsWith('.tex') ? '◇' : '≡', 'file-icon'), node('span', path));
    button.setAttribute('aria-current', String(path === project.active));
    button.title = path;
    button.onclick = () => openFile(path);
    return button;
  });
  $('file-list').replaceChildren(...buttons);
}

function openFile(path, switchPanel = true) {
  project.active = Object.hasOwn(project.files, path) ? path : 'main.tex';
  source.value = project.files[project.active];
  source.setSelectionRange(0, 0);
  source.scrollTop = source.scrollLeft = 0;
  $('tab').textContent = project.active;
  $('remove').disabled = $('file-rename').disabled = project.active === 'main.tex';
  renderFiles();
  renderCode();
  renderOutline();
  if (switchPanel) view('editor');
  save();
}

function syncScroll() {
  highlight.scrollTop = gutter.scrollTop = source.scrollTop;
  highlight.scrollLeft = source.scrollLeft;
}

function cursor() {
  const start = source.value.slice(0, source.selectionStart);
  $('cursor').textContent = 'Ln ' + (start.split('\n').length) + ', Col ' + (start.length - start.lastIndexOf('\n'));
}

function renderCode() {
  const fragment = document.createDocumentFragment();
  const tokens = /\\(?:[a-zA-Z]+\*?|.)|%[^\n]*|\$[^$\n]*\$|[{}[\]]/g;
  let offset = 0;
  for (const match of source.value.matchAll(tokens)) {
    fragment.append(source.value.slice(offset, match.index));
    const character = match[0][0];
    const className = ({ '\\': 'command', '%': 'comment', '$': 'math' })[character] || 'brace';
    fragment.append(node('span', match[0], className));
    offset = match.index + match[0].length;
  }
  fragment.append(source.value.slice(offset), '\n');
  highlight.replaceChildren(fragment);
  gutter.textContent = source.value.split('\n').map((_, index) => index + 1).join('\n') + '\n';
  syncScroll();
  cursor();
}

function renderOutline() {
  if (source.value === outlineSource) return;
  outlineSource = source.value;
  const buttons = [];
  for (const match of source.value.matchAll(/\\(chapter|section|subsection)\*?\{([^{}]*)\}/g)) {
    const button = node('button', match[2]);
    if (match[1] === 'subsection') button.style.paddingLeft = '20px';
    button.onclick = () => {
      view('editor');
      source.focus();
      source.setSelectionRange(match.index, match.index + match[0].length);
      source.scrollTop = Math.max(0, source.value.slice(0, match.index).split('\n').length * 23 - 70);
      cursor();
    };
    buttons.push(button);
  }
  $('sections').replaceChildren(...buttons);
}

function plain(tex) {
  return tex.replace(/\\(?:textbf|emph|textit)\{([^{}]*)\}/g, '$1')
    .replace(/\\([%&#_$])/g, '$1').replace(/~/g, ' ').replace(/\$([^$]+)\$/g, '$1').trim();
}

function expand(path, visited = new Set()) {
  if (visited.has(path) || !Object.hasOwn(project.files, path)) return '';
  const next = new Set(visited).add(path);
  return project.files[path].replace(/\\(?:input|include)\{([^{}]+)\}/g, (_, file) =>
    expand(file.endsWith('.tex') ? file : file + '.tex', next));
}

function renderDraft() {
  const tex = expand('main.tex').replace(/(?<!\\)%[^\n]*/g, '');
  const metadata = command => plain(tex.match(new RegExp('\\\\' + command + '\\{([^{}]*)\\}'))?.[1] || '');
  const elements = [];
  let body = tex.split('\\begin{document}')[1]?.split('\\end{document}')[0] || '';
  if (body.includes('\\maketitle')) {
    if (metadata('title')) elements.push(node('h1', metadata('title')));
    const byline = [metadata('author'), metadata('date')].filter(Boolean).join(' · ');
    if (byline) elements.push(node('p', byline, 'byline'));
    body = body.replace('\\maketitle', '');
  }
  const blocks = /(\\(?:chapter|section|subsection)\*?\{[^{}]*\}|\\\[[\s\S]*?\\\]|\\begin\{equation\*?\}[\s\S]*?\\end\{equation\*?\})/g;
  let section = 0;
  for (const part of body.split(blocks)) {
    const heading = part.match(/^\\(chapter|section|subsection)(\*?)\{([^{}]*)\}$/);
    if (heading) {
      const numbered = heading[1] !== 'subsection' && !heading[2];
      elements.push(node(heading[1] === 'subsection' ? 'h3' : 'h2', (numbered ? ++section + '  ' : '') + plain(heading[3])));
    } else if (/^\\(?:\[|begin\{equation)/.test(part)) {
      const equation = part.replace(/^\\(?:\[|begin\{equation\*?\})|\\(?:\]|end\{equation\*?\})$/g, '')
        .replace(/\^2/g, '²').replace(/\^3/g, '³');
      elements.push(node('p', plain(equation), 'equation'));
    } else {
      for (const paragraph of part.split(/\n\s*\n/)) {
        if (paragraph.trim()) elements.push(node('p', plain(paragraph.replace(/\s+/g, ' '))));
      }
    }
  }
  paper.replaceChildren(...elements);
}

function edit() {
  project.files[project.active] = source.value;
  markChanged();
  if (!paintFrame) {
    paintFrame = requestAnimationFrame(() => {
      paintFrame = undefined;
      renderCode();
    });
  }
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    renderOutline();
    if (pdf.hidden) renderDraft();
  }, 180);
  queueSave();
}

function setProject() {
  $('rename').textContent = project.name;
  $('engine').value = ['pdflatex', 'xelatex', 'lualatex'].includes(project.engine) ? project.engine : 'pdflatex';
  openFile(project.active, false);
  clearPdf();
  setLog('');
  showDraft();
}

function askFilename(message, initial = '') {
  const path = prompt(message, initial)?.trim();
  if (!path) return null;
  if (!validPath(path)) {
    alert('Use um nome como capitulo.tex, referencias.bib ou partes/secao.tex.');
    return null;
  }
  if (Object.hasOwn(project.files, path)) {
    alert('Já existe um arquivo com esse nome.');
    return null;
  }
  return path;
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showDraft() {
  renderDraft();
  pdf.hidden = true;
  $('paper-area').hidden = false;
  $('draft').textContent = pdfUrl ? 'Ver PDF' : 'Rascunho';
  status.textContent = 'Rascunho visual';
}

function markChanged() {
  revision++;
  if (pdfUrl && !pdf.hidden && !compiling) status.textContent = 'Projeto alterado · recompile o PDF';
}

function showPdf() {
  $('paper-area').hidden = true;
  pdf.hidden = false;
  $('draft').textContent = 'Rascunho';
  status.textContent = compiledRevision === revision ? 'PDF compilado no navegador' : 'Projeto alterado · recompile o PDF';
}

function clearPdf() {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = undefined;
  pdf.removeAttribute('src');
  $('download-pdf').disabled = $('draft').disabled = true;
}

function setLog(text) {
  logText = text;
  $('show-log').disabled = !text;
}

async function compile() {
  if (compiling) return;
  const snapshot = { ...project.files };
  const snapshotRevision = revision;
  const sourceProject = project;
  const engine = $('engine').value;
  const button = $('compile');
  compiling = true;
  button.disabled = true;
  button.textContent = 'Compilando…';
  view('preview');
  status.textContent = 'Preparando o compilador local…';
  setLog('');
  try {
    const result = await compileLatex(snapshot, engine, message => {
      if (project === sourceProject) status.textContent = message;
    });
    if (project !== sourceProject) return;
    setLog(result.log || '');
    if (!result.success || !result.pdf?.length) {
      if (!logText) setLog('O compilador não gerou um PDF. Verifique o arquivo main.tex.');
      status.textContent = 'Erro de LaTeX · consulte o log';
      return;
    }
    clearPdf();
    pdfUrl = URL.createObjectURL(new Blob([result.pdf], { type: 'application/pdf' }));
    pdf.src = pdfUrl;
    compiledRevision = snapshotRevision;
    $('download-pdf').disabled = $('draft').disabled = false;
    showPdf();
  } catch (error) {
    if (project !== sourceProject) return;
    setLog(error.message || String(error));
    status.textContent = 'Falha no compilador · consulte o log';
  } finally {
    compiling = false;
    button.disabled = false;
    button.textContent = '▷ Compilar PDF';
  }
}

document.querySelectorAll('[data-panel]').forEach(button =>
  button.onclick = () => view(button.dataset.panel));
source.addEventListener('input', edit);
source.addEventListener('scroll', syncScroll);
source.addEventListener('selectionchange', cursor);
source.addEventListener('click', cursor);
source.addEventListener('keyup', cursor);
source.addEventListener('keydown', event => {
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end');
    edit();
  }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !$('compile-log').open) {
    event.preventDefault();
    compile();
  }
});
window.addEventListener('pagehide', () => { if (saveTimer) save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) save(); });
$('rename').onclick = () => {
  const name = prompt('Nome do projeto', project.name)?.trim();
  if (name) {
    project.name = name.slice(0, 100);
    $('rename').textContent = project.name;
    save();
  }
};
$('add').onclick = () => {
  const path = askFilename('Nome do novo arquivo', 'secao.tex');
  if (path) {
    project.files[path] = '';
    markChanged();
    openFile(path);
    source.focus();
  }
};
$('file-rename').onclick = () => {
  const path = askFilename('Novo nome do arquivo', project.active);
  if (path) {
    project.files[path] = project.files[project.active];
    delete project.files[project.active];
    markChanged();
    openFile(path);
    renderDraft();
  }
};
$('remove').onclick = () => {
  if (project.active !== 'main.tex' && confirm('Excluir ' + project.active + '?')) {
    delete project.files[project.active];
    markChanged();
    openFile('main.tex');
    renderDraft();
  }
};
$('import').onclick = () => $('uploads').click();
$('uploads').accept += ',.json';
$('uploads').onchange = async event => {
  const files = [...event.target.files];
  event.target.value = '';
  try {
    if (files.length === 1 && files[0].name.endsWith('.json')) {
      const incoming = JSON.parse(await files[0].text());
      if (!validProject(incoming)) throw new Error('O arquivo não é um projeto do Ateliê TeX.');
      if (!confirm('Substituir o projeto aberto pela cópia importada?')) return;
      project = incoming;
      setProject();
      return;
    }
    const incoming = await Promise.all(files.map(async file => {
      if (!validPath(file.name)) throw new Error('Arquivo incompatível: ' + file.name);
      return [file.name, await file.text()];
    }));
    if (!incoming.length) return;
    if (incoming.some(([name]) => Object.hasOwn(project.files, name)) &&
      !confirm('Substituir os arquivos que têm o mesmo nome?')) return;
    for (const [name, content] of incoming) project.files[name] = content;
    markChanged();
    openFile(incoming[0][0]);
    renderDraft();
  } catch (error) {
    alert(error.message);
  }
};
$('export').onclick = () => download('projeto-atelie-tex.json', JSON.stringify(project, null, 2), 'application/json');
$('engine').onchange = () => {
  project.engine = $('engine').value;
  markChanged();
  save();
};
$('draft').onclick = () => pdf.hidden ? showPdf() : showDraft();
$('compile').onclick = compile;
$('show-log').onclick = () => {
  $('log-output').textContent = logText;
  $('compile-log').showModal();
};
$('download-pdf').onclick = () => {
  const link = document.createElement('a');
  link.href = pdfUrl;
  link.download = (project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'documento') + '.pdf';
  link.click();
};
setProject();
