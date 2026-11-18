/* UX-only layer for the refreshed interface.
   Citation extraction, translation requests and briefing data flows remain in the original modules. */
(function () {
  "use strict";

  var COPY = {
    en: {
      skipToContent: "Skip to content", languageLabel: "Language", brandHome: "VerifyCites home", navLabel: "Primary navigation", navCheck: "Citation checker", navBriefing: "Briefing", navTranslation: "Translate", navCli: "CLI check", navImmigration: "Immigration guide", navBia: "BIA precedent search", navQuery: "Query translation",
      heroKicker: "A focused workspace for cited cases", factLocal: "Your pasted text stays in this browser",
      factNoLookup: "Each case is looked up by volume and page", factCli: "Existence and case name only. Not good-law status",
      trustSummary: "Important limits — please read", primaryTask: "Primary task",
      checkerTitle: "Check citations in a document",
      checkerDescription: "Paste legal text or upload a plain-text file. Each citation is marked Verified \u2014 found, Not found, or Not checked.",
      inputLabel: "Document text", inputMeta: "Text is processed in this browser",
      inputHint: "Your document stays in this browser. To check a court citation, this page sends only that citation (volume, reporter, and page) to this site, which asks CourtListener. It does not send the rest of this text anywhere.",
      uploadFile: "Upload .txt file", trySample: "Try a sample", clearInput: "Clear text",
      resultsHeading: "Citation check", resultsPlaceholder: "Your citation check will appear here.",
      resultsPlaceholderHint: "Start by pasting text above or loading the sample.",
      browserModeNotePrefix: "Rows outside the lookup coverage are marked NOT_CHECKED. Use the links to check them by hand. ",
      browserModeNoteLink: "The CLI",
      browserModeNoteSuffix: " checks CourtListener case existence and case name only. It does not check statutes, regulations, BIA, AAO, the INA, or the C.F.R.",
      utilityTool: "Optional tool", querySummary: "Translate a query to English before extracting citation patterns.",
      queryPlaceholder: "Your original text will appear here after extraction.",
      queryHelp: "Automatic translation requires a translation endpoint you provide in the opinion translator below. Without it, no English query is generated.",
      translationIntro: "Compare pasted opinion paragraphs with a machine translation from an endpoint you choose.",
      opinionLabel: "Opinion text", optionalDaily: "Optional · saved in this browser",
      briefingLocalNote: "Preferences are stored in this browser only. When you request today's briefing, saved state, topic and citation query strings are sent to CourtListener.",
      advancedOption: "CLI check", cliExplanation: "The browser page checks reported court citations with CourtListener (through this site) and I&N Dec. citations against our BIA library. The CLI can run the same CourtListener check on your computer when you provide your own token; by default it does not send the brief text.",
      cliCommandLabel: "Run in a terminal", copyCommand: "Copy command", copiedCommand: "Command copied.",
      copyFailed: "Could not copy automatically. Select and copy the command manually.", readFullGuide: "Read the CLI check instructions on GitHub ↗",
      characters: "{n} characters", checking: "Extracting…", validationEmpty: "Paste text or choose a .txt file before extracting citations.",
      extractionDone: "Extraction complete. Review each citation and source link below.", noCitations: "No citation patterns were detected. Check that the text includes a reporter abbreviation and page number, or try the sample.",
      extractionError: "We could not extract citations from this text. Please try again or upload a plain-text file.",
      sampleLoaded: "Sample loaded: three real citations (a federal case, an INA section, a BIA decision). Review the text, then extract citations.", cleared: "Input and results cleared.", fileLoaded: "Loaded {name}.",
      translating: "Translation request in progress…", translateNoText: "Paste opinion text first.",
      translateDone: "Translation view updated. Review the original before relying on any translation.",
      queryEmpty: "Enter an English query before extracting citation patterns.", queryCopied: "Copied."
    },
    es: {
      skipToContent: "Saltar al contenido", languageLabel: "Idioma", brandHome: "Inicio de VerifyCites", navLabel: "Navegación principal", navCheck: "Verificador de citas", navBriefing: "Resumen", navTranslation: "Traducción", navCli: "Verificación CLI", navImmigration: "Guía de inmigración", navBia: "Búsqueda de precedentes de la BIA", navQuery: "Traducción de consulta",
      heroKicker: "Un espacio de trabajo para citas judiciales", factLocal: "Su texto pegado se queda en este navegador",
      factNoLookup: "Cada caso se busca por volumen y página", factCli: "Solo existencia y nombre del caso. No la vigencia",
      trustSummary: "Límites importantes — léalos", primaryTask: "Tarea principal",
      checkerTitle: "Extraer citas de un documento", checkerDescription: "Pegue texto jurídico o cargue un archivo de texto plano. Revise las citas extraídas y abra cada fuente para comprobarla usted mismo.",
      inputLabel: "Texto del documento", inputMeta: "El texto se procesa en este navegador",
      inputHint: "Su documento se queda en este navegador. Para comprobar una cita judicial, esta p\u00e1gina env\u00eda solo esa cita (volumen, repertorio y p\u00e1gina) a este sitio, que consulta CourtListener. No env\u00eda el resto de este texto a ning\u00fan sitio.",
      uploadFile: "Cargar archivo .txt", trySample: "Probar un ejemplo", clearInput: "Borrar texto",
      resultsHeading: "Citas extraídas", resultsPlaceholder: "Aquí aparecerán las citas extraídas.",
      resultsPlaceholderHint: "Pegue texto arriba o cargue el ejemplo para empezar.",
      browserModeNotePrefix: "Las filas fuera de la cobertura de búsqueda se marcan NOT_CHECKED. Use los enlaces para comprobarlas a mano. ",
      browserModeNoteLink: "La CLI",
      browserModeNoteSuffix: " solo comprueba en CourtListener si el caso existe y si el nombre coincide. No comprueba leyes, reglamentos, decisiones de BIA o AAO, la INA ni el C.F.R.",
      utilityTool: "Herramienta opcional", querySummary: "Traduzca una consulta al inglés antes de extraer patrones de citas.",
      queryPlaceholder: "El texto original aparecerá aquí después de la extracción.",
      queryHelp: "La traducción automática requiere un endpoint que usted proporcione en el visor de opiniones. Sin él, no se genera una consulta en inglés.",
      translationIntro: "Compare párrafos pegados de una opinión con una traducción automática de un endpoint elegido por usted.",
      opinionLabel: "Texto de la opinión", optionalDaily: "Opcional · guardado en este navegador",
      briefingLocalNote: "Las preferencias se guardan solo en este navegador. Al solicitar el resumen de hoy, se envían a CourtListener cadenas de consulta con el estado, los temas y las citas guardadas.",
      advancedOption: "Verificaci\u00f3n CLI", cliExplanation: "La p\u00e1gina del navegador comprueba las citas judiciales en CourtListener (a trav\u00e9s de este sitio) y las citas I&N Dec. en nuestra biblioteca de la BIA. La CLI puede hacer la misma consulta de CourtListener en su ordenador si usted aporta su propio token; por defecto no env\u00eda el texto del escrito.",
      cliCommandLabel: "Ejecutar en una terminal", copyCommand: "Copiar comando", copiedCommand: "Comando copiado.",
      copyFailed: "No se pudo copiar automáticamente. Seleccione y copie el comando manualmente.", readFullGuide: "Leer las instrucciones de la verificación CLI en GitHub ↗",
      characters: "{n} caracteres", checking: "Extrayendo…", validationEmpty: "Pegue texto o seleccione un archivo .txt antes de extraer las citas.",
      extractionDone: "Extracción completada. Revise cada cita y su enlace de origen.", noCitations: "No se detectaron patrones de citas. Compruebe que el texto incluya una abreviatura de repertorio y un número de página, o pruebe el ejemplo.",
      extractionError: "No se pudieron extraer citas de este texto. Inténtelo de nuevo o cargue un archivo de texto plano.",
      sampleLoaded: "Ejemplo cargado: tres citas reales (un caso federal, una sección de la INA y una decisión de la BIA). Revise el texto y luego extraiga las citas.", cleared: "Se borraron el texto y los resultados.", fileLoaded: "Se cargó {name}.",
      translating: "Solicitud de traducción en curso…", translateNoText: "Pegue primero el texto de la opinión.",
      translateDone: "Vista de traducción actualizada. Revise el original antes de confiar en cualquier traducción.",
      queryEmpty: "Introduzca una consulta en inglés antes de extraer patrones de citas.", queryCopied: "Copiado."
    },
    zh: {
      skipToContent: "跳转到正文", languageLabel: "语言", brandHome: "VerifyCites 首页", navLabel: "主导航", navCheck: "引文核验", navBriefing: "法律简报", navTranslation: "翻译", navCli: "CLI 核查", navImmigration: "移民指南", navBia: "BIA 先例检索", navQuery: "查询翻译",
      heroKicker: "面向判例引文的研究工作台", factLocal: "您粘贴的文本留在此浏览器中",
      factNoLookup: "每个案件按卷和页查找", factCli: "只核实是否存在和案名，不核实是否仍为有效法律",
      trustSummary: "重要限制 — 请先阅读", primaryTask: "主要任务",
      checkerTitle: "从法律文书中提取引文", checkerDescription: "粘贴法律文本或上传纯文本文件。检查提取出的引文，并打开来源链接自行核对。",
      inputLabel: "文书文本", inputMeta: "文本在当前浏览器中处理",
      inputHint: "\u6587\u4e66\u7559\u5728\u60a8\u7684\u6d4f\u89c8\u5668\u4e2d\u3002\u6838\u5b9e\u6cd5\u9662\u5224\u4f8b\u5f15\u7528\u65f6\uff0c\u672c\u9875\u53ea\u628a\u8be5\u5f15\u7528\uff08\u5377\u3001\u51fa\u7248\u7269\u548c\u9875\uff09\u53d1\u9001\u5230\u672c\u7ad9\uff0c\u7531\u672c\u7ad9\u8be2\u95ee CourtListener\u3002\u6587\u672c\u7684\u5176\u4f59\u90e8\u5206\u4e0d\u4f1a\u53d1\u9001\u5230\u4efb\u4f55\u5730\u65b9\u3002",
      uploadFile: "上传 .txt 文件", trySample: "试用示例", clearInput: "清除文本",
      resultsHeading: "提取出的引文", resultsPlaceholder: "提取出的引文会显示在这里。",
      resultsPlaceholderHint: "先粘贴文本，或载入示例内容。",
      browserModeNotePrefix: "超出查找覆盖范围的行标为 NOT_CHECKED。请通过链接手动核对。",
      browserModeNoteLink: "CLI",
      browserModeNoteSuffix: " 只在 CourtListener 中核查判例是否存在以及案名是否一致，不核查法规、BIA、AAO、INA 或 C.F.R.。",
      utilityTool: "辅助工具", querySummary: "先将查询词译为英文，再提取其中的引文格式。",
      queryPlaceholder: "提取后，原始文本会显示在这里。",
      queryHelp: "自动翻译需要使用下方判决意见翻译器中的自定义端点。未设置端点时，不会生成英文查询。",
      translationIntro: "将粘贴的判决意见段落与您指定端点返回的机器译文对照阅读。",
      opinionLabel: "判决意见文本", optionalDaily: "可选 · 仅保存在此浏览器",
      briefingLocalNote: "偏好仅存于此浏览器。请求今日简报时，已保存的州、主题和引文查询字符串会发送给 CourtListener。",
      advancedOption: "CLI \u6838\u67e5", cliExplanation: "\u6d4f\u89c8\u5668\u9875\u9762\u901a\u8fc7\u672c\u7ad9\u7528 CourtListener \u6838\u5b9e\u6cd5\u9662\u5224\u4f8b\u5f15\u7528\uff0c\u5e76\u7528\u6211\u4eec\u7684 BIA \u5e93\u6838\u5b9e I&N Dec. \u5f15\u7528\u3002CLI \u5728\u60a8\u63d0\u4f9b\u81ea\u5df1\u7684\u4ee4\u724c\u65f6\uff0c\u53ef\u5728\u60a8\u7684\u7535\u8111\u4e0a\u505a\u540c\u6837\u7684 CourtListener \u6838\u5b9e\uff1b\u9ed8\u8ba4\u4e0d\u53d1\u9001\u6587\u4e66\u6587\u672c\u3002",
      cliCommandLabel: "在终端中运行", copyCommand: "复制命令", copiedCommand: "命令已复制。",
      copyFailed: "无法自动复制，请手动选中并复制命令。", readFullGuide: "在 GitHub 阅读 CLI 核查说明 ↗",
      characters: "{n} 个字符", checking: "正在提取……", validationEmpty: "请先粘贴文本或选择 .txt 文件，再提取引文。",
      extractionDone: "提取完成。请逐条查看引文和来源链接。", noCitations: "未识别到引文格式。请确认文本含有判例汇编简称和页码，或试用示例。",
      extractionError: "无法从这段文本中提取引文。请重试或上传纯文本文件。",
      sampleLoaded: "示例已载入：三条真实引用（一个联邦判例、一条 INA 条款、一个 BIA 决定）。请检查文本，再提取引文。", cleared: "已清除输入和结果。", fileLoaded: "已载入 {name}。",
      translating: "正在请求翻译……", translateNoText: "请先粘贴判决意见文本。",
      translateDone: "对照视图已更新。依赖任何译文前，请先阅读原文。", queryEmpty: "请输入英文查询，再提取其中的引文格式。", queryCopied: "已复制。"
    }
  };

  function lang() { return window.currentLang && COPY[window.currentLang] ? window.currentLang : "en"; }
  function text(key, values) {
    var value = COPY[lang()][key] || COPY.en[key] || key;
    Object.keys(values || {}).forEach(function (k) { value = value.replace("{" + k + "}", String(values[k])); });
    return value;
  }
  function applyCopy() {
    document.querySelectorAll("[data-copy]").forEach(function (el) {
      var value = text(el.getAttribute("data-copy"));
      if (value) el.textContent = value;
    });
    document.querySelectorAll("[data-aria-copy]").forEach(function (el) {
      el.setAttribute("aria-label", text(el.getAttribute("data-aria-copy")));
    });
    updateCharCount();
    updateResultLabels();
  }
  function setFeedback(message, kind) {
    var el = document.getElementById("check-feedback");
    if (!el) return;
    el.textContent = message || "";
    el.className = "feedback-line" + (kind ? " is-" + kind : "");
    el.hidden = !message;
  }
  function updateCharCount() {
    var input = document.getElementById("input");
    var output = document.getElementById("char-count");
    if (input && output) output.textContent = text("characters", { n: (input.value || "").length });
  }
  function updateResultLabels() {
    var headers = Array.prototype.map.call(document.querySelectorAll(".results-table thead th"), function (th) { return th.textContent.trim(); });
    document.querySelectorAll("#results tr").forEach(function (tr, idx) {
      var cells = tr.querySelectorAll("td");
      cells.forEach(function (td, i) { if (headers[i]) td.setAttribute("data-label", headers[i]); });
      if (cells.length >= 5) {
        var res = (window.__lastResults || [])[idx];
        if (res && typeof window.vfStatusHtml === "function") cells[3].innerHTML = window.vfStatusHtml(res);
      }
    });
    var trHeaders = [
      (window.T && T().transOriginal) || "Original",
      (window.T && T().transTranslation) || "Translation"
    ];
    document.querySelectorAll("#transResults tr").forEach(function (tr) {
      tr.querySelectorAll("td").forEach(function (td, i) { if (trHeaders[i]) td.setAttribute("data-label", trHeaders[i]); });
    });
  }
  function syncResults(results) {
    var hasResults = !!(results && results.length);
    var wrap = document.getElementById("resultsWrap");
    var empty = document.getElementById("resultsEmpty");
    var copy = document.getElementById("copyMarkdownBtn");
    var json = document.getElementById("downloadJsonBtn");
    if (wrap) wrap.hidden = !hasResults;
    if (empty) {
      empty.hidden = hasResults;
      var strong = empty.querySelector("strong");
      var hint = empty.querySelector("p");
      if (strong) strong.textContent = window.__hasRunExtraction ? text("noCitations") : text("resultsPlaceholder");
      if (hint) hint.textContent = window.__hasRunExtraction ? "" : text("resultsPlaceholderHint");
    }
    if (copy) copy.disabled = !hasResults;
    if (json) json.disabled = !hasResults;
    updateResultLabels();
  }

  var oldRender = window.render;
  window.render = function (results) {
    oldRender(results);
    syncResults(results || []);
  };
  var oldSetLang = window.setLang;
  window.setLang = function (selected) {
    oldSetLang(selected);
    applyCopy();
    syncResults(window.__lastResults || []);
    updateResultLabels();
  };

  var oldCheck = window.check;
  window.check = async function () {
    var input = document.getElementById("input");
    var error = document.getElementById("validation-error");
    var btn = document.getElementById("checkBtn");
    var value = input ? input.value.trim() : "";
    if (!value) {
      if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
      if (error) { error.textContent = text("validationEmpty"); error.hidden = false; }
      setFeedback(text("validationEmpty"), "error");
      return;
    }
    if (input) input.removeAttribute("aria-invalid");
    if (error) error.hidden = true;
    if (btn) { btn.disabled = true; btn.textContent = text("checking"); }
    setFeedback(text("checking"), "neutral");
    try {
      await oldCheck();
      window.__hasRunExtraction = true;
      var results = window.__lastResults || [];
      if (results.length) setFeedback(text("extractionDone"), "success");
      else setFeedback(text("noCitations"), "neutral");
      syncResults(results);
    } catch (e) {
      window.__hasRunExtraction = true;
      setFeedback(text("extractionError"), "error");
      syncResults([]);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = (window.T && T().check) || text("checking"); }
    }
  };

  var oldSearchEnQuery = window.searchEnQuery;
  window.searchEnQuery = function () {
    var query = document.getElementById("enQuery");
    var status = document.getElementById("queryStatus");
    if (!query || !query.value.trim()) {
      if (query) { query.setAttribute("aria-invalid", "true"); query.focus(); }
      if (status) status.textContent = text("queryEmpty");
      return;
    }
    query.removeAttribute("aria-invalid");
    oldSearchEnQuery();
    window.__hasRunExtraction = true;
    syncResults(window.__lastResults || []);
  };

  var oldOpenFile = window.openFile;
  window.openFile = function (input) {
    var file = input && input.files && input.files[0];
    if (file) {
      var status = document.getElementById("file-status");
      if (status) status.textContent = text("fileLoaded", { name: file.name });
    }
    return oldOpenFile(input);
  };

  window.loadSample = function () {
    var input = document.getElementById("input");
    if (!input) return;
    // B11: three real citations (federal case, INA section, BIA precedent); official links in #sample-sources.
    input.value = "Brown v. Board of Education, 347 U.S. 483 (1954).\nINA § 208(a)(1).\nMatter of Acosta, 19 I&N Dec. 211 (BIA 1985).";
    var sources = document.getElementById("sample-sources");
    if (sources) sources.hidden = false;
    input.removeAttribute("aria-invalid");
    var error = document.getElementById("validation-error");
    if (error) error.hidden = true;
    updateCharCount();
    setFeedback(text("sampleLoaded"), "success");
    input.focus();
  };
  window.clearInput = function () {
    var input = document.getElementById("input");
    if (input) { input.value = ""; input.removeAttribute("aria-invalid"); }
    var file = document.getElementById("briefFile");
    if (file) file.value = "";
    var fileStatus = document.getElementById("file-status");
    if (fileStatus) fileStatus.textContent = "";
    var sources = document.getElementById("sample-sources");
    if (sources) sources.hidden = true;
    var error = document.getElementById("validation-error");
    if (error) error.hidden = true;
    var count = document.getElementById("count");
    if (count) count.textContent = "";
    var empty = document.getElementById("resultsEmpty");
    if (empty) { empty.hidden = false; var strong = empty.querySelector("strong"); var hint = empty.querySelector("p"); if (strong) strong.textContent = text("resultsPlaceholder"); if (hint) hint.textContent = text("resultsPlaceholderHint"); }
    var tbody = document.getElementById("results");
    if (tbody) tbody.innerHTML = "";
    window.__lastResults = [];
    window.__hasRunExtraction = false;
    var reportSection = document.getElementById("reportSection");
    if (reportSection) reportSection.hidden = true;
    syncResults([]);
    setFeedback(text("cleared"), "neutral");
    updateCharCount();
    if (input) input.focus();
  };

  var oldTranslate = window.doTranslate;
  window.doTranslate = async function () {
    var source = document.getElementById("opinion");
    var status = document.getElementById("transStatus");
    var btn = document.getElementById("translateBtn");
    if (!source || !source.value.trim()) {
      if (status) status.textContent = text("translateNoText");
      if (source) { source.focus(); source.setAttribute("aria-invalid", "true"); }
      return;
    }
    source.removeAttribute("aria-invalid");
    if (status) status.textContent = text("translating");
    if (btn) btn.disabled = true;
    try {
      await oldTranslate();
      if (status) status.textContent = text("translateDone");
    } catch (e) {
      if (status) status.textContent = text("extractionError");
    } finally {
      if (btn) btn.disabled = false;
      updateResultLabels();
    }
  };

  window.copyCli = async function () {
    var command = document.getElementById("cli-command");
    var button = document.querySelector(".copy-code-button");
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command.textContent);
      if (button) button.textContent = text("copiedCommand");
    } catch (e) {
      if (button) button.textContent = text("copyFailed");
    }
  };

  function openTargetDetails(target) {
    if (!target) return;
    if (target.tagName === "DETAILS") target.open = true;
    var details = target.querySelector && target.querySelector("details");
    if (details) details.open = true;
  }
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function () {
      var target = document.getElementById(decodeURIComponent(link.getAttribute("href").slice(1)));
      openTargetDetails(target);
    });
  });
  window.addEventListener("hashchange", function () {
    // Query strings such as ?ref= are not part of the hash and are not routes.
    try { openTargetDetails(document.getElementById(decodeURIComponent(location.hash.slice(1)))); }
    catch (e) { /* a bad fragment must not stop the page */ }
  });

  document.addEventListener("DOMContentLoaded", function () {
    var stored = "en";
    try {
      var savedLang = localStorage.getItem("vc-lang");
      if (savedLang === "es" || savedLang === "zh") stored = savedLang;
    } catch (e) {}
    setLang(stored);
    applyCopy();
    syncResults([]);
    var disclaimer = document.getElementById("disclaimer");
    if (disclaimer && window.matchMedia && window.matchMedia("(max-width: 680px)").matches) disclaimer.open = false;
    var input = document.getElementById("input");
    if (input) input.addEventListener("input", updateCharCount);
    var file = document.getElementById("briefFile");
    var upload = document.querySelector('label[for="briefFile"]');
    if (file && upload) {
      file.addEventListener("focus", function () { upload.classList.add("focus-visible"); });
      file.addEventListener("blur", function () { upload.classList.remove("focus-visible"); });
    }
    var translatorBtn = document.querySelector('button[onclick="doTranslate()"]');
    if (translatorBtn) translatorBtn.id = "translateBtn";
    if (location.hash) {
      try { openTargetDetails(document.getElementById(decodeURIComponent(location.hash.slice(1)))); }
      catch (e) { /* a bad fragment must not stop the page */ }
    }
  });
})();
