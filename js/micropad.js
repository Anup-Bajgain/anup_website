const keyMaps = {
  media: ["Previous", "Play / pause", "Next", "Mute", "Switch app", "Stop"],
  productivity: ["Copy", "Paste", "Cut", "Undo", "Switch app", "Save"],
  custom: ["YouTube", "WhatsApp", "Messenger", "Workspace", "Mail", "Text macro"]
};

const modeButtons = document.querySelectorAll(".mode-tabs button");
const keyLabels = document.querySelectorAll(".device-keys .key span");

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const labels = keyMaps[button.dataset.mode];
    if (!labels) return;
    modeButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    keyLabels.forEach((label, index) => {
      label.textContent = labels[index];
    });
  });
});
