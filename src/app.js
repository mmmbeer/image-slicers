import { loadImageFile } from "./core/imageLoader.js";
import * as downloadManager from "./core/downloads.js";
import * as canvasUtils from "./core/canvas.js";
import { getTool, getTools, registerTool } from "./toolRegistry.js";
import { nineSlicerTool } from "./tools/nineSlicer/tool.js";
import { iconSheetTool } from "./tools/iconSheet/tool.js";
import { logoLibraryTool } from "./tools/logoLibrary/tool.js";

registerTool(nineSlicerTool);
registerTool(iconSheetTool);
registerTool(logoLibraryTool);

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

let activeTool = null;
let activeInstance = null;
let currentAsset = null;
let toastTimer = 0;

const context = {
  imageLoader: { loadImageFile },
  downloadManager,
  canvasUtils,
  notify,
  setDirtyState: updateExportState,
};

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
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
  activeTool = nextTool;
  activeInstance = activeTool.create(context);
  activeToolName.textContent = activeTool.name;
  activeToolDescription.textContent = activeTool.description;

  for (const button of nav.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.toolId === activeTool.id);
  }

  activeInstance.mount(root);
  if (currentAsset) {
    activeInstance.loadImage(currentAsset);
  }
  updateExportState();
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
  const file = event.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

renderNav();
selectTool(getTools()[0]?.id);
