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
    const dt = new DataTransfer();
    dt.items.add(file);
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
  await wait(300);
  const gridPreview = document.querySelector('[data-role="grid-preview"]');
  assert(gridPreview.width > 0, "grid preview did not render");
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
  
  return {
    failures,
    downloads,
    scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
  };
}
