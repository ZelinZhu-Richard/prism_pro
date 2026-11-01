import {
  findPdfMatches,
  type PdfSearchOptions,
  type PdfSearchPage,
} from "./pdf-search";

self.onmessage = async (
  event: MessageEvent<{
    pages: PdfSearchPage[];
    query: string;
    options: PdfSearchOptions;
  }>,
) => {
  try {
    const { pages, query, options } = event.data;
    self.postMessage({ matches: await findPdfMatches(pages, query, options) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Could not search this PDF.",
    });
  }
};
