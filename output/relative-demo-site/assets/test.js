const statusText = document.getElementById("statusText");
const demoButton = document.getElementById("demoButton");

document.body.classList.add("is-ready");

if (demoButton && statusText) {
  demoButton.addEventListener("click", () => {
    const timestamp = new Date().toLocaleTimeString();
    statusText.textContent = `Script loaded successfully at ${timestamp}.`;
  });
}