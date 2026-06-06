export function createToast(element, duration = 2800) {
  let timer = 0;

  return {
    show(message) {
      clearTimeout(timer);
      element.textContent = message;
      element.classList.add("visible");
      timer = setTimeout(() => element.classList.remove("visible"), duration);
    },
    clear() {
      clearTimeout(timer);
      element.classList.remove("visible");
      element.textContent = "";
    },
  };
}
