export function role(root, name) {
  return root.querySelector(`[data-role="${name}"]`);
}

export function roles(root, name) {
  return [...root.querySelectorAll(`[data-role="${name}"]`)];
}

export function bindInputEvents(inputs, handler) {
  for (const input of inputs.filter(Boolean)) {
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  }
}

export function bindRangePairs(root) {
  for (const range of root.querySelectorAll('input[type="range"][data-range-input]')) {
    const pair = root.querySelector(`input[data-range-for="${range.dataset.role}"]`);
    if (!pair) continue;
    copyRangeAttributes(range, pair);
    pair.value = range.value;
    range.addEventListener("input", () => {
      pair.value = range.value;
    });
    range.addEventListener("change", () => {
      pair.value = range.value;
    });
    bindInputEvents([pair], () => {
      range.value = pair.value;
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

export function syncRangePairs(root) {
  for (const range of root.querySelectorAll('input[type="range"][data-range-input]')) {
    const pair = root.querySelector(`input[data-range-for="${range.dataset.role}"]`);
    if (pair) pair.value = range.value;
  }
}

export function createPreviewCard(label, tag) {
  const card = document.createElement("div");
  card.className = "preview-card";
  const title = document.createElement("div");
  title.className = "thumb-title";

  if (tag) {
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const tagNode = document.createElement("span");
    tagNode.className = "tag";
    tagNode.textContent = tag;
    title.append(labelNode, tagNode);
  } else {
    title.textContent = label;
  }

  card.append(title);
  return card;
}

export function setWarning(element, messages) {
  const list = Array.isArray(messages) ? messages : [messages].filter(Boolean);
  element.textContent = list.join(" ");
  element.classList.toggle("visible", list.length > 0);
}

function copyRangeAttributes(range, input) {
  for (const name of ["min", "max", "step"]) {
    if (range.hasAttribute(name)) input.setAttribute(name, range.getAttribute(name));
  }
}
