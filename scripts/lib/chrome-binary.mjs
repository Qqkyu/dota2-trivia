/** The Chrome that the browser checks start. CHROME_BIN selects another binary. */
export const CHROME_BINARY =
  process.env.CHROME_BIN ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
