/**
 * Closes the Sheet on soft navigation: a slot keeps its last page until a
 * route in the slot matches, so every other console path matches this null
 * page (Next parallel routes, "Closing the modal").
 */
export default function SheetCatchAll() {
  return null;
}
