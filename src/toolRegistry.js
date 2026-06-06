const tools = [];

export function registerTool(tool) {
  if (!tool?.id || !tool?.name || typeof tool.create !== "function") {
    throw new Error("Tools must define id, name, and create(context).");
  }
  if (tools.some((item) => item.id === tool.id)) {
    throw new Error(`Duplicate tool id: ${tool.id}`);
  }
  tools.push(tool);
}

export function getTools() {
  return [...tools];
}

export function getTool(id) {
  return tools.find((tool) => tool.id === id) || tools[0] || null;
}
