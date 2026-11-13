export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Warm the AI models shortly after boot (training yields to the event loop, so the server stays responsive).
    setTimeout(async () => {
      try {
        const { warmModels } = await import("@/lib/runtime");
        warmModels();
      } catch (e) {
        console.error("model warm-up failed", e);
      }
    }, 4000);
  }
}
