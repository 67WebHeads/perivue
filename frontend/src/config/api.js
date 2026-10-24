// Defaults to the same host the page was loaded from, so the app works both on
// this laptop (localhost) and from other devices on the Wi-Fi (e.g. 192.168.1.23).
const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

export default API_BASE_URL;
