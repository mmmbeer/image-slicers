import { loadImageFile } from "./core/imageLoader.js";
import * as downloadManager from "./core/downloads.js";
import * as canvasUtils from "./core/canvas.js";
import { getTool, getTools, registerTool } from "./toolRegistry.js";
import { nineSlicerTool } from "./tools/nineSlicer/tool.js";
import { iconSheetTool } from "./tools/iconSheet/tool.js";
import { logoLibraryTool } from "./tools/logoLibrary/tool.js";
import { batchProcessorTool } from "./tools/batchProcessor/tool.js";
import { backgroundRemoverTool } from "./tools/backgroundRemover/tool.js";
import { patternBuilderTool } from "./tools/patternBuilder/tool.js";
import { createToast } from "./ui/toast.js";

registerTool(nineSlicerTool);
registerTool(iconSheetTool);
registerTool(logoLibraryTool);
registerTool(batchProcessorTool);
registerTool(backgroundRemoverTool);
registerTool(patternBuilderTool);

const nav = document.getElementById("toolNav");
const root = document.getElementById("toolRoot");
const fileInput = document.getElementById("fileInput");
const resetButton = document.getElementById("resetButton");
const exportButton = document.getElementById("exportButton");
const zipButton = document.getElementById("zipButton");
const activeToolName = document.getElementById("activeToolName");
const activeToolDescription = document.getElementById("activeToolDescription");
const dropZone = document.getElementById("dropZone");
const emptyState = document.getElementById("emptyState");
const toast = document.getElementById("toast");
const statusTool = document.getElementById("statusTool");
const statusFile = document.getElementById("statusFile");
const statusDimensions = document.getElementById("statusDimensions");
const statusExports = document.getElementById("statusExports");
const statusMode = document.getElementById("statusMode");

let activeTool = null;
let activeInstance = null;
let currentAsset = null;
const toastService = createToast(toast);
const helperSettings = readHelperSettings();
let settingsPopover = null;
let exportPreviewDock = null;
let exportPreviewModal = null;

const assetIcon = (name) => `./src/assets/${name}.png`;
const toolIcons = {
  "icon-sheet": "icon-grid",
  "batch-processor": "batch",
  "logo-library": "icon",
  "nine-slicer": "view",
  "background-remover": "eye",
  "pattern-builder": "icon-grid",
};

const context = {
  imageLoader: { loadImageFile },
  downloadManager,
  canvasUtils,
  notify,
  setDirtyState: updateExportState,
  setEmptyStateHidden(hidden) {
    emptyState.classList.toggle("hidden", hidden);
  },
};

function notify(message) {
  toastService.show(message);
  updateStatus(message);
}

function renderNav() {
  nav.innerHTML = "";
  for (const tool of getTools()) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.toolId = tool.id;
    const icon = toolIcons[tool.id] || "icon";
    button.innerHTML = `<img src="${assetIcon(icon)}" alt="" aria-hidden="true" /><strong>${tool.name}</strong><span>${tool.description}</span>`;
    button.title = tool.name;
    button.addEventListener("click", () => selectTool(tool.id));
    nav.append(button);
  }
}

function selectTool(id) {
  const nextTool = getTool(id);
  if (!nextTool || nextTool.id === activeTool?.id) return;

  activeInstance?.unmount?.();
  root.innerHTML = "";
  closeCanvasSettings();
  closeExportPreviewModal();
  exportPreviewDock = null;
  activeTool = nextTool;
  root.dataset.tool = activeTool.id;
  activeInstance = activeTool.create(context);
  if (activeToolName) activeToolName.textContent = activeTool.name;
  if (activeToolDescription) activeToolDescription.textContent = activeTool.description;

  for (const button of nav.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.toolId === activeTool.id);
  }

  activeInstance.mount(root);
  decorateMountedTool();
  if (currentAsset) {
    activeInstance.loadImage(currentAsset);
  }
  emptyState.classList.toggle("hidden", Boolean(currentAsset) || activeInstance.handlesOwnImports);
  updateExportState();
  updateStatus("Ready");
}

