import { loadImageFile } from "./core/imageLoader.js";
import * as downloadManager from "./core/downloads.js";
import * as canvasUtils from "./core/canvas.js";
import { getTool, getTools, registerTool } from "./toolRegistry.js";
import { nineSlicerTool } from "./tools/nineSlicer/tool.js";
import { iconSheetTool } from "./tools/iconSheet/tool.js";
import { logoLibraryTool } from "./tools/logoLibrary/tool.js";
import { batchProcessorTool } from "./tools/batchProcessor/tool.js";
import { backgroundRemoverTool } from "./tools/backgroundRemover/tool.js";
import { createToast } from "./ui/toast.js";

registerTool(nineSlicerTool);
registerTool(iconSheetTool);
registerTool(logoLibraryTool);
registerTool(batchProcessorTool);
registerTool(backgroundRemoverTool);

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
    button.innerHTML = `<strong>${tool.name}</strong><span>${tool.description}</span>`;
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
  activeTool = nextTool;
  root.dataset.tool = activeTool.id;
  activeInstance = activeTool.create(context);
  activeToolName.textContent = activeTool.name;
  activeToolDescription.textContent = activeTool.description;

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
    button.textContent = "*";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleCanvasSettings(button);
    });
    firstTitle.append(button);
  }

  applyCanvasHelperSettings();
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
  if (event.key === "Escape") closeCanvasSettings();
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
