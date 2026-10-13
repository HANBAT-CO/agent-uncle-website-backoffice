// Turbopack loader (next.config.ts): appends `options.append` to a stylesheet
// before the next loader (Tailwind) compiles it. Used to add
// `@source not "…";` lines to the landing's src/app/(site)/globals.css at
// build time, so its automatic Tailwind scan skips the console folders while
// the file itself stays byte-identical (backoffice spec D1).
module.exports = function appendCss(source) {
  const { append = "" } = this.getOptions() ?? {};
  return append ? `${source}\n${append}\n` : source;
};
