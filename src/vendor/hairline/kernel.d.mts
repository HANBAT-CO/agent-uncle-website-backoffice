/*
 * Types for the vendored hairline kernel (kernel.mjs). The kernel is the
 * hairline-create skill's kernel.js byte for byte, plus one appended module
 * line ("\nexport default HL;\n": a blank line and the export). Never edit it.
 *
 * Verify (from the repo root; prints OK, then the body hash
 * 3a19aa2640ba8c6c306184d05fddfbd4f3323a6ebd9217dd3cbb38e9db74991c recorded
 * in the kernel's first line):
 *
 *   sed -e '$d' src/vendor/hairline/kernel.mjs | sed -e '$d' \
 *     | cmp - ~/.claude/skills/hairline-create/kernel.js && echo OK
 *   sed -e '1d' -e '$d' src/vendor/hairline/kernel.mjs | sed -e '$d' | shasum -a 256
 *
 * Read the index comment at the top of kernel.mjs for the API (Cam, proj,
 * fit, rings, prism, ringAt, run, facing, poly, open, seg, hull, mk, inject,
 * tour, register, ...).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const HL: any;
export default HL;
