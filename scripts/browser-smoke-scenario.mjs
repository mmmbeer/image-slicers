export async function browserSmokeScenario() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const failures = [];
  const downloads = [];
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  const originalClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (blob) => {
    const url = originalCreateObjectURL(blob);
    window.__lastObjectUrlBlob = blob;
    return url;
  };
  HTMLAnchorElement.prototype.click = function () {
    downloads.push({
      filename: this.download,
      size: window.__lastObjectUrlBlob?.size || 0,
      type: window.__lastObjectUrlBlob?.type || "",
    });
  };
  
  function makeImageFile(name) {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 72;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ff5964";
    ctx.fillRect(0, 0, 24, 18);
    ctx.fillStyle = "#7ed0ff";
    ctx.fillRect(24, 18, 48, 36);
    ctx.fillStyle = "#a6e3a1";
    ctx.fillRect(72, 54, 24, 18);
    const binary = atob(canvas.toDataURL("image/png").split(",")[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: "image/png" });
  }
  
  async function importByDrop(name) {
    const file = makeImageFile(name);
    await importFilesByDrop([file]);
  }

  async function importFilesByDrop(files) {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    const zone = document.getElementById("dropZone");
    zone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    await wait(250);
  }
  
  function assert(condition, message) {
    if (!condition) failures.push(message);
  }
  
  await importByDrop("smoke-frame.png");
  assert(document.getElementById("emptyState").classList.contains("hidden"), "drop import did not hide empty state");
  assert(!document.getElementById("exportButton").disabled, "export button remained disabled after import");
  assert(Boolean(document.querySelector(".export-preview-dock")), "export preview dock was not created");
  assert(Boolean(document.querySelector(".export-preview-source-hidden .thumb-grid, .export-preview-source-hidden .preview-grid")), "source preview grid was not hidden");
  assert(document.querySelectorAll(".export-preview-dock .export-preview-grid-small canvas").length > 0, "collapsed export dock did not show small preview icons");
  document.querySelector('[data-action="toggle-export-preview"]').click();
  await wait(150);
  assert(document.querySelector(".export-preview-dock").classList.contains("expanded"), "export preview dock did not expand");
  assert(document.querySelectorAll(".export-preview-dock .export-preview-grid-large canvas").length > 0, "expanded export dock did not show large previews");
  document.querySelector('[data-action="large-export-preview"]').click();
  await wait(150);
  assert(document.querySelectorAll(".export-preview-modal .export-preview-grid-large canvas").length > 0, "large export preview modal did not show previews");
  document.querySelector('[data-action="close-large-export-preview"]').click();
  document.querySelector('[data-action="toggle-export-preview"]').click();
  await wait(150);
  
  document.getElementById("exportButton").click();
  await wait(1200);
  assert(downloads.some((item) => item.filename.endsWith("slice_manifest.json") && item.size > 20), "nine slicer JSON export missing");
  assert(downloads.filter((item) => item.filename.endsWith(".png") && item.size > 0).length >= 9, "nine slicer PNG exports missing");
  
  document.getElementById("zipButton").click();
  await wait(800);
  assert(downloads.some((item) => item.filename.endsWith("_nine-slicer.zip") && item.size > 100), "nine slicer ZIP export missing");
  
  document.querySelector('[data-tool-id="icon-sheet"]').click();
  await wait(500);
  assert(document.querySelector('[data-role="source-info"]').textContent.includes("96 x 72"), "icon sheet did not receive current image");
  assert(getComputedStyle(document.querySelector('[data-role="grid-preview"]')).display === "none", "grid preview is visible in single mode");
  assert(getComputedStyle(document.querySelector('[data-role="grid-controls"]')).display === "none", "grid controls are visible in single mode");

  document.querySelector('[data-action="center"]').click();
  document.querySelector('[data-action="rotate-90"]').click();
  document.querySelector('[data-action="flip-x"]').click();
  await wait(300);
  document.getElementById("exportButton").click();
  await wait(500);
  assert(downloads.some((item) => item.filename.endsWith("icon.png") && item.size > 100), "icon sheet single export missing");
  
  document.querySelector('[data-mode="grid"]').click();
  document.querySelector('[data-role="rows"]').value = "2";
  document.querySelector('[data-role="rows"]').dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('[data-role="cols"]').value = "3";
  document.querySelector('[data-role="cols"]').dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('[data-action="toggle-grid-lines"]').click();
  document.querySelector('[data-action="toggle-source-edge"]').click();
  await wait(300);
  const gridPreview = document.querySelector('[data-role="grid-preview"]');
  assert(gridPreview.width > 0, "grid preview did not render");
  assert(document.querySelector('[data-action="toggle-grid-lines"]').classList.contains("active"), "grid lines toggle did not activate");
  assert(document.querySelector('[data-action="toggle-source-edge"]').classList.contains("active"), "source edge toggle did not activate");
  assert(!document.querySelector('[data-role="cell"]'), "grid selected-cell menu was not removed");
  const gridPoint = (sourceX, sourceY) => {
    const rect = gridPreview.getBoundingClientRect();
    return {
      x: rect.left + (sourceX / 96) * rect.width,
      y: rect.top + (sourceY / 72) * rect.height,
    };
  };
  const pointer = (type, point) => gridPreview.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 7,
    clientX: point.x,
    clientY: point.y,
  }));
  const cell2Center = gridPoint(48, 18);
  pointer("pointerdown", cell2Center);
  pointer("pointerup", cell2Center);
  await wait(100);
  assert(!document.querySelector('[data-role="grid-zoom-popover"]').hidden, "cell click did not select a grid cell");
  const otherCellCropEdge = gridPoint(96, 18);
  pointer("pointerdown", otherCellCropEdge);
  pointer("pointerup", otherCellCropEdge);
  await wait(100);
  assert(document.querySelector('[data-role="grid-zoom-popover"]').hidden, "clicking another grid section crop edge did not clear selected grid cell");
  pointer("pointerdown", cell2Center);
  pointer("pointerup", cell2Center);
  await wait(100);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(100);
  assert(document.querySelector('[data-role="grid-zoom-popover"]').hidden, "escape did not clear selected grid cell");
  pointer("pointerdown", cell2Center);
  pointer("pointerup", cell2Center);
  await wait(100);
  const cell2Drag = gridPoint(58, 24);
  pointer("pointerdown", cell2Center);
  pointer("pointermove", cell2Drag);
  pointer("pointerup", cell2Drag);
  document.querySelector('[data-role="cell-zoom"]').value = "1.5";
  document.querySelector('[data-role="cell-zoom"]').dispatchEvent(new Event("input", { bubbles: true }));
  await wait(300);
  pointer("pointerdown", cell2Center);
  pointer("pointerup", cell2Center);
  await wait(100);
  assert(document.querySelector('[data-role="grid-zoom-popover"]').hidden, "clicking selected grid cell did not unselect it");
  const globalStart = gridPoint(16, 18);
  const globalEnd = gridPoint(24, 20);
  pointer("pointerdown", globalStart);
  pointer("pointermove", globalEnd);
  pointer("pointerup", globalEnd);
  await wait(100);
  document.getElementById("zipButton").click();
  await wait(800);
  assert(downloads.some((item) => item.filename.endsWith("_icon-sheet.zip") && item.size > 100), "icon sheet grid ZIP export missing");
  
  document.getElementById("resetButton").click();
  await wait(200);
  assert(document.querySelector('[data-role="rows"]').value === "3", "reset did not restore grid rows");
  
  document.querySelector('[data-tool-id="logo-library"]').click();
  await wait(300);
  assert(document.querySelector('[data-role="source-info"]').textContent.includes("96 x 72"), "logo library did not receive current image");
  document.getElementById("exportButton").click();
  await wait(1400);
  assert(downloads.some((item) => item.filename.endsWith("512x512.png") && item.size > 100), "logo library PNG export missing");
  document.getElementById("zipButton").click();
  await wait(800);
  assert(downloads.some((item) => item.filename.endsWith("_logo-library.zip") && item.size > 100), "logo library ZIP export missing");

  document.querySelector('[data-tool-id="batch-processor"]').click();
  await wait(300);
  await importFilesByDrop([makeImageFile("batch-one.png"), makeImageFile("batch-two.png")]);
  await wait(500);
  assert(document.querySelector('[data-role="batch-info"]').textContent.includes("2 images"), "batch import did not load multiple images");
  document.querySelector('[data-role="step-type"]').value = "text";
  document.querySelector('[data-role="add-step"]').click();
  document.querySelector('[data-role="step-type"]').value = "rename";
  document.querySelector('[data-role="add-step"]').click();
  const renameInputs = [...document.querySelectorAll('.batch-step input[name="pattern"]')];
  renameInputs.at(-1).value = "batch_{{number}}_{{filename}}";
  renameInputs.at(-1).dispatchEvent(new Event("input", { bubbles: true }));
  await wait(700);
  assert(document.querySelector('[data-role="previews"]').textContent.includes("batch_1_batch-one.png"), "batch rename placeholder preview missing");
  document.getElementById("zipButton").click();
  await wait(1200);
  assert(downloads.some((item) => item.filename.endsWith("_batch-processor.zip") && item.size > 100), "batch processor ZIP export missing");

  document.querySelector('[data-tool-id="pattern-builder"]').click();
  await wait(300);
  document.getElementById("resetButton").click();
  await wait(100);
  await importFilesByDrop([makeImageFile("stamp-one.png"), makeImageFile("stamp-two.png")]);
  await wait(600);
  assert(document.querySelectorAll(".pattern-source").length >= 2, "pattern builder did not import multiple source images");
  assert(document.querySelectorAll(".pattern-object-row").length >= 2, "pattern builder did not create editable objects from imported stamps");
  assert(document.querySelector(".pattern-layer .pattern-drag-handle"), "pattern layer drag handle missing");
  assert(document.querySelectorAll(".pattern-layer .pattern-icon-action").length >= 2, "pattern layer icon actions missing");
  document.querySelector('[data-role="tile-size"]').value = "256";
  document.querySelector('[data-role="tile-size"]').dispatchEvent(new Event("change", { bubbles: true }));
  await wait(100);
  const patternCanvas = document.querySelector('[data-role="pattern-canvas"]');
  const patternRect = patternCanvas.getBoundingClientRect();
  const patternPointer = (type, x, y) => patternCanvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 11,
    clientX: x,
    clientY: y,
  }));
  const centerX = patternRect.left + patternRect.width / 2;
  const centerY = patternRect.top + patternRect.height / 2;
  patternPointer("pointerdown", centerX, centerY);
  patternPointer("pointermove", centerX + 122, centerY);
  patternPointer("pointerup", centerX + 122, centerY);
  await wait(250);
  assert(!document.querySelector('[data-role="selected-toolbar"]').hidden, "pattern selected-object toolbar did not show");
  assert(document.querySelector('[data-role="pattern-options"]').textContent.includes("Use the floating toolbar"), "pattern transform controls were not removed from the side panel");
  document.querySelector('[data-action="pattern-preview"]').click();
  await wait(250);
  assert(!document.querySelector('[data-role="pattern-preview-modal"]').hidden, "pattern preview modal did not open");
  assert(document.querySelector('[data-role="pattern-preview-canvas"]').width > 0, "pattern preview modal did not render a repeated canvas");
  assert(Boolean(document.querySelector('[data-role="pattern-boundaries"]')), "pattern preview image-boundary toggle missing");
  document.querySelector('[data-role="pattern-boundaries"]').checked = true;
  document.querySelector('[data-role="pattern-boundaries"]').dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector('[data-role="pattern-preview-zoom"]').value = "1.5";
  document.querySelector('[data-role="pattern-preview-zoom"]').dispatchEvent(new Event("input", { bubbles: true }));
  await wait(100);
  document.querySelector('[data-action="close-pattern-preview"]').click();
  document.querySelector('[data-action="export-png"]').click();
  await wait(500);
  const patternBlob = window.__lastObjectUrlBlob;
  const patternBitmap = await createImageBitmap(patternBlob);
  assert(patternBitmap.width === 256 && patternBitmap.height === 256, "pattern PNG export was not the selected tile size");
  const edgeCanvas = document.createElement("canvas");
  edgeCanvas.width = 256;
  edgeCanvas.height = 256;
  const edgeCtx = edgeCanvas.getContext("2d");
  edgeCtx.drawImage(patternBitmap, 0, 0);
  const leftPixel = edgeCtx.getImageData(4, 128, 1, 1).data;
  const rightPixel = edgeCtx.getImageData(250, 128, 1, 1).data;
  assert(leftPixel[3] > 0 && rightPixel[3] > 0, "pattern object crossing right edge did not wrap to left edge");

  document.getElementById("resetButton").click();
  await wait(150);
  await importFilesByDrop([makeImageFile("stamp-one.png"), makeImageFile("stamp-two.png")]);
  await wait(400);
  document.querySelector('[data-role="tile-size"]').value = "256";
  document.querySelector('[data-role="tile-size"]').dispatchEvent(new Event("change", { bubbles: true }));
  await wait(100);
  document.querySelector('[data-action="open-scatter"]').click();
  await wait(150);
  document.querySelector('[data-scatter="count"]').value = "12";
  document.querySelector('[data-scatter="count"]').dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('[data-scatter="seed"]').value = "4242";
  document.querySelector('[data-scatter="seed"]').dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('[data-action="generate-scatter"]').click();
  await wait(400);
  assert(document.querySelector('[data-role="scatter-modal"]').hidden, "scatter modal did not close after generation");
  document.querySelector('[data-action="open-export-menu"]').click();
  await wait(100);
  assert(!document.querySelector('[data-role="export-menu"]').hidden, "pattern export menu did not open");
  document.querySelector('[data-role="pattern-canvas"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 20, clientY: 20 }));
  await wait(100);
  assert(document.querySelector('[data-role="export-menu"]').hidden, "pattern export menu did not close on outside click");
  document.querySelector('[data-action="open-export-menu"]').click();
  await wait(100);
  document.querySelector('[data-action="export-png"]').click();
  await wait(500);
  const firstScatterBytes = new Uint8Array(await window.__lastObjectUrlBlob.arrayBuffer()).join(",");
  document.getElementById("resetButton").click();
  await wait(150);
  await importFilesByDrop([makeImageFile("stamp-one.png"), makeImageFile("stamp-two.png")]);
  await wait(400);
  document.querySelector('[data-role="tile-size"]').value = "256";
  document.querySelector('[data-role="tile-size"]').dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector('[data-action="open-scatter"]').click();
  await wait(150);
  document.querySelector('[data-scatter="count"]').value = "12";
  document.querySelector('[data-scatter="count"]').dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('[data-scatter="seed"]').value = "4242";
  document.querySelector('[data-scatter="seed"]').dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector('[data-action="generate-scatter"]').click();
  await wait(400);
  document.querySelector('[data-action="open-export-menu"]').click();
  await wait(100);
  document.querySelector('[data-action="export-png"]').click();
  await wait(500);
  const secondScatterBytes = new Uint8Array(await window.__lastObjectUrlBlob.arrayBuffer()).join(",");
  assert(firstScatterBytes === secondScatterBytes, "pattern scatter PNG was not deterministic for the same seed");
  assert(document.querySelectorAll(".pattern-object-row").length >= 12, "pattern scatter did not create logical objects on the selected layer");
  
  return {
    failures,
    downloads,
    scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
  };
}