async function loadFile(file) {
  try {
    currentAsset = await loadImageFile(file);
    activeInstance?.loadImage(currentAsset);
    emptyState.classList.add("hidden");
    notify(`Loaded ${currentAsset.fileName}`);
    updateExportState();
  } catch (error) {
    notify(error.message);
  }
}

function getExportItems() {
  if (!activeInstance?.getExportItems) return [];
  try {
    return activeInstance.getExportItems() || [];
  } catch (error) {
    notify(error.message);
    return [];
  }
}

function updateExportState() {
  const hasItems = getExportItems().length > 0;
  exportButton.disabled = !hasItems;
  zipButton.disabled = !hasItems;
  updateStatus();
  applyCanvasHelperSettings();
  refreshExportPreviewDock();
}

function updateStatus(message = null) {
  const exportCount = getExportItems().length;
  statusTool.textContent = `Tool: ${activeTool?.name || "-"}`;
  statusFile.textContent = `File: ${currentAsset?.fileName || "none"}`;
  statusDimensions.textContent = currentAsset ? `Image: ${currentAsset.width} x ${currentAsset.height}` : "Image: -";
  statusExports.textContent = `Exports: ${exportCount}`;
  statusMode.textContent = message || (exportCount ? "Export ready" : "Ready");
}

function decorateMountedTool() {
  const settingsPane = root.querySelector(".settings-pane");
  if (settingsPane && !settingsPane.querySelector(".tool-options-header")) {
    const header = document.createElement("div");
    header.className = "tool-options-header";
    header.innerHTML = `<strong>${activeTool.name}</strong><span>${activeTool.description}</span>`;
    settingsPane.prepend(header);
  }

  const firstTitle = root.querySelector(".editor-pane .pane-title");
  if (firstTitle && !firstTitle.querySelector("[data-action='canvas-settings']")) {
    const button = document.createElement("button");
    button.className = "icon-button canvas-settings-button";
    button.type = "button";
    button.dataset.action = "canvas-settings";
    button.setAttribute("aria-label", "Canvas settings");
    button.title = "Canvas settings";
    button.innerHTML = `<img src="${assetIcon("settings")}" alt="" aria-hidden="true" />`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleCanvasSettings(button);
    });
    firstTitle.append(button);
  }

  decorateResultPanels();
  applyCanvasHelperSettings();
}

function decorateResultPanels() {
  refreshExportPreviewDock();
}

function readHelperSettings() {
  try {
    return {
      transparency: true,
      grid: false,
      dimensions: true,
      outline: true,
      ...(JSON.parse(localStorage.getItem("imaginarium.canvasHelpers") || "{}")),
    };
  } catch {
    return { transparency: true, grid: false, dimensions: true, outline: true };
  }
}

function saveHelperSettings() {
  localStorage.setItem("imaginarium.canvasHelpers", JSON.stringify(helperSettings));
}

function applyCanvasHelperSettings() {
  for (const stage of root.querySelectorAll(".canvas-stage")) {
    stage.classList.toggle("show-transparency", helperSettings.transparency);
    stage.classList.toggle("show-grid", helperSettings.grid);
    stage.classList.toggle("show-dimensions", helperSettings.dimensions);
    stage.classList.toggle("show-outline", helperSettings.outline);
    const canvas = stage.querySelector("canvas");
    const label = currentAsset ? `${currentAsset.width} x ${currentAsset.height}` : canvas ? `${canvas.width} x ${canvas.height}` : "No image";
    stage.dataset.canvasLabel = label;
  }
}

