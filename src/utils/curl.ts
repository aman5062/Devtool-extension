import type { RequestRecord, Header } from '../types';

export function generateCurl(record: RequestRecord): string {
  let curl = `curl '${record.url}' \\ \n`;
  curl += `  -X '${record.method.toUpperCase()}' \\ \n`;
  
  record.requestHeaders.forEach((h: Header) => {
    // Avoid binary or sensitive headers if needed, but usually we just include all
    curl += `  -H '${h.name}: ${h.value}' \\ \n`;
  });
  
  if (record.requestBody) {
    // Escape single quotes for shell
    const escapedBody = record.requestBody.replace(/'/g, "'\\''");
    curl += `  --data-raw '${escapedBody}' \\ \n`;
  }
  
  return curl.trim().replace(/ \\$/, '');
}
