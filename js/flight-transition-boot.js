// Cover a real page load immediately, until the destination landing is ready.
(() => {
  const key = 'anup-flight-arrival';
  try {
    const ticket = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!ticket) return;
    if (ticket.href !== location.href || Date.now() - ticket.time > 15000 ||
        matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sessionStorage.removeItem(key);
      return;
    }
    document.documentElement.classList.add('flight-pending');
    // Never leave the page covered if a module or graphics driver fails.
    window.flightArrivalGuard = setTimeout(() => {
      document.documentElement.classList.remove('flight-pending');
      sessionStorage.removeItem(key);
    }, 6500);
  } catch { /* Storage may be disabled; ordinary navigation still works. */ }
})();