function toggleCanvasSettings(anchor) {
  if (settingsPopover) {
    closeCanvasSettings();
    return;
  }
  settingsPopover = document.createElement("div");
  settingsPopover.className = "canvas-settings-popover";
  settingsPopover.setAttribute("role", "dialog");
  settingsPopover.setAttribute("aria-label", "Canvas helper settings");
  settingsPopover.innerHTML = `
    <div class="popover-title">Canvas Helpers</div>
    ${toggleTemplate("transparency", "Transparency background")}
    ${toggleTemplate("grid", "Show grid")}
    ${toggleTemplate("dimensions", "Show dimensions")}
    ${toggleTemplate("outline", "Show canvas outline")}
  `;
  root.append(settingsPopover);
  const rect = anchor.getBoundingClientRect();
  const hostRect = root.getBoundingClientRect();
  settingsPopover.style.top = `${Math.max(8, rect.bottom - hostRect.top + 8)}px`;
  settingsPopover.style.left = `${Math.min(hostRect.width - 242, Math.max(8, rect.right - hostRect.left - 240))}px`;

  settingsPopover.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = Boolean(helperSettings[input.name]);
    input.addEventListener("change", () => {
      helperSettings[input.name] = input.checked;
      saveHelperSettings();
      applyCanvasHelperSettings();
    });
  });
  setTimeout(() => document.addEventListener("pointerdown", onOutsideCanvasSettings, { capture: true }), 0);
}

function toggleTemplate(name, label) {
  return `<label class="toggle popover-toggle"><input type="checkbox" name="${name}" /><span>${label}</span></label>`;
}

function onOutsideCanvasSettings(event) {
  if (!settingsPopover?.contains(event.target) && !event.target.closest("[data-action='canvas-settings']")) {
    closeCanvasSettings();
  }
}

function closeCanvasSettings() {
  document.removeEventListener("pointerdown", onOutsideCanvasSettings, { capture: true });
  settingsPopover?.remove();
  settingsPopover = null;
}

function copyCanvasPixels(sourceRoot, cloneRoot) {
  const sourceCanvases = [...sourceRoot.querySelectorAll("canvas")];
  const cloneCanvases = [...cloneRoot.querySelectorAll("canvas")];
  sourceCanvases.forEach((sourceCanvas, index) => {
    const cloneCanvas = cloneCanvases[index];
    if (!cloneCanvas) return;
    cloneCanvas.width = sourceCanvas.width;
    cloneCanvas.height = sourceCanvas.height;
    cloneCanvas.getContext("2d").drawImage(sourceCanvas, 0, 0);
  });
}

function getExportPreviewSources() {
  return [...root.querySelectorAll(".thumb-grid, .preview-grid")]
    .filter((grid) => !grid.closest(".export-preview-dock") && !grid.closest(".export-preview-modal"))
    .map((grid) => {
      const panel = grid.closest(".panel");
      const title = panel?.querySelector(".pane-title") || (grid.previousElementSibling?.classList.contains("pane-title") ? grid.previousElementSibling : null);
      return { panel, title, grid };
    })
    .filter(({ title, grid }) => title && grid);
}

function refreshExportPreviewDock() {
  if (!root || !activeTool) return;
  const sources = getExportPreviewSources();
  root.querySelectorAll(".export-preview-source-hidden").forEach((panel) => panel.classList.remove("export-preview-source-hidden"));

  if (!sources.length) {
    exportPreviewDock?.remove();
    exportPreviewDock = null;
    return;
  }

  for (const { panel } of sources) {
    panel?.classList.add("export-preview-source-hidden");
  }

  if (!exportPreviewDock) {
    exportPreviewDock = document.createElement("div");
    exportPreviewDock.className = "export-preview-dock";
    exportPreviewDock.innerHTML = `
      <div class="export-preview-head">
        <div>
          <strong data-role="export-preview-title">Export Preview</strong>
          <span data-role="export-preview-count">0 files</span>
        </div>
        <div class="export-preview-actions">
          <button class="icon-button" type="button" data-action="large-export-preview" title="Open large preview" aria-label="Open large preview">
            <img src="${assetIcon("view")}" alt="" aria-hidden="true" />
          </button>
          <button class="icon-button" type="button" data-action="toggle-export-preview" title="Expand export preview" aria-label="Expand export preview">
            <img src="${assetIcon("up-chevron")}" alt="" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="export-preview-body"></div>
    `;
    root.append(exportPreviewDock);
    exportPreviewDock.querySelector("[data-action='toggle-export-preview']").addEventListener("click", () => {
      exportPreviewDock.classList.toggle("expanded");
      syncExportPreviewToggleIcon();
      refreshExportPreviewDock();
    });
    exportPreviewDock.querySelector("[data-action='large-export-preview']").addEventListener("click", openExportPreviewModal);
  }

  const title = sources[0].title?.querySelector("h2")?.textContent || "Export Preview";
  const count = sources[0].title?.querySelector("[data-role='export-count']")?.textContent
    || sources[0].panel?.querySelector("[data-role='export-count']")?.textContent
    || `${getExportItems().length} files`;
  exportPreviewDock.querySelector("[data-role='export-preview-title']").textContent = title;
  exportPreviewDock.querySelector("[data-role='export-preview-count']").textContent = count;
  renderExportPreviewBody(exportPreviewDock.querySelector(".export-preview-body"), sources, exportPreviewDock.classList.contains("expanded") ? "expanded" : "collapsed");
  syncExportPreviewToggleIcon();
}

