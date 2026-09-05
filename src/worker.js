// A near-empty Worker. Every request for a known asset is served
// directly by the Assets binding without touching this function; this
// only runs for paths the binding does not match, at which point it
// returns our 404 page.
//
// The site is static: no rendering here, no cookies, no headers we do
// not want (see the response we build for missing routes).

export default {
  async fetch(request, env) {
    // Delegate to the assets binding one more time; if it also has no
    // match, hand back our styled 404 with the right status code.
    // (Assets fetch here is a no-op unless the binding is configured
    // with `run_worker_first` and the SPA fallback disabled.)
    const url = new URL(request.url);
    return new Response(
      "Not found. See https://blog.ergonia.works/ for the index.\n",
      {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=60",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        },
      },
    );
  },
};
