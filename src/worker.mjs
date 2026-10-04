import { openDocument, applyReview } from "./core.mjs";
self.onmessage = async ({ data }) => {
  try {
    if (data.kind === "open") {
      const doc = await openDocument(data.bytes);
      self.postMessage({
        id: data.id,
        ok: true,
        model: Object.fromEntries(
          Object.entries(doc).filter(([k]) => !k.startsWith("_")),
        ),
      });
    } else if (data.kind === "apply") {
      const result = await applyReview(data.bytes, data.packet);
      self.postMessage({ id: data.id, ok: true, result }, [
        result.bytes.buffer,
      ]);
    } else throw Error("Unknown worker request");
  } catch (e) {
    self.postMessage({
      id: data.id,
      ok: false,
      error: { code: e.code ?? "PROCESSING_ERROR", message: e.message },
    });
  }
};