function renderExportPreviewBody(container, sources, sizeMode) {
  container.innerHTML = "";
  for (const { grid } of sources) {
    const clone = grid.cloneNode(true);
    clone.classList.add("export-preview-grid", sizeMode === "expanded" ? "export-preview-grid-large" : "export-preview-grid-small");
    copyCanvasPixels(grid, clone);
    container.append(clone);
  }
}

function syncExportPreviewToggleIcon() {
  const button = exportPreviewDock?.querySelector("[data-action='toggle-export-preview']");
  if (!button) return;
  const expanded = exportPreviewDock.classList.contains("expanded");
  button.title = expanded ? "Collapse export preview" : "Expand export preview";
  button.setAttribute("aria-label", button.title);
  button.querySelector("img").src = assetIcon(expanded ? "down-chevron" : "up-chevron");
}

function openExportPreviewModal() {
  const sources = getExportPreviewSources();
  if (!sources.length) return;
  closeExportPreviewModal();
  exportPreviewModal = document.createElement("div");
  exportPreviewModal.className = "export-preview-modal";
  exportPreviewModal.setAttribute("role", "dialog");
  exportPreviewModal.setAttribute("aria-label", "Large export preview");
  exportPreviewModal.innerHTML = `
    <div class="export-preview-modal-card">
      <div class="export-preview-modal-head">
        <strong>Export Preview</strong>
        <button class="icon-button" type="button" data-action="close-large-export-preview" title="Close preview" aria-label="Close preview">
          <img src="${assetIcon("close")}" alt="" aria-hidden="true" />
        </button>
      </div>
      <div class="export-preview-modal-body"></div>
    </div>
  `;
  root.append(exportPreviewModal);
  renderExportPreviewBody(exportPreviewModal.querySelector(".export-preview-modal-body"), sources, "expanded");
  exportPreviewModal.querySelector("[data-action='close-large-export-preview']").addEventListener("click", closeExportPreviewModal);
  exportPreviewModal.addEventListener("pointerdown", (event) => {
    if (event.target === exportPreviewModal) closeExportPreviewModal();
  });
}

function closeExportPreviewModal() {
  exportPreviewModal?.remove();
  exportPreviewModal = null;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
  fileInput.value = "";
});

resetButton.addEventListener("click", () => {
  activeInstance?.reset?.();
  updateExportState();
});

exportButton.addEventListener("click", async () => {
  const items = getExportItems();
  if (!items.length) return;
  try {
    await downloadManager.downloadItems(items);
    notify(`Exported ${items.length} file${items.length === 1 ? "" : "s"}`);
  } catch (error) {
    notify(error.message);
  }
});

zipButton.addEventListener("click", async () => {
  const items = getExportItems();
  if (!items.length) return;
  try {
    const base = downloadManager.safeFilenamePart(currentAsset?.fileName || activeTool.id);
    await downloadManager.downloadZip(items, `${base}_${activeTool.id}.zip`);
    notify(`Created ZIP with ${items.length} files`);
  } catch (error) {
    notify(error.message);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCanvasSettings();
    closeExportPreviewModal();
  }
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const files = [...(event.dataTransfer?.files || [])];
  if (!files.length) return;
  if (activeInstance?.loadFiles) {
    activeInstance.loadFiles(files);
    return;
  }
  loadFile(files[0]);
});

renderNav();
selectTool(getTools()[0]?.id);
